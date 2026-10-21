import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import { type RecipeCard, plateOf, toRecipeCard } from "@convex/functions/recipes/recipeCard";

type CardCtx = Pick<QueryCtx, "db">;

/**
 * Where a plate has got to, as the screens draw it.
 *
 * `cooked` and `skipped` are stored. The other two are derived: a planned plate is waiting on the
 * shop while any of its lines still points at a row on the household's grocery list, and ready
 * once none does.
 */
export type PlannedMealStatus = "cooked" | "skipped" | "ready" | "shopping-needed";

/**
 * A plate of the kept week as a list draws it: where it sits, how far it has got, and the recipe as
 * a card.
 *
 * The recipe stops at `RecipeCard` for the reason that type gives — a row prints a title and a
 * cover, and shipping both locales of the instructions per plate, per page, is kilobytes nobody
 * reads. The meal screen that needs the steps loads the recipe itself.
 */
export type PlannedMealCard = {
  id: Id<"plannedMeals">;
  date: number;
  slot: Doc<"plannedMeals">["slot"];
  servings: number;
  status: PlannedMealStatus;
  recipe: RecipeCard;
};

type Args = {
  householdId: Id<"households">;
  meals: Doc<"plannedMeals">[];
  locale: Locale;
};

/**
 * Every distinct recipe on these plates, as a card, read once.
 *
 * Deduplicated because a week repeats dishes by design — `selectMeals` reuses a recipe once the
 * pool is exhausted — and two reads per plate (the recipe, its cover) would be paid again per repeat.
 */
const _recipeCards = async (ctx: CardCtx, meals: Doc<"plannedMeals">[], locale: Locale) => {
  const recipeIds = [...new Set(meals.map((meal) => meal.recipeId))];

  return new Map(
    await Promise.all(recipeIds.map(async (recipeId): Promise<[Id<"recipes">, RecipeCard]> => {
      const recipe = await ctx.db.get(recipeId);
      // The cascade deletes a recipe's planned meals with it, so this is a broken invariant, not a gap.
      if (!recipe) throw new Error(`Recipe not found: ${recipeId}`);

      return [recipeId, toRecipeCard(recipe, locale, null, await plateOf(ctx, recipe))];
    })),
  );
};

/**
 * The plates still waiting on the shop.
 *
 * Checked against the list as it stands rather than trusting the pointer alone: a line naming a
 * row that is gone is not waiting on anything. Buying detaches the pointer when it settles the
 * claim, and a row a back-out took at zero goes with it, so the list — not the pointer — is what
 * "still asked for" means. The list is read once for the whole set, and the ledger only for
 * plates not already cooked.
 */
const _waitingOnShop = async (ctx: CardCtx, { householdId, meals }: Omit<Args, "locale">) => {
  const planned = meals.filter((meal) => meal.status === "planned");
  if (planned.length === 0) return new Set<Id<"plannedMeals">>();

  const [groceryRows, lines] = await Promise.all([
    ctx.db.query("groceryListItems").withIndex("by_household", (q) => q.eq("householdId", householdId)).collect(),
    Promise.all(planned.map((meal) =>
      ctx.db.query("plannedMealIngredients").withIndex("by_planned_meal", (q) => q.eq("plannedMealId", meal._id)).collect())),
  ]);

  const onList = new Set(groceryRows.map((row) => row._id));

  return new Set(planned
    .filter((_, index) => lines[index]!.some((line) => line.groceryListItemId && onList.has(line.groceryListItemId)))
    .map((meal) => meal._id));
};

/** The plates as cards, in the order they were given: both readers already hold the index order they want. */
export const toPlannedMealCards = async (ctx: CardCtx, args: Args): Promise<PlannedMealCard[]> => {
  const [cards, waiting] = await Promise.all([
    _recipeCards(ctx, args.meals, args.locale),
    _waitingOnShop(ctx, args),
  ]);

  return args.meals.map((meal) => ({
    id: meal._id,
    date: meal.date,
    slot: meal.slot,
    servings: meal.servings,
    status: meal.status !== "planned" ? meal.status : waiting.has(meal._id) ? "shopping-needed" : "ready",
    recipe: cards.get(meal.recipeId)!,
  }));
};

/**
 * One plate of the kept week, as the meal sheet draws it — or `null` once it is gone.
 *
 * `null` rather than `NOT_FOUND`, which is what `loadHouseholdMeal` answers the writes with: this
 * backs a reactive read on a route the user can reopen from a stale link or hold open while the
 * plate is removed under it, and "no longer in the plan" is the answer that screen has to show,
 * not a failure. A plate of another household is still refused — the sheet edits what it reads,
 * and the boundary is the same one every planning write keeps.
 */
export const loadMealCard = async (
  ctx: CardCtx,
  args: { householdId: Id<"households">; mealId: Id<"plannedMeals">; locale: Locale },
): Promise<PlannedMealCard | null> => {
  const meal = await ctx.db.get(args.mealId);

  if (!meal) return null;
  if (meal.householdId !== args.householdId) throw new ConvexError({ code: "FORBIDDEN" });

  const [card] = await toPlannedMealCards(ctx, { householdId: args.householdId, meals: [meal], locale: args.locale });

  return card ?? null;
};
