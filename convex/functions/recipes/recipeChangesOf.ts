import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { ModelRecipe } from "@convex/functions/recipes/toModelRecipe";
import type { Cuisine } from "@shared/cuisines";
import type { Equipment } from "@shared/equipments";
import { serializeIngredients } from "@shared/ingredients";
import {
  type DifficultyLevel,
  MAX_TIMING_MINUTES,
  parseInstructions,
  serializeInstructions,
  toInstructionGroups,
  type Timings,
  wholeTimingsOf,
} from "@shared/recipes";
import type { AuthoredTag } from "@shared/tags";
import type { Locale } from "@shared/translations";
import { ConvexError } from "convex/values";

/**
 * What an edit carries — every field the cook can change, and nothing else. `vRecipeEdit` in
 * `schema/recipePayloads.ts` is the validator half of this shape.
 *
 * Two kinds of field. The first five are free text (and a count) the agent may revise when it runs.
 * The last five are the ones the agent guessed on the first save and the cook now states by hand —
 * closed vocabularies and numbers, so none of them is ever translated or re-analyzed.
 *
 * Exported because `updateOne` composes its own arguments from it rather than restating the
 * fields: two copies of this shape can disagree, and the one that drifts would be the validator.
 */
export type RecipeEdit = {
  title: string;
  description: string;
  servings: number;
  ingredients: string;
  instructions: string;
  tags: AuthoredTag[];
  equipments: Equipment[];
  difficulty: DifficultyLevel;
  cuisine: Cuisine;
  timings: Timings;
};

/**
 * The five fields the cook sets by hand, and which win over the agent's answer whatever it says.
 *
 * Timings rounded here because the editor sends the stored ones back untouched, and a row saved
 * before the agent's answer was rounded may still hold `7.5`.
 */
const _handSetOf = ({ tags, equipments, difficulty, cuisine, timings }: RecipeEdit) => ({
  tags,
  equipments,
  difficulty,
  cuisine,
  timings: wholeTimingsOf(timings),
});

/**
 * The row the model is shown as "the recipe as it stands", with the cook's five fields written over
 * it.
 *
 * Without it the prompt would describe the recipe the cook just corrected: retag a dish as a
 * starter and rewrite its ingredients in the same save, and the model re-derives the tags while
 * being told it is still a main. `reviseRecipe` re-forces the five anyway — this makes the model
 * better informed, it does not make it the authority.
 *
 * ⚠️ Applied only to what the MODEL sees, never to what `recipeChangesOf` compares against. Overlay
 *    the stored row before that comparison and every edit compares equal to itself, and the agent
 *    never runs again. Nothing fails loudly if this is wrong — the prompt just gets worse context —
 *    so `updateOne.test.ts` asserts the `outdated` the model receives.
 */
const _editedContextOf = (outdated: ModelRecipe, args: RecipeEdit): ModelRecipe => ({
  ...outdated,
  ..._handSetOf(args),
});

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
  outdated: _editedContextOf(outdated, args),
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

const _isTiming = (minutes: number | undefined) =>
  minutes === undefined || (minutes > 0 && Math.round(minutes) <= MAX_TIMING_MINUTES);

/**
 * The timings, held to what the editor's own parser would accept: above zero, at most a week. Same
 * reasoning as `assertFilledIn` — `v.number()` lets a client send `-5` or `1e9`, and that number is
 * summed into what the planner filters a week on.
 *
 * A fraction is not refused: `_handSetOf` rounds it. Refusing it would lock the cook out of any row
 * the agent timed as `7.5` — the editor sends that value back on every save, whatever was edited.
 */
export const assertTimingsInRange = ({ timings }: Pick<RecipeEdit, "timings">) => {
  if (![timings.preparation, timings.cooking, timings.resting].every(_isTiming))
    throw new ConvexError({ code: "INVALID_ARGUMENT", message: "Timings must be above zero and at most a week." });
};

export type RecipeChanges = {
  /**
   * Whether the ingredient list changed — the one edit that needs the agent, since it is what turns
   * ingredient text into structured lines. Re-deriving them from text nobody touched would be
   * answering a question that was not asked. (The computed tags follow the lines on every write
   * regardless — `deriveRecipeFields` recomputes them without the agent.)
   *
   * @limitation A line's `fatUse` is read from the steps, yet an edit to the steps alone never
   * reaches the agent: "fry the tofu and drain the pan" rewritten as "fry the tofu, then add the
   * sauce to the pan" keeps the oil's `fried`, and the recipe goes on counting 60% of an oil now
   * eaten whole. Closing it means re-analyzing a steps-only edit on a recipe with a tagged line,
   * which costs a model call on an edit that today costs none.
   */
  requiresNewAnalysis: boolean;
  /** Whether any translated field changed, and the recipe's other locale is therefore stale. */
  requiresTranslation: boolean;
};

/**
 * `null` is a legal group title in `ModelRecipe`, and an absent hint list a legal step — both are
 * `modelRecipeSchema`'s own vocabulary, because that is what the AGENT may return.
 * `outdated.instructions` in practice carries neither: it comes straight from `RecipeDetail`, whose
 * groups are already `InstructionGroup`s. Normalized through `toInstructionGroups` rather than widening
 * `InstructionGroup`, which would make every OTHER caller of `serializeInstructions` carry a case
 * that can only happen on this one path.
 */
const _instructionsOf = (outdated: ModelRecipe) => toInstructionGroups(outdated.instructions);

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
 * `servings` and the five hand-set fields are the exception, and so they are re-forced AFTER that
 * spread. The cook stated each of them by hand rather than in prose — they typed `6`, they tapped
 * "starter" — and no amount of re-deriving the ingredients makes the agent's opinion more correct
 * than the answer they gave. `createOne` does the same for `servings` at its own persist call; the
 * two paths must not disagree about who owns that field.
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
    ...analyzed,
    servings: args.servings,
    ..._handSetOf(args),
  };
};
