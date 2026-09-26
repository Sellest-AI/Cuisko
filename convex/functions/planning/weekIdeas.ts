import type { Id } from "@convex/_generated/dataModel";
import { candidatePool } from "@convex/functions/planning/candidatePool";
import { getForUser } from "@convex/functions/preferences/getForUser";
import { coverOf, toRecipeCard, type RecipeCard } from "@convex/functions/recipes/recipeCard";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { sortAllergens } from "@shared/allergens";
import { mondayOf, seedOfWeekKey } from "@shared/dates";
import { strictestDietOf } from "@shared/diets";

type IdeasCtx = Pick<QueryCtx, "db">;

type Args = {
  householdId: Id<"households">;
  userId: Id<"users">;
  locale: Locale;
  /** The local Monday of the week, `YYYY-MM-DD` — see `weekKeyOf`. The seed is derived here, never sent. */
  weekKey: string;
};

/** How many cards the home shelf holds. */
export const IDEAS_COUNT = 6;

/**
 * `candidatePool` sizes its window per plate, and one plate asks for `CANDIDATES_PER_PLATE` — six,
 * the same as `IDEAS_COUNT`, so a full catalog fills the shelf without a second plate's line reads.
 * Raising the shelf past that number means asking for more plates. Servings scale the lines,
 * which ideas discard — `1` buys the pool's signature unchanged.
 */
const ONE_PLATE = { plates: 1, servings: 1 };

/**
 * The household's constraint set: the strictest diet of everyone who answered, and every allergen
 * anyone avoids. The same aggregation the planning tunnel defaults to, so home never suggests
 * what the planner would reject. A member with no row contributes nothing, as in `getPlanningSeed`.
 *
 * `seeks` is the caller's own row and nobody else's — the one preference that is never
 * aggregated, since two people's wishes cannot be added (`AggregatedConstraints`). A caller with
 * no row seeks nothing, which filters nothing.
 */
const _householdConstraints = async (ctx: IdeasCtx, householdId: Id<"households">, userId: Id<"users">) => {
  const memberships = await ctx.db
    .query("householdUsers")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();

  const rows = await Promise.all(memberships.map((membership) => getForUser(ctx, membership.userId)));
  const answered = rows.filter((row) => row !== null);

  return {
    diet: strictestDietOf(answered.map((row) => row.diet)),
    avoids: sortAllergens(answered.flatMap((row) => row.avoids)),
    seeks: answered.find((row) => row.userId === userId)?.seeks ?? [],
  };
};

/**
 * Up to `IDEAS_COUNT` recipes the household could cook this week — the home shelf.
 *
 * The same shuffle the planner draws from, seeded by the week rather than by a roll: one key per
 * Monday, so every visit in a week sees the same picks and the next Monday sees new ones, with
 * nothing stored and no cron. The query is reactive, so it re-runs when a recipe is written into
 * its window; the picks stand anyway, because the pool examines anything written after the
 * week's Monday last (`settledAt`) — an import on Wednesday joins the shuffle the Monday after. `selectMeals` is deliberately not called: no plates, no stock
 * scoring, no writes — a shelf to browse, not a plan (PRODUCT.md, anti-goal 4).
 */
export const weekIdeas = async (
  ctx: IdeasCtx,
  { householdId, userId, locale, weekKey }: Args,
): Promise<RecipeCard[]> => {
  const [{ diet, avoids, seeks }, household] = await Promise.all([
    _householdConstraints(ctx, householdId, userId),
    ctx.db.get(householdId),
  ]);

  // The kitchen is the household's, so its row is the one place to read it from — and its optional
  // column is the pool's optional argument: a household never asked is a shelf never filtered.
  const pool = await candidatePool(ctx, {
    userId,
    seed: seedOfWeekKey(weekKey),
    settledAt: mondayOf(weekKey),
    diet,
    avoids,
    equipments: household?.equipments,
    seeks,
    ...ONE_PLATE,
  });

  return Promise.all(
    pool.candidates.slice(0, IDEAS_COUNT).map(async ({ recipeId }) => {
      const recipe = pool.recipes.get(recipeId)!;

      // The plate image is a read ideas never use: the shelf shows covers only.
      return toRecipeCard(recipe, locale, await coverOf(ctx, recipe), null);
    }),
  );
};
