import type { RecipeDetail } from "../recipes/loadRecipe";

/** What `get_recipe` returns, and all of it: the component rejects a result with any extra field. */
export type McpRecipe = {
  id: string;
  title: string;
  description: string;
  servings: number;
  /** Absent on a recipe with no timings: 0 would tell an agent it takes no time. */
  minutes?: number;
  /** The dish photographed in its setting. Never the plate, which is a cut-out for the week screen. */
  coverImageUrl?: string;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: { title?: string; steps: { instruction: string; hints: string[] }[] }[];
};

/**
 * A recipe as an outside agent reads it. Field by field rather than a spread, so `userId`, `sourceUrl`
 * and `chef`, which the payload this reads may carry, cannot leave with it.
 */
export const toMcpRecipe = (recipe: RecipeDetail): McpRecipe => ({
  id: recipe.id,
  title: recipe.title,
  description: recipe.description,
  servings: recipe.servings,
  ...(recipe.minutes !== undefined && { minutes: recipe.minutes }),
  ...(recipe.coverImageUrl !== undefined && { coverImageUrl: recipe.coverImageUrl }),
  ingredients: recipe.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
  instructions: recipe.instructions.map(({ title, steps }) => ({
    ...(title !== undefined && { title }),
    steps: steps.map(({ instruction, hints }) => ({ instruction, hints })),
  })),
});
