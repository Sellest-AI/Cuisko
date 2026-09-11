import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { ModelRecipe } from "@convex/functions/recipes/toModelRecipe";
import { serializeIngredients } from "@shared/ingredients";
import { parseInstructions, serializeInstructions } from "@shared/recipes";
import type { Locale } from "@shared/translations";
import { ConvexError } from "convex/values";

/**
 * The free text an edit carries — every field the cook can change, and nothing else.
 *
 * Exported because `updateOne` composes its own arguments from it rather than restating the five
 * fields: two copies of this shape can disagree, and the one that drifts would be the validator.
 */
export type RecipeEdit = {
  title: string;
  description: string;
  servings: number;
  ingredients: string;
  instructions: string;
};

/**
 * What `sanitizeRecipe.run` takes, built from the edit and the row it revises.
 *
 * The one line worth naming here is `ingredients.split("\n")…`: `sanitizeRecipe` wants one entry
 * per line, the editor's textarea is one string, and that gap is this function's to close rather
 * than the router's.
 */
export const sanitizeArgsOf = (args: RecipeEdit, outdated: ModelRecipe, locale: Locale) => ({
  locale,
  title: args.title,
  description: args.description,
  servings: args.servings,
  ingredients: args.ingredients.split("\n").map((line) => line.trim()).filter(Boolean),
  instructions: args.instructions,
  outdated,
});

/**
 * "Bad data", named: a title or description with nothing meant by it.
 *
 * Checked here rather than left to `canSaveExisting` on the editor screen: a client is a request
 * this file cannot see the code of, so the one guarantee worth having is the one enforced where
 * the write actually happens.
 */
export const assertFilledIn = (args: Pick<RecipeEdit, "title" | "description">) => {
  if (!args.title.trim() || !args.description.trim())
    throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Title and description are required." });
};

export type RecipeChanges = {
  /**
   * Whether the ingredient list changed — the one edit that needs the agent: difficulty, cuisine,
   * timings and the computed tags are all derived from the ingredients, and re-deriving them from
   * text nobody touched would be answering a question that was not asked.
   */
  requiresNewAnalysis: boolean;
  /** Whether any translated field changed, and the recipe's other locale is therefore stale. */
  requiresTranslation: boolean;
};

/**
 * `null` is a legal group title in `ModelRecipe` — it is `modelRecipeSchema`'s own vocabulary for
 * "no heading", because that is what the AGENT may return. `outdated.instructions` in practice
 * never carries one: it comes straight from `RecipeDetail`, whose groups spell that the same way
 * `serializeInstructions` expects — `undefined`. Normalized here rather than widening
 * `InstructionGroup` to accept `null`, which would make every OTHER caller of `serializeInstructions`
 * carry a case that can only happen on this one path.
 */
const _instructionsOf = (outdated: ModelRecipe) =>
  outdated.instructions.map((group) => ({ ...group, title: group.title ?? undefined }));

/** Same normalization as `_instructionsOf`, for the other three fields `modelRecipeSchema` allows `null` on. */
const _timingsOf = (outdated: ModelRecipe): SanitizedRecipe["timings"] => ({
  preparation: outdated.timings.preparation ?? undefined,
  cooking: outdated.timings.cooking ?? undefined,
  resting: outdated.timings.resting ?? undefined,
});

/**
 * What the cook's edit actually touched, against the row it is revising.
 *
 * A pure comparison with no `ctx` in sight, which is what lets it and `reviseRecipe` below sit
 * beside the recipe functions they read rather than inlined in the router action that calls them —
 * `updateOne.ts` stays under C2's 90-line cap by having a body that is mostly orchestration.
 */
export const recipeChangesOf = (args: RecipeEdit, outdated: ModelRecipe): RecipeChanges => {
  const hasTitleChanged = args.title !== outdated.title;
  const hasDescriptionChanged = args.description !== outdated.description;
  const hasInstructionsChanged = args.instructions !== serializeInstructions(_instructionsOf(outdated));
  const hasIngredientsChanged = args.ingredients !== serializeIngredients(outdated.ingredients);

  return {
    requiresNewAnalysis: hasIngredientsChanged,
    requiresTranslation: hasTitleChanged || hasDescriptionChanged || hasInstructionsChanged,
  };
};

/**
 * The recipe `updateOne` persists: the cook's edited text layered over the row it came from, and
 * the agent's revision layered over THAT when one ran.
 *
 * `analyzed` fields spread last on purpose — when the agent ran, its answer is what actually
 * reflects the new ingredients (title, description and instructions included, since `sanitizeRecipe`
 * always returns a complete recipe), and it must win over the cook's raw text sitting underneath it.
 *
 * `servings` is the one exception, and so it is re-forced AFTER that spread. It is the only field
 * here the cook sets by number rather than by prose: they typed `6`, and no amount of re-deriving
 * the ingredients makes the agent's opinion about how many that feeds more correct than the answer
 * they gave. `createOne` does the same thing at its own persist call — the two paths must not
 * disagree about who owns this field.
 */
export const reviseRecipe = (
  args: RecipeEdit,
  outdated: ModelRecipe,
  analyzed: SanitizedRecipe | undefined,
): SanitizedRecipe => {
  // `userId` rides on `ModelRecipe` for the ownership check and is not part of `vSanitizedRecipe` —
  // spreading `outdated` whole would hand `_internal_persist` a field its validator rejects.
  const { userId: _userId, ...content } = outdated;

  return {
    ...content,
    title: args.title,
    description: args.description,
    instructions: parseInstructions(args.instructions),
    timings: _timingsOf(outdated),
    ...analyzed,
    servings: args.servings,
  };
};
