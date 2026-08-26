import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { TranslatedRecipe } from "@convex/agent/tools/translateRecipe";
import { hashText, resolvei18n, setTranslations } from "@convex/lib/i18n";
import type { Locale, Localized } from "@convex/schema/i18n";
import { serializeInstructions } from "@shared/recipes";

type Args = {
  recipeId: Id<"recipes">;
  /** The language the recipe was written in — the one every translation here was made FROM. */
  sourceLocale: Locale;
  translations: TranslatedRecipe[];
};

/**
 * Machine translations folded into the three localized columns that carry language.
 *
 * A patch and not an insert, so a recipe already holding a cook's own `edited` text keeps it for
 * the locales this run did not touch — `setTranslations` writes only the locales it is handed.
 *
 * `sourceHash` is the hash of the SOURCE text — the field's value in `sourceLocale` — and not of
 * the translation being written. That is the whole point of the field: a later run re-hashes the
 * source and compares, so a cook editing the English steps marks the French ones stale. Hashing
 * the translation instead would compare a value against itself, and the check could never fire.
 * It follows that one hash covers every locale of a field, so it is computed once per field.
 */
export const saveTranslations = async (
  ctx: MutationCtx,
  { recipeId, sourceLocale, translations }: Args,
) => {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe) throw new Error(`saveTranslations: recipe ${recipeId} does not exist.`);

  const fold = (field: Localized, read: (translation: TranslatedRecipe) => string) => {
    const sourceHash = hashText(resolvei18n(field, sourceLocale));

    return setTranslations(
      field,
      translations.map((translation) => ({
        locale: translation.locale,
        value: read(translation),
        status: "machine" as const,
        sourceHash,
      })),
    );
  };

  await ctx.db.patch(recipeId, {
    title: fold(recipe.title, ({ recipe }) => recipe.title),
    description: fold(recipe.description, ({ recipe }) => recipe.description),
    instructions: fold(recipe.instructions, ({ recipe }) =>
      serializeInstructions(recipe.instructions),
    ),
    updatedAt: Date.now(),
  });
};
