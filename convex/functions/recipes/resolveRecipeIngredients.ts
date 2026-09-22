import type { Id } from "@convex/_generated/dataModel";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { ActionCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { gradesIn, preservationIn, searchTerms } from "@shared/ingredientMatch";
import type { RecipeUnit } from "@shared/ingredients";

import {
  gatherEvidence,
  resolveWithAgent,
  type IngredientEvidence,
} from "../ingredients/resolveIngredient";

/** One `recipeIngredients` row before it has a recipe to belong to. */
export type RecipeLink = {
  ingredientId: Id<"ingredients">;
  position: number;
  quantity: number;
  unit: RecipeUnit;
};

/**
 * The links, and whether they are the whole answer.
 *
 * `complete` separates the two ways a line ends up unlinked, which look identical in `links` and
 * must not be treated alike:
 *
 * - **Decided.** The resolver refused the name — `not-food`, `not-an-ingredient`, `unreadable`.
 *   That is an answer, and a caller should act on it: the line really does not belong to a row.
 * - **Undecided.** The walk threw (an API down, the model timing out) or the name was dropped by
 *   `MAX_WALKS` / `MAX_JUDGEMENTS`. Nothing was learned, and `links` is short for a reason that has
 *   nothing to do with the recipe.
 *
 * A create may ignore the difference: there is nothing to lose, and an unlinked line is exactly
 * what an unmatched name produced before this slice. An **edit may not** — `updateRecipe` replaces
 * the row's links wholesale, so persisting a short set because Open Food Facts blipped would delete
 * a correct link the first save may have paid a model call and an invented row for.
 */
export type ResolvedLinks = {
  links: RecipeLink[];
  complete: boolean;
};

/**
 * The ctx the fan-out needs, and the reason it is not a plain `ActionCtx`: step 4 of the walk is a
 * model call, attributed to the cook who paid for it when there is one. The import path has none,
 * so the field is optional and `wrapAgent` supplies the component's fallback.
 */
type ResolveCtx = ActionCtx & { userId?: Id<"users"> };

/** Walks in flight. The cook is watching a progress ring, and each walk can cost two API fetches. */
const RESOLVE_CONCURRENCY = 10;

/**
 * How many distinct names one import may walk at all.
 *
 * The outer runaway guard, and the one that bounds the network. A walk that gets past the catalog
 * reaches two shipped datasets and then two live API fetches, so a page that scraped into fifty
 * junk lines would otherwise buy a hundred fetches before `MAX_JUDGEMENTS` below was consulted
 * even once — that cap sits on the model, which is the second half of the walk, and cannot bound
 * the first.
 *
 * Forty is far above the ingredient count of any real recipe, so this never trims a legitimate
 * import; it exists so a pathological one cannot run unbounded.
 */
export const MAX_WALKS = 40;

/**
 * How many of the walked names may go on to the model.
 *
 * A runaway guard, not a budget: twenty is above the ingredient count of essentially any real
 * recipe. Past it a name is left unlinked, which is exactly what an unmatched name did before this
 * slice existed.
 *
 * **It counts judgements, not rows.** `resolveWithAgent` answers `matched` as readily as `created`,
 * so this is an upper bound on inventions rather than a count of them — the model call is what
 * every survivor costs whichever way it answers, and the call is the spend worth bounding. Capping
 * `created` instead would leave the model call itself unbounded, which is the wrong half to free.
 *
 * ⚠️ A name dropped by either cap costs the recipe more than its own link: `computeTags` returns no
 *    tags at all when a line failed to resolve, because a recipe it cannot fully see is one it must
 *    not label vegan. Both numbers are set high enough that a real recipe never reaches them.
 *
 * Exported so its test pins the cap rather than a copy of the number.
 */
export const MAX_JUDGEMENTS = 20;

/**
 * The key two ingredient lines share when they name the same food.
 *
 * `searchTerms` is the fold the ranker itself retrieves with — accents, case, plurals and
 * punctuation all gone — so `Oignons` and `oignon` collapse, which is the point.
 *
 * The grades are re-attached because `searchTerms` deliberately drops them and here that would be
 * wrong in a way it is not there: `steak haché 5%` and `steak haché 20%` are two foods to
 * `resolveIngredient` (ADR 0011), and folding them together would resolve one and link the other
 * to it. Retrieval may ignore a grade; identity may not.
 *
 * The preservation words come back for exactly the same reason, one step further out: `searchTerms`
 * treats `séchées` as a preparation and strips it, so `tomates` and `tomates séchées` would be one
 * key, walked once, with both lines linked to whichever row that walk returned — the second line
 * then carrying the first's nutrition, which for a dried food is out by an order of magnitude, and
 * one grocery line where the cook needs two. `preservationIn` names the short list and says why
 * `frozen`, `en conserve` and `fresh` are not on it.
 */
export const foldedIngredientName = (name: string): string =>
  [searchTerms(name), ...gradesIn(name), ...preservationIn(name)].join(" ").trim();

/**
 * The key a line is walked under: the fold when it says anything, the raw name when it does not.
 *
 * `searchTerms` reduces to `[a-z0-9]`, so it empties for a name carrying no Latin letters at all —
 * `醤油`, `мука`, `λάδι` — and for one that was only a quantity (`500`). Keying those on `""` would
 * collapse every one of them onto a single entry and hand them all the same catalog row.
 *
 * ⚠️ Falling back rather than SKIPPING the line, which is what this did first and was wrong in a
 *    way worth recording. An empty fold is not a verdict: the catalog cannot retrieve on it, but
 *    the shipped datasets, the live APIs and the model all still can, and `醤油` is a real
 *    ingredient the resolver should be allowed to answer. Skipping it also reported the line as
 *    decided, so an edit read the missing link as a real absence and wiped every tag on the recipe.
 *
 *    A name that genuinely says nothing still reaches `gatherEvidence`, which refuses a blank as
 *    `unreadable` — a decision, made by the step that owns making it.
 */
const _keyOf = (name: string): string => foldedIngredientName(name) || name.trim().toLowerCase();

/**
 * `Promise.allSettled` with a ceiling on how many run at once.
 *
 * Settled and not `all`, because a line may fail and the recipe may not: a model outage or an API
 * throwing through yields no link for that name and leaves every other name alone — which is
 * precisely what an unmatched name already did, so the failure mode of this file is the status
 * quo rather than a lost recipe.
 */
const _settledWithLimit = async <T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> => {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;

  const worker = async () => {
    for (let index = next++; index < items.length; index = next++) {
      try {
        results[index] = { status: "fulfilled", value: await run(items[index]!) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  return results;
};

type Args = {
  /** Only the lines are read. Narrowed so the catalog restore, which has no generation, can call this. */
  recipe: Pick<SanitizedRecipe, "ingredients">;
  locale: Locale;
};

/**
 * Every ingredient line a recipe has, turned into the catalog row it belongs to — creating that
 * row when the catalog has never held the food.
 *
 * This is why recipe resolution had to move out of the mutation and up into the action: linking a
 * name may hit two datasets, two live APIs and a model, and a mutation may do none of those. The
 * matcher it replaces ran inside the mutation and could therefore only ever find a row that already
 * existed, in one language — so a recipe naming a food the catalog did not hold silently lost that
 * line: no nutrition, no grocery line, no pantry deduction, and nothing on screen to say so.
 *
 * **Cheapest first, in two passes, because the cap has to be countable.** Pass one runs
 * `gatherEvidence` for each of the first `MAX_WALKS` distinct names: the catalog, the shipped
 * datasets and the live APIs, no model and no write. Pass two spends the model only on the names
 * that survived that, and only on the first `MAX_JUDGEMENTS` of them. You cannot cap what you
 * cannot count, and a name is only known to need a judgement once the cheap steps have declined it.
 *
 * The two caps bound different resources and neither substitutes for the other: `MAX_WALKS` bounds
 * the network, `MAX_JUDGEMENTS` bounds the model.
 *
 * ⚠️ **Two names for one food, both unknown, each invent their own row.** `courgette` and
 *    `zucchini` in one recipe fold to different keys and walk separately — correctly, since nothing
 *    yet knows they are the same food. Both decline every cheap step, both reach the model, and
 *    `createIngredient` is a bare insert with no dedup key by design (see its note), so one
 *    vegetable ends up with two permanent rows, each having paid for its own image generation, and
 *    the pantry then holds one while a recipe asks for the other.
 *
 *    Serializing pass two does NOT fix this, and was tried: `resolveWithAgent` is handed the
 *    `candidates` list snapshotted in pass one and never re-reads the catalog, so the second
 *    judgement cannot see the row the first just wrote however long it waits — it only pays for
 *    the waiting. The fix has to be at the write: re-check the catalog INSIDE the create mutation,
 *    where Convex's transactionality makes a read-then-insert a real guard rather than a smaller
 *    window. That lives in `createIngredient`, needs an index to read by, and closes the same race
 *    between two SHOPPERS — the trade `createIngredient` already records and accepts — in one go.
 *
 * **The line's own numbers win.** `resolveIngredient` also answers `defaultUnit` and
 * `defaultQuantity` — how the food is *bought*, which is the navigation bar's question. A recipe
 * states its own amount, so those two are read and discarded here. Using them would rewrite
 * `200 g de farine` into one bag of flour.
 *
 * **A name is walked once; a line still links once.** A recipe listing `oignon` twice buys one
 * walk, and both lines come back as their own link, each with its own position, quantity and unit.
 */
export const resolveRecipeIngredients = async (
  ctx: ResolveCtx,
  { recipe, locale }: Args,
): Promise<ResolvedLinks> => {
  const folded = recipe.ingredients.map(({ name }) => _keyOf(name));

  /** The spelling each distinct name is walked with — the first line that used it. */
  const spellings = new Map<string, string>();
  /**
   * Every unit the lines under one key are written in. Handed to the model when it invents the
   * row, so the row is born able to weigh the line that asked for it — `1 pcs carotte` and
   * `200 g carotte` fold onto one walk and the row has to answer both.
   */
  const units = new Map<string, Set<RecipeUnit>>();
  recipe.ingredients.forEach((line, index) => {
    const key = folded[index]!;
    if (!spellings.has(key)) spellings.set(key, line.name);
    (units.get(key) ?? units.set(key, new Set()).get(key)!).add(line.unit);
  });

  const linked = new Map<string, Id<"ingredients">>();
  const distinct = [...spellings.keys()];
  const toWalk = distinct.slice(0, MAX_WALKS);

  /**
   * Set by anything that leaves a name UNANSWERED — a cap that dropped it, or a walk that threw.
   * A refusal never sets it: that is an answer, and the caller should act on it.
   */
  let undecidedRemains = distinct.length > MAX_WALKS;

  // Pass one — free. Nothing here calls a model and nothing here writes.
  const gathered = await _settledWithLimit(toWalk, RESOLVE_CONCURRENCY, async (key) => {
    const text = spellings.get(key)!;
    return { key, text, ...(await gatherEvidence(ctx, { text, locale })) };
  });

  const undecided: { key: string; text: string; evidence: IngredientEvidence }[] = [];

  for (const outcome of gathered) {
    if (outcome.status === "rejected") {
      undecidedRemains = true;
      continue;
    }

    const { key, text, resolved, evidence } = outcome.value;
    if (!resolved) undecided.push({ key, text, evidence });
    else if (resolved.status !== "refused") linked.set(key, resolved.ingredientId);
  }

  if (undecided.length > MAX_JUDGEMENTS) undecidedRemains = true;

  // Pass two — the model, for as many survivors as one import is allowed to buy judgements for.
  const judged = await _settledWithLimit(
    undecided.slice(0, MAX_JUDGEMENTS),
    RESOLVE_CONCURRENCY,
    async ({ key, text, evidence }) => ({
      key,
      resolved: await resolveWithAgent(ctx, {
        text,
        locale,
        evidence,
        units: [...(units.get(key) ?? [])],
      }),
    }),
  );

  for (const outcome of judged) {
    if (outcome.status === "rejected") {
      undecidedRemains = true;
      continue;
    }

    const { key, resolved } = outcome.value;
    if (resolved.status !== "refused") linked.set(key, resolved.ingredientId);
  }

  // Built off the LINE and not off the resolved names: `position` indexes back into the recipe the
  // cook reads, and a food used twice is two rows at two positions.
  const links = recipe.ingredients.flatMap((line, index): RecipeLink[] => {
    const ingredientId = linked.get(folded[index]!);
    if (!ingredientId) return [];

    return [{ ingredientId, position: index, quantity: line.quantity, unit: line.unit }];
  });

  return { links, complete: !undecidedRemains };
};
