import { ConvexError } from "convex/values";

import type { Id } from "@convex/_generated/dataModel";
import { getImage } from "@convex/functions/media/getImage";
import { toRecipeCard } from "@convex/functions/recipes/recipeCard";
import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import type { Allergen } from "@shared/allergens";
import type { Category } from "@shared/categories";
import type { Diet } from "@shared/diets";
import type { Unit } from "@shared/ingredients";
import type { MealSlot } from "@shared/mealSlots";

import { availableStock } from "./availableStock";
import { candidatePool, OWN_SHARE } from "./candidatePool";
import { isDistinct, MAX_DAYS, MAX_SERVINGS } from "./limits";
import { selectMeals, type Plate } from "./selectMeals";

type Args = {
  householdId: Id<"households">;
  userId: Id<"users">;
  locale: Locale;
  seed: number;
  servings: number;
  /** Local-day timestamps of the days to plan, in order. The client's, because "Tuesday" is its Tuesday. */
  dates: number[];
  slots: MealSlot[];
  /** Local-day timestamp of today: meals planned from here on still hold their stock. */
  today: number;
  diet: Diet;
  avoids: Allergen[];
};

export type DraftIngredient = {
  ingredientId: Id<"ingredients">;
  name: string;
  emoji: string;
  category: Category;
  imageUrl?: string;
  /** The recipe's own words, scaled to the plate — "2 pcs", not the grams stock is counted in. */
  amount: number;
  unit: Unit;
  covered: boolean;
};

/** One plate of a week nobody has agreed to yet: what the review step draws and `commit` will persist. */
export type DraftMeal = {
  recipeId: Id<"recipes">;
  date: number;
  slot: MealSlot;
  servings: number;
  title: string;
  minutes?: number;
  imageUrl?: string;
  ingredients: DraftIngredient[];
};

/**
 * Everything here is the client's, and the plates are `dates × slots`, which multiplies every read
 * below — so each factor is bounded where it cannot be bypassed. A repeated date or slot is refused
 * rather than deduplicated: it would be two plates the client cannot tell apart. `servings` must be
 * a whole number, which also refuses `NaN`, since `NaN` fails no comparison and scales every line
 * to `NaN`. The seed must be the fraction `candidatePool` stretches onto the shuffle key.
 */
const _isValidRequest = ({ dates, slots, servings, seed }: Args) =>
  dates.length <= MAX_DAYS &&
  isDistinct(dates) &&
  isDistinct(slots) &&
  Number.isInteger(servings) &&
  servings >= 1 &&
  servings <= MAX_SERVINGS &&
  seed >= 0 &&
  seed < 1;

/**
 * A generated week, written nowhere.
 *
 * Stock first, then the pool, then the pure selection, then names and images for what was picked.
 * A tunnel abandoned at review has asserted nothing, so this is a query and not a mutation.
 *
 * Everything that decides the draft is an argument — the seed, the days, the run's diet and
 * allergens — rather than read from the stored preferences, which the same generating step is
 * writing at the same moment. Reading them would re-run this query on its own write and reshuffle
 * the week under a user already reviewing it.
 *
 * An empty pool yields an empty week, not a throw: there is nothing wrong with the request, only
 * nothing to plan it from.
 */
export const planDraft = async (ctx: QueryCtx, args: Args): Promise<DraftMeal[]> => {
  if (!_isValidRequest(args)) throw new ConvexError({ code: "INVALID_INPUT" });

  const plates: Plate[] = args.dates.flatMap((date) =>
    args.slots.map((slot) => ({ date, slot, servings: args.servings })),
  );

  if (plates.length === 0) return [];

  const [stock, pool] = await Promise.all([
    availableStock(ctx, args.householdId, args.today),
    candidatePool(ctx, {
      userId: args.userId,
      seed: args.seed,
      servings: args.servings,
      plates: plates.length,
      diet: args.diet,
      avoids: args.avoids,
    }),
  ]);

  const selected = selectMeals(pool.candidates, stock, plates, { ownShare: OWN_SHARE });

  const recipeIds = [...new Set(selected.map(({ candidate }) => candidate.recipeId))];
  const ingredientIds = [...new Set(selected.flatMap(({ candidate }) => candidate.needs.map((need) => need.ingredientId)))];

  // Each read once, however many plates repeat a recipe or a line repeats an ingredient.
  const [cards, ingredientImages] = await Promise.all([
    Promise.all(
      recipeIds.map(async (id) => {
        const recipe = pool.recipes.get(id)!;
        const plate = recipe.plateImageId ? await getImage(ctx, recipe.plateImageId) : null;
        return [id, { card: toRecipeCard(recipe, args.locale, null, plate) }] as const;
      }),
    ).then((entries) => new Map(entries)),
    Promise.all(
      ingredientIds.map(async (id) => {
        const imageId = pool.ingredients.get(id)!.imageId;
        const image = imageId ? await getImage(ctx, imageId) : null;
        return [id, image?.sizes.thumbnail.url] as const;
      }),
    ).then((entries) => new Map(entries)),
  ]);

  return selected.map(({ plate, candidate, covered }) => {
    const { card } = cards.get(candidate.recipeId)!;
    const isCovered = new Set(covered);

    return {
      recipeId: candidate.recipeId,
      date: plate.date,
      slot: plate.slot,
      servings: plate.servings,
      title: card.title,
      minutes: card.minutes,
      imageUrl: card.plateImageUrl,
      ingredients: candidate.needs.map((need) => {
        const ingredient = pool.ingredients.get(need.ingredientId)!;

        return {
          ingredientId: need.ingredientId,
          name: resolvei18n(ingredient.name, args.locale),
          emoji: ingredient.emoji,
          category: ingredient.category,
          imageUrl: ingredientImages.get(need.ingredientId),
          amount: need.quantity,
          unit: need.unit,
          covered: isCovered.has(need),
        };
      }),
    };
  });
};
