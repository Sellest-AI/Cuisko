import type { Doc } from "@convex/_generated/dataModel";
import type { Diet } from "@shared/diets";

/** The three facets a diet is promised by, and nothing else of the row. */
export type DietFacets = Pick<Doc<"recipes">, "isVegan" | "isVegetarian" | "isPescatarian">;

/**
 * The recipe facet a diet is promised by, or `null` for a diet nothing needs to promise.
 *
 * `dietTagsOf` nests the three claims — a vegan recipe is also vegetarian and pescatarian — so one
 * flag per diet is complete: a vegetarian cook reads `isVegetarian` alone and still sees every
 * vegan dish. Omnivore has no flag because every recipe suits it, and a search that narrowed on
 * one would be narrowing on nothing.
 */
export const dietFacetOf = (diet: Diet): keyof DietFacets | null => {
  switch (diet) {
    case "vegan":
      return "isVegan";
    case "vegetarian":
      return "isVegetarian";
    case "pescatarian":
      return "isPescatarian";
    case "omnivore":
      return null;
  }
};

/** Whether a recipe keeps the promise a diet needs. Every recipe suits an omnivore. */
export const suitsDiet = (recipe: DietFacets, diet: Diet): boolean => {
  const facet = dietFacetOf(diet);

  return facet === null || recipe[facet];
};
