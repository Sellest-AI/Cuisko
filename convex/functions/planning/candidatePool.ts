import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Allergen } from "@shared/allergens";
import type { Diet } from "@shared/diets";

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
 */
const CANDIDATES_PER_PLATE = 3;

/** Mirrors `selectMeals`' own-share cap, so the caller's recipes are loaded only as deep as they can be used. */
export const OWN_SHARE = 0.3;

/** The recipe facet a diet is promised by. `dietTagsOf` nests them, so one flag per diet is complete. */
const _suitsDiet = (recipe: Doc<"recipes">, diet: Diet) => {
  switch (diet) {
    case "vegan":
      return recipe.isVegan;
    case "vegetarian":
      return recipe.isVegetarian;
    case "pescatarian":
      return recipe.isPescatarian;
    case "omnivore":
      return true;
  }
};

/** The span `randomShuffleKey` draws from: every unsigned 32-bit integer. */
const SHUFFLE_KEY_SPAN = 2 ** 32;

/**
 * One owner's recipes, from a random point of `by_user_id_and_shuffle_key`, wrapping once to the
 * start when the range past the seed comes up short.
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
    .withIndex("by_user_id_and_shuffle_key", (q) => q.eq("userId", userId).gt("shuffleKey", start))
    .take(WINDOW);

  if (after.length === WINDOW) return after;

  const before = await ctx.db
    .query("recipes")
    .withIndex("by_user_id_and_shuffle_key", (q) => q.eq("userId", userId).lte("shuffleKey", start))
    .take(WINDOW - after.length);

  return [...after, ...before];
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
  { servings, avoids, isMine }: { servings: number; avoids: Allergen[]; isMine: boolean },
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

    const ingredients = await Promise.all(
      lines.map(async ({ ingredientId }) => pool.ingredients.get(ingredientId) ?? (await ctx.db.get(ingredientId))),
    );

    // A deleted ingredient is an unknown one, and a line nothing can describe cannot be planned.
    if (ingredients.some((ingredient) => ingredient === null)) continue;
    const rows = ingredients as Doc<"ingredients">[];

    // Unknown means excluded: `undefined` is "never classified", the one row that could carry it.
    if (
      avoids.length > 0 &&
      rows.some((row) => row.allergens === undefined || row.allergens.some((allergen) => avoids.includes(allergen)))
    ) {
      continue;
    }

    for (const row of rows) pool.ingredients.set(row._id, row);
    pool.recipes.set(recipe._id, recipe);
    pool.candidates.push({
      recipeId: recipe._id,
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
 * Both halves are index reads on `by_user_id_and_shuffle_key` — the global catalog (`userId`
 * unset) and the caller's own. Diet is filtered on the recipe row, which is free; allergens need
 * the lines, so they are read only for the survivors, and only until there are enough to choose
 * from. The catalog comes first, and the caller's own fill whatever it could not: the own-share
 * cap in `selectMeals` is a ceiling, and a short catalog must still yield a week.
 */
export const candidatePool = async (ctx: PoolCtx, { userId, seed, servings, plates, diet, avoids }: Args): Promise<Pool> => {
  const pool: Pool = { candidates: [], recipes: new Map(), ingredients: new Map() };
  const wanted = plates * CANDIDATES_PER_PLATE;

  const [catalog, mine] = await Promise.all([_window(ctx, undefined, seed), _window(ctx, userId, seed)]);
  const suits = (recipe: Doc<"recipes">) => _suitsDiet(recipe, diet);

  await _loadUntil(ctx, catalog.filter(suits), wanted, { servings, avoids, isMine: false }, pool);

  const ownWanted = Math.max(wanted - pool.candidates.length, Math.floor(OWN_SHARE * plates) * CANDIDATES_PER_PLATE);
  await _loadUntil(ctx, mine.filter(suits), ownWanted, { servings, avoids, isMine: true }, pool);

  return pool;
};
