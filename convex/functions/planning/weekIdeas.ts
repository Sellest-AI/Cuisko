import type { Id } from "@convex/_generated/dataModel";
import { candidatePool } from "@convex/functions/planning/candidatePool";
import { getForUser } from "@convex/functions/preferences/getForUser";
import { coverOf, toRecipeCard, type RecipeCard } from "@convex/functions/recipes/recipeCard";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { sortAllergens } from "@shared/allergens";
import { seedOfWeekKey } from "@shared/dates";
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
export const IDEAS_COUNT = 3;

/**
 * `candidatePool` sizes its window per plate; one plate loads a handful of candidates, of which
 * the shelf shows the first `IDEAS_COUNT`. The few extra line reads are the price of sharing the
 * planner's pool rather than keeping a second one. Servings scale the lines, which ideas discard
 * — `1` buys the pool's signature unchanged.
 */
const ONE_PLATE = { plates: 1, servings: 1 };

/**
 * The household's constraint set: the strictest diet of everyone who answered, and every allergen
 * anyone avoids. The same aggregation the planning tunnel defaults to, so home never suggests
 * what the planner would reject. A member with no row contributes nothing, as in `getPlanningSeed`.
 */
const _householdConstraints = async (ctx: IdeasCtx, householdId: Id<"households">) => {
  const memberships = await ctx.db
    .query("householdUsers")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();

  const rows = await Promise.all(memberships.map((membership) => getForUser(ctx, membership.userId)));
  const answered = rows.filter((row) => row !== null);

  return {
    diet: strictestDietOf(answered.map((row) => row.diet)),
    avoids: sortAllergens(answered.flatMap((row) => row.avoids)),
  };
};

/**
 * Up to `IDEAS_COUNT` recipes the household could cook this week — the home shelf.
 *
 * The same shuffle the planner draws from, seeded by the week rather than by a roll: one key per
 * Monday, so every visit in a week sees the same picks and the next Monday sees new ones, with
 * nothing stored and no cron. `selectMeals` is deliberately not called: no plates, no stock
 * scoring, no writes — a shelf to browse, not a plan (PRODUCT.md, anti-goal 4).
 */
export const weekIdeas = async (
  ctx: IdeasCtx,
  { householdId, userId, locale, weekKey }: Args,
): Promise<RecipeCard[]> => {
  const [{ diet, avoids }, household] = await Promise.all([
    _householdConstraints(ctx, householdId),
    ctx.db.get(householdId),
  ]);

  // The kitchen is the household's, so its row is the one place to read it from — and its optional
  // column is the pool's optional argument: a household never asked is a shelf never filtered.
  const pool = await candidatePool(ctx, {
    userId,
    seed: seedOfWeekKey(weekKey),
    diet,
    avoids,
    equipments: household?.equipments,
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
