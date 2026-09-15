import type { Doc, Id } from "@convex/_generated/dataModel";
import type { RecipeCard } from "@convex/functions/recipes/recipeCard";
import { resolvei18n } from "@convex/lib/i18n";
import type { Locale } from "@convex/schema/i18n";
import type { Category } from "@shared/categories";
import type { Unit } from "@shared/ingredients";
import type { MealSlot } from "@shared/mealSlots";

import type { Need, Plate } from "./selectMeals";

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

type Args = {
  plate: Plate;
  recipeId: Id<"recipes">;
  /** The recipe as a card, already in the caller's language and with its plate picture read. */
  card: RecipeCard;
  /** The plate's lines, scaled to its servings, and the subset the cellar covers. */
  needs: Need[];
  covered: Need[];
  /** The catalog row behind every line, and its thumbnail where one exists. */
  ingredients: Map<Id<"ingredients">, Doc<"ingredients">>;
  ingredientImages: Map<Id<"ingredients">, string | undefined>;
  locale: Locale;
};

/**
 * A plate as the review step draws it, from the documents a caller has already read.
 *
 * Pure, and shared by the two callers that produce draft plates: `planDraft` for a whole week and
 * `draftMeal` for the one dish a cook swaps in. The maps are the caller's so a week reads each
 * recipe and each ingredient once however many plates repeat them.
 *
 * `covered` is compared by identity, not by value: `coverageOf` hands back the very `Need` objects
 * it was given, so a recipe naming the same ingredient twice keeps its two lines apart.
 */
export const draftMealOf = ({ plate, recipeId, card, needs, covered, ingredients, ingredientImages, locale }: Args): DraftMeal => {
  const isCovered = new Set(covered);

  return {
    recipeId,
    date: plate.date,
    slot: plate.slot,
    servings: plate.servings,
    title: card.title,
    minutes: card.minutes,
    imageUrl: card.plateImageUrl,
    ingredients: needs.map((need) => {
      const ingredient = ingredients.get(need.ingredientId)!;

      return {
        ingredientId: need.ingredientId,
        name: resolvei18n(ingredient.name, locale),
        emoji: ingredient.emoji,
        category: ingredient.category,
        imageUrl: ingredientImages.get(need.ingredientId),
        amount: need.quantity,
        unit: need.unit,
        covered: isCovered.has(need),
      };
    }),
  };
};
