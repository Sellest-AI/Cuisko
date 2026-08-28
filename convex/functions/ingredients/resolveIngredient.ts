import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeIngredient } from "@convex/agent/tools/sanitizeIngredient";
import type { ActionCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { CONFIDENT, gradesIn, MARGIN } from "@shared/ingredientMatch";
import type { IngredientSource, Unit } from "@shared/ingredients";

import { compositionOf } from "./lookup/composition";
import { searchFoodDataCentral } from "./lookup/foodDataCentral";
import { aboutTheSameFood, spellingsOfHit, type LookupHit } from "./lookup/lookupHit";
import { searchOpenFoodFacts } from "./lookup/openFoodFacts";
import { findInTaxonomy, namesOf, spellingsOf } from "./lookup/taxonomy";
import type { WidenedCandidate } from "./searchWidened";

/**
 * How the resolved food is bought — the unit a shop sells it in, and how much of it a line means.
 *
 * Returned on both arms that produce a row, because the CLIENT cannot know it: the placeholder
 * card goes up on the gesture, seconds before there is any row to read it off, so a shopper who
 * typed no unit would otherwise be billed the navigation bar's own guess of one piece. Nobody
 * buys one gnocchi, and nobody buys one crème de marrons.
 */
type Purchase = { defaultUnit: Unit; defaultQuantity: number };

/**
 * What free text resolved to.
 *
 * Three cases and not an id-or-null, for the reason `MatchedIngredient` gives: the caller has to
 * *do* something different in each, and a nullable id pushes that decision to every call site.
 * `matched` and `created` both put a real line on the list; `refused` turns the placeholder card
 * into something the shopper can read.
 *
 * `matched` and `created` are separated even though the caller adds the line the same way, because
 * only one of them just grew the catalog — that is what a later screen has to be able to say, and
 * what makes "the resolver invented a row" countable rather than inferred from a timestamp.
 *
 * `refused` carries why, because "we will not add dishwashing liquid yet" and "we could not read
 * that" are different things to say to a shopper.
 */
export type ResolvedIngredient =
  | ({ status: "matched"; ingredientId: Id<"ingredients">; name: string } & Purchase)
  | ({
    status: "created";
    ingredientId: Id<"ingredients">;
    name: string;
    /**
     * Where the row's numbers actually came from — `provenanceOf`. Returned rather than left for
     * a re-read because it is the one thing a caller cannot see from the id: `agent` means every
     * figure was generated, and a screen that caveats a Nutri-Score needs to know that before it
     * draws one.
     */
    source: IngredientSource;
  } & Purchase)
  | { status: "refused"; reason: "not-food" | "not-an-ingredient" | "unreadable" };

/**
 * What the steps below accumulate on their way past. Handed to the step that invents a row.
 *
 * The gathering pays off twice, and the first time is free: a lookup's names are what the catalog
 * is re-searched with, which resolves the shopper who typed "carrot" on a French device with no row
 * created at all. What survives that is what step 4 is handed — the near-miss candidates step 1
 * declined to link on its score alone, and the figures steps 2 and 3 measured.
 *
 * It is returned from `gatherEvidence` rather than consumed in place so that the agent is wired to
 * evidence already in hand and nothing re-runs three steps to collect it a second time — and so
 * that a test can see WHICH step answered, which `resolveIngredient` deliberately hides.
 */
export type IngredientEvidence = {
  candidates: WidenedCandidate[];
  hits: LookupHit[];
};

/**
 * The ctx the agent step needs, and the reason it is not plain `ActionCtx`.
 *
 * A tool's `ToolCtx` carries a `userId`, because a model call is attributed and its messages are
 * saved against a caller — so the step that spends money is typed to require the identity that
 * pays for it. The three cheap steps below take a bare `ActionCtx` and mean it: a catalog read and
 * a dataset lookup are nobody's in particular, which is what makes them testable without an
 * account.
 */
type ResolveCtx = ActionCtx & { userId: Id<"users"> };

/**
 * Good enough to link a shopper's own typing to an existing row without asking them.
 *
 * The same bar `matchIngredients` links a recipe line at, and deliberately so: below it the row is
 * still evidence, and the steps after this one get to weigh it against what a dictionary says. The
 * asymmetry this slice introduces is at the *bottom* of the range (`RESOLVABLE`), not the top.
 */
const LINKABLE = CONFIDENT;

const _search = (
  ctx: ActionCtx,
  args: { text: string; locale: Locale },
): Promise<WidenedCandidate[]> =>
  ctx.runQuery(internal.router.ingredients.resolve._internal_search, args);

/** One row by id, for the one arm that can link a row the widened search never returned. */
const _load = async (
  ctx: ActionCtx,
  args: { ingredientId: Id<"ingredients">; locale: Locale },
) => (await ctx.runQuery(internal.router.ingredients.resolve._internal_load, args))[0];

/**
 * Step 1 — the catalog, searched wider than anywhere else in the app.
 *
 * No network, no key, no model. It answers most of the traffic this action sees, because the
 * commonest reason a shopper reached here is not that the food is exotic but that they spelled it
 * their own way or in their other language.
 *
 * **A tie is not a match.** `MARGIN` is applied here for the same reason `matchIngredients` applies
 * it: `Blanc de poulet` and `Blanc de poulet en tranches` both score 1.0, and without the runner-up
 * check the winner is whichever the search index happened to return first — raw chicken or deli
 * slices, decided by a coin flip and linked with no tap. Below the margin the row is still evidence,
 * and the steps after this one get to weigh it.
 */
const _fromCatalog = async (
  ctx: ActionCtx,
  { text, locale }: { text: string; locale: Locale },
): Promise<{ resolved?: ResolvedIngredient; candidates: WidenedCandidate[] }> => {
  const candidates = await _search(ctx, { text, locale });
  const best = candidates[0];
  const runnerUp = candidates[1]?.score ?? 0;

  if (best && best.score >= LINKABLE && best.score - runnerUp >= MARGIN)
    return {
      resolved: {
        status: "matched",
        ingredientId: best.ingredientId,
        name: best.name,
        defaultUnit: best.defaultUnit,
        defaultQuantity: best.defaultQuantity,
      },
      candidates,
    };

  return { candidates };
};

/**
 * Step 2 — the two shipped datasets, and the step that pays.
 *
 * **It is not an API.** The Open Food Facts ingredients taxonomy and CIQUAL are files this repo
 * ships, so this step has no key, no rate limit, no outage and no latency, and it runs before
 * anything touches the network.
 *
 * Its first move is not to gather facts but to **ask the catalog again**. The taxonomy knows that
 * "carrot" and "carotte" are one food; the catalog holds `carotte`; so a shopper who typed English
 * on a French device is resolved to the row that was there all along, and no row is invented. That
 * is problem 2 of this slice, fixed with no network and no model, and it is the reason the
 * taxonomy is the source I would not skip.
 *
 * Only when the catalog still does not hold it does CIQUAL's composition get gathered, for step 4
 * to build the row from — and its figures survive whatever the model offers for the same fields
 * (`measuredOver`), so gathering them here is what keeps an invented number a last resort.
 *
 * **The shopper's grade rides along, because the taxonomy dropped it.** Entries are filed under
 * grade-free spellings and `findInTaxonomy` looks them up through `searchTerms`, so "steak haché 5%"
 * matches an entry named `steak haché`. Searching the catalog with that bare spelling would link it
 * to the seeded `Bœuf haché (80/20)` at an exact-alias 0.9 — the link step 1 had just refused at
 * 0.667. Re-attaching the grade puts the identity back in front of the same ranker, so there is one
 * rule about grades and not two (ADR 0011).
 *
 * **The spellings are searched in parallel, and the first that answers still wins.** They were run
 * one awaited round trip at a time, which only ever exited early on a HIT — so a miss, the case that
 * goes on to spend two fetches and a model call anyway, always paid the whole loop first. The
 * taxonomy has entries carrying 49 spellings. Order is preserved by picking from the settled list
 * rather than by racing.
 */
const _fromDatasets = async (
  ctx: ActionCtx,
  { text, locale }: { text: string; locale: Locale },
): Promise<{ resolved?: ResolvedIngredient; hits: LookupHit[] }> => {
  const entry = findInTaxonomy(text);
  if (!entry) return { hits: [] };

  const grade = gradesIn(text).join(" ");
  // Folded spellings collide often across an entry's names and synonyms, and each duplicate is a
  // round trip that can only return what its twin already did.
  const spellings = [...new Set(spellingsOf(entry).map((spelling) =>
    grade ? `${spelling} ${grade}` : spelling))];

  const attempts = await Promise.all(
    spellings.map((spelling) => _fromCatalog(ctx, { text: spelling, locale })),
  );

  const hit = attempts.find((attempt) => attempt.resolved);
  if (hit?.resolved) return { resolved: hit.resolved, hits: [] };

  const nutrition = compositionOf(entry);

  // `spellings` above is the locale-blind list this step searched with; `namesOf` keeps the same
  // words filed under the language the taxonomy states, which is what a row can be built from.
  return { hits: [{ source: "foodComposition", names: namesOf(entry), nutrition }] };
};

/**
 * Step 3 — the two live APIs, in parallel.
 *
 * Last, because this is the only step that can be slow, rate-limited or down, and because it is
 * the only one carrying a key. In parallel rather than in sequence because neither is reliably
 * better than the other on the long tail: Open Food Facts knows the jar somebody sells, USDA knows
 * the raw food a laboratory measured, and running them one after the other would double a
 * shopper's wait to learn nothing. Neither can fail the resolve — both swallow their own failures.
 *
 * Like step 2, what comes back is first spent on the catalog: a product name is another spelling,
 * and a spelling is another chance the row already exists.
 *
 * **But only a name that is about the word the shopper typed.** Both sources here run a KEYWORD
 * search and neither reports how well it matched, so a term they cannot answer still comes back
 * full of foods — USDA matches the token `de` and returns `Pastry, Pastelitos de Guava` for
 * `eau de fleur d'oranger`. Spent on the catalog unchecked, that name is treated as another
 * spelling of the term, and it links to whatever row happens to hold it: it linked to
 * `pâte de pistache`, whose aliases carried that exact string, at 0.90 against a 0.78 bar. The
 * shopper saw their placeholder vanish and 30g of pistachio paste join a line already on the list
 * — no error, nothing to dismiss, and the agent never ran.
 *
 * `aboutTheSameFood` is the same predicate `sanitizeIngredient` gates a source's vocabulary and
 * its figures with, applied at the third site where a searched source's words are trusted.
 *
 * **The cost is step 3's cross-language bridge, and it is paid knowingly.** `Potato` is not
 * string-similar to `Pomme de terre`, so this gate drops a correct foreign-language name as
 * readily as a junk one. Measured over the seeded catalog, 132 of 532 cross-language lookups
 * reach this step as their only chance — and of a 20-case sample, Open Food Facts resolved none
 * of them, so the bridge being closed here is one that was not carrying traffic. What the gate
 * drops is not lost but demoted to step 4, where a reader judges the word: that costs a model
 * call and may invent a duplicate row, which is visible and fixable. A silent wrong link is not.
 */
const _fromApis = async (
  ctx: ActionCtx,
  { text, locale }: { text: string; locale: Locale },
): Promise<{ resolved?: ResolvedIngredient; hits: LookupHit[] }> => {
  const found = await Promise.all([searchOpenFoodFacts(text), searchFoodDataCentral(text)]);
  const hits = found.filter((hit): hit is LookupHit => hit !== undefined);

  for (const name of hits.flatMap(spellingsOfHit)) {
    if (!aboutTheSameFood(name, text)) continue;

    const { resolved } = await _fromCatalog(ctx, { text: name, locale });
    if (resolved) return { resolved, hits };
  }

  return { hits };
};

/**
 * Steps 4 and 5 — the agent, and the write.
 *
 * The last step and the only one that both spends a model call and can add a row, which is why
 * everything above it exists: by the time the term gets here the catalog has been searched with
 * every spelling four sources know, so what remains is genuinely either a food we do not hold or
 * not a food at all — and only a judgement can tell those apart.
 *
 * **It is handed the evidence, and it may still return an existing row.** The near-miss candidates
 * step 1 declined on its score alone are exactly the cases a score cannot settle ("courgette" vs
 * "courge"), and a reader is better at them than a threshold. That arm returns `matched`, not
 * `created`: no row is written, and the id was one the caller already held (ADR 0010).
 *
 * **It throws when the model cannot answer**, unlike steps 2 and 3, which swallow their failures.
 * The difference is what a refusal MEANS: `unreadable` is "we read that and could make nothing of
 * it", and reporting it because a provider was down would tell the shopper their word was the
 * problem. The client awaits this action and catches the throw — see the router — so a model outage
 * turns the placeholder into an error card without claiming to have judged anything.
 */
const _fromAgent = async (
  ctx: ResolveCtx,
  { text, locale, evidence }: { text: string; locale: Locale; evidence: IngredientEvidence },
): Promise<ResolvedIngredient> => {
  const sanitized = await sanitizeIngredient.run(ctx, {
    locale,
    text,
    // Positions and names, never the ids themselves: the tool hands the model a list and reads its
    // choice back out of it (ADR 0010).
    candidates: evidence.candidates.map(({ ingredientId, name }) => ({ id: ingredientId, name })),
    hits: evidence.hits,
  });

  if (sanitized.verdict === "refused") return { status: "refused", reason: sanitized.reason };

  if (sanitized.verdict === "existing") {
    // The ranker answers with a POSITION in the list it was handed, so the row's own purchase
    // fields come back out of that same list rather than from a second read (ADR 0010). The read
    // below is the fallback and not the path: a default invented here would be indistinguishable
    // from one the catalog stated, which is the whole failure the nullable unit exists to end.
    const linked = evidence.candidates.find(
      ({ ingredientId }) => ingredientId === sanitized.ingredientId,
    ) ?? (await _load(ctx, { ingredientId: sanitized.ingredientId, locale }));

    if (!linked)
      throw new Error(
        `resolveIngredient: the agent linked ${sanitized.ingredientId}, which no longer resolves`,
      );

    return {
      status: "matched",
      ingredientId: sanitized.ingredientId,
      name: sanitized.name,
      defaultUnit: linked.defaultUnit,
      defaultQuantity: linked.defaultQuantity,
    };
  }

  // Not `agent` by default: `measuredOver` has already laid every measured figure back over the
  // model's, so a row the taxonomy and CIQUAL answered for records the composition table that
  // supplied its numbers rather than the reader that supplied its category.
  //
  // Read off the sanitized answer rather than recomputed from `evidence.hits`, because the two
  // disagree: a hit measured on another food contributes no figures to the row, and asking the raw
  // list would stamp that source's authority on numbers it did not supply.
  const source = sanitized.source;

  const ingredientId = await ctx.runMutation(
    internal.router.ingredients.resolve._internal_create,
    { facts: sanitized.facts, source },
  );

  return {
    status: "created",
    ingredientId,
    name: sanitized.facts.names[locale].value,
    source,
    defaultUnit: sanitized.facts.defaultUnit,
    defaultQuantity: sanitized.facts.defaultQuantity,
  };
};

/**
 * Free text a shopper typed into the navigation bar, turned into a catalog row or an honest
 * refusal.
 *
 * **Cheapest first, and each step may end it.** The ordering is the whole design: every step that
 * answers is a step that saved the ones after it, and the ones that cost latency, a key or a model
 * call are last. Two of the five can end it without spending anything.
 *
 * ```
 * 1. the catalog, widened   both locales · both indexes · below PLAUSIBLE   → no network
 * 2. the shipped datasets   OFF taxonomy (names) · CIQUAL (fr nutrition)    → no network
 * 3. the live APIs          OFF products + USDA FoodData Central, parallel  → network
 * 4. the agent              handed 1's candidates and 2–3's figures         → model
 * 5. the write              createIngredient, through an internal mutation  → a row
 * ```
 *
 * `unreadable` is reachable from exactly two places, and neither is a step running out: empty text,
 * and a model that read the term and made nothing of it. A term no SOURCE could answer is a
 * question for step 4, never a refusal on its own — which is why `not-food` and
 * `not-an-ingredient` come back from a judgement rather than from a search that failed.
 */
export const resolveIngredient = async (
  ctx: ResolveCtx,
  { text, locale }: { text: string; locale: Locale },
): Promise<ResolvedIngredient> => {
  const trimmed = text.trim();
  const { resolved, evidence } = await gatherEvidence(ctx, { text: trimmed, locale });

  return resolved ?? _fromAgent(ctx, { text: trimmed, locale, evidence });
};

/**
 * The three cheap steps, keeping what they gathered on the way past instead of discarding it.
 *
 * Separate from `resolveIngredient` — which is this function with the evidence spent on step 4 and
 * then dropped — so the agent is handed facts already collected rather than re-running three steps
 * to collect them again. A step that resolved stops the walk: nothing after a match runs, so
 * nothing after it is gathered either, and step 4 is never reached.
 *
 * Exported so a test can assert WHERE an answer came from. `resolveIngredient` returns the same
 * `matched` whether step 1 or step 3 found it, and "the walk stopped at the first step that
 * answered" is the whole design — an assertion that has to be able to see the evidence to make it.
 */
export const gatherEvidence = async (
  ctx: ActionCtx,
  { text, locale }: { text: string; locale: Locale },
): Promise<{ resolved?: ResolvedIngredient; evidence: IngredientEvidence }> => {
  const trimmed = text.trim();
  const empty: IngredientEvidence = { candidates: [], hits: [] };
  if (!trimmed) return { resolved: { status: "refused", reason: "unreadable" }, evidence: empty };

  const catalog = await _fromCatalog(ctx, { text: trimmed, locale });
  const evidence = { ...empty, candidates: catalog.candidates };
  if (catalog.resolved) return { resolved: catalog.resolved, evidence };

  const datasets = await _fromDatasets(ctx, { text: trimmed, locale });
  evidence.hits = datasets.hits;
  if (datasets.resolved) return { resolved: datasets.resolved, evidence };

  const apis = await _fromApis(ctx, { text: trimmed, locale });
  evidence.hits = [...datasets.hits, ...apis.hits];

  return { resolved: apis.resolved, evidence };
};
