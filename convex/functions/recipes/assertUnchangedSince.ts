import type { Doc } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { loadRecipe } from "./loadRecipe";
import { recipeFingerprint } from "./recipeFingerprint";

type Args = {
  recipe: Doc<"recipes">;
  /** The locale the verify read the recipe in. */
  locale: Locale;
  /** `recipeFingerprint` of the recipe the verifier was handed. */
  fingerprint: string;
};

/**
 * Refuses a write built from a recipe whose text changed since the verifier read it.
 *
 * A verify reads the recipe, then spends seconds on a scrape and a model call before it writes. A
 * cook saving in that window would otherwise have their new text overwritten by the rewrite, or
 * marked `reviewed` by the acceptance, though the verifier never saw it. Refusing costs the admin
 * a retry; letting it through marks unverified text verified.
 *
 * Compares what the verifier read rather than `updatedAt`: a fresh import's translation into the
 * other locale and its photos land during its first verify, write the row, and change nothing it
 * judged.
 *
 * @limitation The fingerprint is one locale's text, so it answers "did what the verifier read
 *   change", not "did anyone edit the recipe". Three cases come out wrong, each needing a write
 *   inside the seconds a verify runs:
 *   - a cook saving in the OTHER locale is let through, since `updateRecipe` rewrites only the
 *     locale edited, and the recipe ends `reviewed` over their unverified text;
 *   - a translation INTO the verify's locale is refused, since `resolvei18n` read the fallback
 *     language before it landed;
 *   - a catalog ingredient renamed or translated is refused, since a line is named from its
 *     catalog row (`loadRecipe`).
 *   Accepted for now: a refusal costs a retry, and the let-through needs a cook and an admin on the
 *   same recipe at once. Closing all three means a `revision` counter that only `updateRecipe`
 *   bumps, compared in place of the fingerprint.
 */
export const assertUnchangedSince = async (ctx: MutationCtx, { recipe, locale, fingerprint }: Args): Promise<void> => {
  const current = recipeFingerprint(await loadRecipe(ctx, { recipe, locale }));

  if (current !== fingerprint)
    throw new Error(`recipe ${recipe._id} changed while it was being verified; verify it again.`);
};
