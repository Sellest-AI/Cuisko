import type { Id } from "@convex/_generated/dataModel";
import { hashText, setTranslation } from "@convex/lib/i18n";
import type { Localized } from "@convex/schema/i18n";
import type { MutationCtx } from "@convex/procedures";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { Locale } from "@shared/translations";
import { serializeInstructions } from "@shared/recipes";
import { facetsOf } from "@shared/tags";

import { matchIngredients } from "../ingredients/matchIngredients";
import { computeTags, type TaggableLine } from "./computeTags";
import { recipeSearchText } from "./recipeSearchText";

type Args = {
  userId: Id<"users">;
  /** The language the recipe was generated in — the only one it exists in at this point. */
  locale: Locale;
  recipe: SanitizedRecipe;
};

/** The model wrote this text, in `locale` — not the cook's own words, so the status is `machine`. */
const _machine = (locale: Locale, value: string): Localized =>
  setTranslation(undefined, locale, value, "machine", hashText(value));

/**
 * A generated recipe into a `recipes` row plus its catalog links.
 *
 * Only ingredients that matched CONFIDENTLY are linked. An ambiguous or unmatched name is dropped
 * from `recipeIngredients` rather than guessed at: the name is still in the instructions the cook
 * reads, and a wrong link is a wrong pantry deduction later. Resolving those is a screen, not an
 * insert — deliberately out of this slice.
 */
export const saveRecipe = async (ctx: MutationCtx, { userId, locale, recipe }: Args) => {
  const matches = await matchIngredients(ctx, {
    names: recipe.ingredients.map(({ name }) => name),
    locale,
  });

  // Over every line the recipe has, matched or not — `computeTags` needs the unmatched ones to
  // know it cannot answer. The links inserted below are the matched subset, which is a different
  // question and deliberately a narrower one.
  const computed = await computeTags(ctx, {
    lines: recipe.ingredients.map((line, index) => {
      const match = matches[index];
      return {
        ingredientId: match?.status === "matched" ? match.ingredientId : undefined,
        quantity: line.quantity,
        unit: line.unit,
      };
    }).filter((line): line is TaggableLine => line.ingredientId !== undefined),
    lineCount: recipe.ingredients.length,
    servings: recipe.servings,
  });

  const tags = [...recipe.tags, ...computed];

  // The two derived fields are written HERE and only here, from the values one line above them.
  // `facetsOf` is a projection of `tags` rather than a second derivation, so the boolean and the
  // tag cannot disagree. `recipeSearchText` decides which terms a recipe contributes and reads the
  // ingredient rows to get them; the blob itself is assembled by `searchTextOf`, the one serializer
  // ADR 0011 governs.
  const search = await recipeSearchText(ctx, {
    ingredientIds: matches.flatMap((match) =>
      match.status === "matched" ? [match.ingredientId] : [],
    ),
    names: recipe.ingredients.map((line) => line.name),
  });

  const recipeId = await ctx.db.insert("recipes", {
    userId,
    title: _machine(locale, recipe.title),
    description: _machine(locale, recipe.description),
    instructions: _machine(locale, serializeInstructions(recipe.instructions)),
    servings: recipe.servings,
    equipments: recipe.equipments,
    difficulty: recipe.difficulty,
    tags,
    ...facetsOf(tags),
    search,
    cuisine: recipe.cuisine,
    timings: recipe.timings,
    updatedAt: Date.now(),
  });

  // `matchIngredients` answers one entry per name, in the order it was given them, so the index is
  // the link between a match and the line it came from. Looking the line up by NAME instead would
  // silently collapse a recipe that lists the same ingredient twice.
  await Promise.all(
    recipe.ingredients.map((line, index) => {
      const match = matches[index];
      if (match?.status !== "matched") return;
      return ctx.db.insert("recipeIngredients", {
        recipeId,
        ingredientId: match.ingredientId,
        position: index,
        quantity: line.quantity,
        unit: line.unit,
        updatedAt: Date.now(),
      });
    }),
  );

  return recipeId;
};
