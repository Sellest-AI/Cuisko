import type * as z from "zod/v4";

import type { Id } from "@convex/_generated/dataModel";
import { modelRecipeSchema } from "@convex/agent/tools/sanitizeRecipe";
import { AUTHORED_TAGS, Tag, type AuthoredTag } from "@shared/tags";
import { RecipeUnit } from "@shared/ingredients";
import { Equipment } from "@shared/equipments";
import { Cuisine } from "@shared/cuisines";
import { DifficultyLevel } from "@shared/recipes";

/** What `sanitizeRecipe`'s `outdated` argument expects — the model's own schema, not this file's. */
export type ModelRecipe = z.infer<typeof modelRecipeSchema> & {
  /** Absent only for a seeded row with no owner — `recipes.userId` is itself optional. */
  userId?: Id<"users">;
};

const _isAuthoredTag = (tag: string): tag is AuthoredTag =>
  (AUTHORED_TAGS as readonly string[]).includes(tag);

type RecipeInput = {
  userId?: Id<"users">;
  title: string;
  description: string;
  servings: number;
  difficulty: DifficultyLevel;
  cuisine: Cuisine;
  tags: Tag[];
  equipments: Equipment[];
  timings: {
    preparation?: number;
    cooking?: number;
    resting?: number;
  };
  instructions: { title?: string; steps: string[] }[];
  ingredients: { name: string; quantity: number; unit: RecipeUnit; }[];
}

export const toModelRecipe = (recipe: RecipeInput): ModelRecipe => ({
  userId: recipe.userId,
  title: recipe.title,
  description: recipe.description,
  servings: recipe.servings,
  difficulty: recipe.difficulty,
  cuisine: recipe.cuisine,
  tags: recipe.tags.filter(_isAuthoredTag),
  equipments: recipe.equipments,
  timings: recipe.timings,
  instructions: recipe.instructions,
  ingredients: recipe.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
})
