import type { Id } from "@convex/_generated/dataModel";
import { sanitizeRecipe, type SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { AppUser, TracedActionCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { enforceRateLimit } from "../rateLimits/enforceRateLimit";
import type { RecipeDetail } from "./loadRecipe";
import { recipeChangesOf, type RecipeEdit, reviseRecipe, sanitizeArgsOf } from "./recipeChangesOf";
import { resolveRecipeIngredients, type RecipeLink } from "./resolveRecipeIngredients";
import { toModelRecipe } from "./toModelRecipe";

type Args = {
  /** The cook's edited free text, already asserted non-blank by the caller. */
  edit: RecipeEdit;
  /** The row being revised, as `getOne._internal` returns it — loaded by the caller, not here. */
  stored: RecipeDetail & { userId?: Id<"users"> };
  locale: Locale;
};

type Regenerated = {
  recipe: SanitizedRecipe;
  links: RecipeLink[];
  /**
   * Whether `links` is the whole answer, or short because a walk threw or a cap dropped a name.
   *
   * Carried all the way to `updateRecipe` because that is where it matters: an edit replaces the
   * row's links wholesale, so a short set persisted after an API outage deletes correct links the
   * first save paid for. A refusal does not clear this — that is a decision, and it should apply.
   */
  complete: boolean;
  /**
   * Whether the agent actually ran. `updateRecipe` writes `"machine"` or `"edited"` off it, because
   * a field the model never saw is the cook's own words.
   */
  analyzed: boolean;
  /** Whether the other locale's text is now stale — the caller decides what to do about it. */
  requiresTranslation: boolean;
};

/**
 * `generateRecipe` for a row that already exists: the cook's edit, turned into the recipe to patch
 * and the catalog rows its lines belong to.
 *
 * Two things here are decisions and not steps.
 *
 * **The agent runs only if the ingredients moved.** It is what turns ingredient text into lines,
 * quantities and units, so an edit that only retitled the recipe has nothing for the model to
 * re-derive — `recipeChangesOf` is what says so, and `reviseRecipe` carries the cook's text through
 * untouched when it does. This is the decision that saves money. Difficulty, cuisine, timings,
 * equipment and authored tags are the agent's only on the first save; from then on they are the
 * cook's, and even a rerun does not overwrite them.
 *
 * **Every ingredient line is resolved again, including the ones the edit never touched.** An
 * earlier design passed the row's existing links through to skip those walks; it could not work,
 * because the only ingredient name `loadRecipe` can return is the CATALOG row's, while the recipe
 * arriving here carries the line's own wording — `oignon` against a row called `Oignon jaune` —
 * and the two never matched. Re-walking is cheap instead of clever: a line that linked before has
 * a catalog row by now, so `gatherEvidence` answers it from its first step and returns before any
 * dataset, API or model. The lines that would be expensive to re-walk are the ones that never
 * linked, which no reuse could have covered either.
 */
export const regenerateRecipe = async (
  ctx: TracedActionCtx & { userId: Id<"users">; user: Pick<AppUser, "role"> },
  { edit, stored, locale }: Args,
): Promise<Regenerated> => {
  // Every save, not only the ones that reach the agent: each one re-resolves every ingredient line,
  // and a line that never linked is walked again (two live APIs, then the model) on a title-only edit.
  await enforceRateLimit(ctx, "recipeWrite");

  const outdated = toModelRecipe(stored);
  const { requiresNewAnalysis, requiresTranslation } = recipeChangesOf(edit, outdated);

  const analyzed = requiresNewAnalysis
    ? await sanitizeRecipe.run(ctx, sanitizeArgsOf(edit, outdated, locale))
    : undefined;

  const recipe = reviseRecipe(edit, outdated, analyzed);

  // Every line is re-resolved, including the ones the edit did not touch, and that is cheap on
  // purpose: a line that linked on the first save has a catalog row by then — the row was found or
  // the save invented it — and `rememberAlias` stored its exact spelling. So `gatherEvidence`
  // answers it from step 1, the catalog read, and returns before any dataset, API or model. The
  // lines that WOULD be expensive to re-walk are the ones that never linked, which no reuse could
  // have covered either.
  const { links, complete } = await resolveRecipeIngredients(ctx, { recipe, locale });

  return { recipe, links, complete, analyzed: requiresNewAnalysis, requiresTranslation };
};
