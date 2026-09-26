import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Allergen } from "@shared/allergens";
import type { Diet } from "@shared/diets";
import { canBeMadeWith, type Equipment } from "@shared/equipments";
import { matchesSeeks, type NutritionPreference } from "@shared/preferences";
import { totalMinutesOf } from "@shared/recipes";
import type { Tag } from "@shared/tags";

import { suitsDiet } from "@convex/functions/recipes/dietFacet";

import { scaleLines } from "./scaleLines";
import type { Candidate } from "./selectMeals";

type PoolCtx = Pick<QueryCtx, "db">;

type Args = {
  userId: Id<"users">;
  /** Where the shuffled window starts, in `[0, 1)`. Rolled once by the client, so a re-run draws the same pool. */
  seed: number;
  servings: number;
  plates: number;
  diet: Diet;
  avoids: Allergen[];
  /**
   * The longest a recipe may declare itself to be, margin already applied by `ceilingMinutesOf`.
   *
   * Optional because "any" is the absence of a ceiling rather than an infinite one, and because
   * `weekIdeas` has no tunnel run behind it to read an answer from: omitting it keeps exactly the
   * behaviour this function had before a ceiling existed.
   */
  maxMinutes?: number;
  /**
   * What the kitchen owns, in the vocabulary's words. Optional, and the two absences differ:
   * `undefined` is a kitchen nobody asked about, which filters nothing; `[]` is one the cook said
   * owns nothing listed, which keeps only recipes that need none of it — the same distinction
   * `households.equipments` draws with its optional column.
   */
  equipments?: Equipment[];
  /**
   * The nutrition tags every recipe must carry — the caller's own `seeks`, never a household
   * aggregate, since two people's wishes cannot be added (`AggregatedConstraints`). Required, unlike
   * the ceiling: every caller has an answer, and `[]` is the one that filters nothing.
   */
  seeks: NutritionPreference[];
  /**
   * The instant the window's order was settled. A recipe written at or after it is examined after
   * every older one, in its own shuffle order — so a week seeded on Monday shows the same picks
   * on Wednesday whatever was imported in between, and a mid-week recipe still fills a short pool.
   * Omitted, the window is pure shuffle order, which is what a fresh run wants.
   */
  settledAt?: number;
};

/** A candidate, with the documents the draft is shaped from so nothing is read twice. */
export type Pool = {
  candidates: Candidate[];
  recipes: Map<Id<"recipes">, Doc<"recipes">>;
  ingredients: Map<Id<"ingredients">, Doc<"ingredients">>;
};

/**
 * Recipe rows read per owner. Sized for the filtering rather than for the week: a vegan household
 * avoiding three allergens can plausibly reject nine candidates in ten.
 */
const WINDOW = 500;

/**
 * How many candidates each plate is chosen from. The window is cheap, the lines are not — about ten
 * reads per recipe — so lines are loaded for this many survivors and no more.
 *
 * Six rather than three because `selectMeals` ranks on shared purchases, and a recipe that shares
 * the basket has to be in the pool to be found: at three per plate the pool rarely held one. A
 * two-slot week loads about a hundred recipes (84 from the catalog, up to 24 of the caller's own),
 * a few thousand documents against a 32,000 scan budget. The tighter budget is the 4,096 index
 * ranges a query may read — every `db.get` on an ingredient is one — which is why `_ingredientOf`
 * caches on the read.
 */
export const CANDIDATES_PER_PLATE = 6;

/** Mirrors `selectMeals`' own-share cap, so the caller's recipes are loaded only as deep as they can be used. */
export const OWN_SHARE = 0.3;

/**
 * The tags of a recipe that is not a lunch or a dinner on its own — a side, a cake, a jus, a
 * smoothie, a bowl of granola. A week is lunches and dinners, and one of these filling a slot is a
 * meal nobody can sit down to.
 *
 * A deny-list rather than an allow-list on `main`, on purpose: a recipe the model never gave a
 * course is still planned. Only a recipe KNOWN to be something else is left out. `starter` is not
 * here: a soup or a salad served as a starter is a fair lunch.
 *
 * **`main` wins.** Course tags are not exclusive: a bœuf bourguignon may come back `main` and
 * `sauce`, a grain salad `main` and `side`. A recipe the model called a main is a plate, whatever
 * else it also is.
 */
const NOT_A_PLATE: readonly Tag[] = ["side", "pastry", "sauce", "dessert", "drink", "snack", "breakfast"];

/** The span `randomShuffleKey` draws from: every unsigned 32-bit integer. */
const SHUFFLE_KEY_SPAN = 2 ** 32;

/**
 * One owner's live recipes, from a random point of `by_user_and_is_archived_and_shuffle_key`,
 * wrapping once to the start when the range past the seed comes up short.
 *
 * The seed is a fraction and the keys are 32-bit integers, so it is stretched onto the key's span
 * first. Compared raw, every key but `0` sits past it: the window always opened at the lowest key,
 * the same week came back every run, and nothing past the first `WINDOW` keys was ever drawn.
 *
 * `userId` is the first field of the index and never relaxed: a shuffle over the bare key would
 * hand the planner other households' private recipes.
 */
const _window = async (ctx: PoolCtx, userId: Id<"users"> | undefined, seed: number) => {
  const start = Math.floor(seed * SHUFFLE_KEY_SPAN);

  const after = await ctx.db
    .query("recipes")
    .withIndex("by_user_and_is_archived_and_shuffle_key", (q) =>
      q.eq("userId", userId).eq("isArchived", false).gt("shuffleKey", start),
    )
    .take(WINDOW);

  if (after.length === WINDOW) return after;

  const before = await ctx.db
    .query("recipes")
    .withIndex("by_user_and_is_archived_and_shuffle_key", (q) =>
      q.eq("userId", userId).eq("isArchived", false).lte("shuffleKey", start),
    )
    .take(WINDOW - after.length);

  return [...after, ...before];
};

/**
 * `rows` with everything written at or after `settledAt` moved to the back, each half in the order
 * it arrived. A stable partition rather than a sort: the shuffle order is the randomness, and it
 * must survive on both sides of the cut.
 *
 * The two halves are one predicate and its complement, so every row lands in one of them. Two
 * comparisons would both be false against a `NaN` cut — a week key `Date.parse` cannot read — and
 * would hand back nothing, where the cut is an addition to the pool and must never cost it a row.
 */
const _settled = (rows: Doc<"recipes">[], settledAt: number | undefined) => {
  if (settledAt === undefined) return rows;

  const isLate = (row: Doc<"recipes">) => row._creationTime >= settledAt;

  return [...rows.filter((row) => !isLate(row)), ...rows.filter(isLate)];
};

/**
 * One ingredient, read from the database at most once per pool.
 *
 * The cache fills on the read, not on the recipe surviving: the ingredient that gets a recipe
 * rejected — the butter in a dairy-free week — is exactly the one every next rejected recipe would
 * ask for again, and each `db.get` spends one of the 4,096 index ranges a query is allowed. Deleted
 * ingredients are remembered too, so a dangling line costs one read rather than one per recipe.
 */
const _ingredientOf = async (
  ctx: PoolCtx,
  ingredientId: Id<"ingredients">,
  pool: Pool,
  deleted: Set<Id<"ingredients">>,
) => {
  const cached = pool.ingredients.get(ingredientId);
  if (cached) return cached;
  if (deleted.has(ingredientId)) return null;

  const ingredient = await ctx.db.get(ingredientId);
  if (ingredient) pool.ingredients.set(ingredientId, ingredient);
  else deleted.add(ingredientId);

  return ingredient;
};

/**
 * Load lines for `recipes`, in order, until `limit` of them survive the allergen check.
 *
 * Sequential on purpose: the point of the limit is to stop reading, and a `Promise.all` over the
 * whole window would have read every line before knowing it could stop.
 */
const _loadUntil = async (
  ctx: PoolCtx,
  recipes: Doc<"recipes">[],
  limit: number,
  {
    servings,
    avoids,
    isMine,
    deleted,
  }: { servings: number; avoids: Allergen[]; isMine: boolean; deleted: Set<Id<"ingredients">> },
  pool: Pool,
) => {
  let loaded = 0;

  for (const recipe of recipes) {
    if (loaded >= limit) return;

    const lines = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id))
      .collect();

    if (lines.length === 0) continue;

    // Distinct first: a recipe listing the same ingredient twice would otherwise race two reads of it.
    const ingredientIds = [...new Set(lines.map(({ ingredientId }) => ingredientId))];
    const found = await Promise.all(ingredientIds.map((id) => _ingredientOf(ctx, id, pool, deleted)));

    // A deleted ingredient is an unknown one, and a line nothing can describe cannot be planned.
    if (found.some((ingredient) => ingredient === null)) continue;
    const rows = lines.map(({ ingredientId }) => pool.ingredients.get(ingredientId)!);

    // Unknown means excluded: `undefined` is "never classified", the one row that could carry it.
    if (
      avoids.length > 0 &&
      rows.some((row) => row.allergens === undefined || row.allergens.some((allergen) => avoids.includes(allergen)))
    ) {
      continue;
    }

    pool.recipes.set(recipe._id, recipe);
    pool.candidates.push({
      recipeId: recipe._id,
      cuisine: recipe.cuisine,
      isMine,
      needs: scaleLines(
        lines.map((line, index) => ({ ...line, ingredient: rows[index]! })),
        { recipeServings: recipe.servings, servings },
      ),
    });
    loaded += 1;
  }
};

/**
 * The recipes a week may be drawn from, already scaled to the plates' servings, in shuffled order.
 *
 * Both halves are index reads on `by_user_and_is_archived_and_shuffle_key` — the global catalog
 * (`userId` unset) and the caller's own — and both read live rows only, so a deleted recipe is
 * never drawn into a new week. Components, diet, the time ceiling and the sought tags are filtered on the
 * recipe row, which is free; allergens need the lines, so they are read only for the survivors, and only until there
 * are enough to choose from. The catalog comes first, and the caller's own fill whatever it could
 * not: the own-share
 * cap in `selectMeals` is a ceiling, and a short catalog must still yield a week.
 */
export const candidatePool = async (
  ctx: PoolCtx,
  { userId, seed, servings, plates, diet, avoids, maxMinutes, equipments, seeks, settledAt }: Args,
): Promise<Pool> => {
  const pool: Pool = { candidates: [], recipes: new Map(), ingredients: new Map() };
  const deleted = new Set<Id<"ingredients">>();
  const wanted = plates * CANDIDATES_PER_PLATE;

  const [catalog, mine] = (
    await Promise.all([_window(ctx, undefined, seed), _window(ctx, userId, seed)])
  ).map((rows) => _settled(rows, settledAt)) as [Doc<"recipes">[], Doc<"recipes">[]];

  /**
   * @limitation Design choice: **an untimed recipe passes every ceiling.** `undefined` means nobody
   * timed it, not that it is instant — so the honest answer to "does this fit in 30 minutes?" is
   * "unknown", and unknown is admitted here.
   *
   * This is deliberately the OPPOSITE of the allergen rule in `_loadUntil` above, where an
   * unclassified ingredient is excluded, and the difference is what is at stake: a mistimed dinner
   * annoys a cook, an undeclared allergen harms one. It also protects the pool, since the catalog
   * holds recipes the model never timed and a strict rule would thin every filtered week.
   *
   * If the catalog ever becomes well-timed enough that excluding the unknown is the honest reading
   * of a ceiling, this is the one line to flip — copy the shape of the allergen check.
   *
   * `matchesSeeks` two lines down reads absence the other way, and on purpose: a recipe without
   * `high-protein` is one `computeTags` measured or refused to claim, and neither is high-protein.
   */
  const fitsTime = (recipe: Doc<"recipes">) => {
    if (maxMinutes === undefined) return true;

    const total = totalMinutesOf(recipe.timings);

    return total === undefined || total <= maxMinutes;
  };

  /**
   * A recipe declaring no equipment passes too, and that is NOT the untimed rule above: an empty
   * list is the sanitizer's answer ("pans and a knife"), not a field nobody filled —
   * see `canBeMadeWith`.
   */
  const isMakeable = (recipe: Doc<"recipes">) =>
    equipments === undefined || canBeMadeWith(recipe.equipments, equipments);

  const isAPlate = (recipe: Doc<"recipes">) =>
    recipe.tags.includes("main") || !recipe.tags.some((tag) => NOT_A_PLATE.includes(tag));

  // All five are decided on the recipe row, before a single line is read, so they cost nothing.
  const suits = (recipe: Doc<"recipes">) =>
    isAPlate(recipe) &&
    suitsDiet(recipe, diet) &&
    fitsTime(recipe) &&
    isMakeable(recipe) &&
    matchesSeeks(recipe.tags, seeks);

  await _loadUntil(ctx, catalog.filter(suits), wanted, { servings, avoids, isMine: false, deleted }, pool);

  const ownWanted = Math.max(wanted - pool.candidates.length, Math.floor(OWN_SHARE * plates) * CANDIDATES_PER_PLATE);
  await _loadUntil(ctx, mine.filter(suits), ownWanted, { servings, avoids, isMine: true, deleted }, pool);

  return pool;
};
