import type { Doc, Id } from "@convex/_generated/dataModel";
import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import type { MealSlot } from "@shared/mealSlots";

type Args = {
  householdId: Id<"households">;
  locale: Locale;
};

/**
 * One plate still waiting on the shop, and what it is waiting for.
 *
 * A plate — one dish on one day — and not a recipe: lasagna on Monday and lasagna on Friday are two
 * of these, because the shopper doing Monday's groceries wants Monday's share and nothing of
 * Friday's. `amount` is that share, the claim's own `groceryQuantity`, in the unit of the list row
 * it names. The list row holds the merged total; this is the only record of who asked for how much.
 */
export type PlateOnList = {
  id: Id<"plannedMeals">;
  /** The dish behind the plate, so a heading can open the recipe it names. */
  recipeId: Id<"recipes">;
  title: string;
  date: number;
  slot: MealSlot;
  claims: { lineId: Id<"groceryListItems">; amount: number }[];
};

type PlatesCtx = Pick<QueryCtx, "db">;

/**
 * The plates still claiming a row on the household's grocery list, keyed by plate.
 *
 * Walked from the list rather than from the plan, so the read is bounded by what is on the list
 * today and not by every week the household ever planned. A claim is counted while its row is on
 * the list and its plate is still `planned` — buying detaches the pointer, and a cooked plate has
 * taken its lines with it, so both are "not waiting on the shop" by construction. A claim with no
 * `groceryQuantity` is a line the shopper ticked as already in the kitchen: it reserves, it does
 * not buy, and it has nothing to say here.
 *
 * Plate and recipe rows are read once each. That is a cost, not a merge — two plates of one recipe
 * come back as two plates.
 */
export const platesOnList = async (ctx: PlatesCtx, { householdId, locale }: Args): Promise<PlateOnList[]> => {
  const rows = await ctx.db
    .query("groceryListItems")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();

  const claims = (
    await Promise.all(rows.map((row) =>
      ctx.db.query("plannedMealIngredients")
        .withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", row._id))
        .collect()))
  ).flat().filter((claim) => claim.groceryQuantity !== undefined && claim.groceryListItemId !== undefined);

  const plates = new Map<Id<"plannedMeals">, Doc<"plannedMeals">>();
  for (const plateId of new Set(claims.map((claim) => claim.plannedMealId))) {
    const plate = await ctx.db.get(plateId);
    if (plate && plate.status === "planned") plates.set(plateId, plate);
  }

  const titles = new Map<Id<"recipes">, string>();
  for (const recipeId of new Set([...plates.values()].map((plate) => plate.recipeId))) {
    const recipe = await ctx.db.get(recipeId);
    // The cascade deletes a recipe's planned meals with it, so this is a broken invariant, not a gap.
    if (!recipe) throw new Error(`Recipe not found: ${recipeId}`);
    titles.set(recipeId, resolvei18n(recipe.title, locale));
  }

  return [...plates.values()].map((plate) => ({
    id: plate._id,
    recipeId: plate.recipeId,
    title: titles.get(plate.recipeId)!,
    date: plate.date,
    slot: plate.slot,
    claims: claims
      .filter((claim) => claim.plannedMealId === plate._id)
      .map((claim) => ({ lineId: claim.groceryListItemId!, amount: claim.groceryQuantity! })),
  }));
};
