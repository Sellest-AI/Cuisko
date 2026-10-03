import type * as z from "zod/v4";

import type { Id } from "@convex/_generated/dataModel";
import { modelRecipeSchema, type SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import { AUTHORED_TAGS, Tag, type AuthoredTag } from "@shared/tags";
import { type FatUse, RecipeUnit } from "@shared/ingredients";
import { Equipment } from "@shared/equipments";
import { Cuisine } from "@shared/cuisines";
import { DifficultyLevel, type InstructionGroup } from "@shared/recipes";

/**
 * What `sanitizeRecipe`'s `outdated` argument expects — the model's own schema, not this file's.
 *
 * The ingredients are the app's own shape rather than the schema's, which also allows a `null`
 * `fatUse`: a stored line is never null, and `reviseRecipe` hands these lines on to
 * `vSanitizedRecipe` untouched when the model does not run.
 */
export type ModelRecipe = Omit<z.infer<typeof modelRecipeSchema>, "ingredients"> & {
  ingredients: SanitizedRecipe["ingredients"];
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
  instructions: InstructionGroup[];
  ingredients: { name: string; quantity: number; unit: RecipeUnit; fatUse?: FatUse }[];
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
  ingredients: recipe.ingredients.map(({ name, quantity, unit, fatUse }) => ({
    name,
    quantity,
    unit,
    ...(fatUse && { fatUse }),
  })),
})
