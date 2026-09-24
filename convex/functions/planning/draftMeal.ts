import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import { getImage } from "@convex/functions/media/getImage";
import { plateOf, toRecipeCard } from "@convex/functions/recipes/recipeCard";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import type { MealSlot } from "@shared/mealSlots";

import { availableStock } from "./availableStock";
import { draftMealOf, type DraftMeal } from "./draftMealOf";
import { isServings } from "./limits";
import { recipeLines } from "./recipeLines";
import { scaleLines } from "./scaleLines";
import { coverageOf } from "./selectMeals";

type Args = {
  householdId: Id<"households">;
  recipeId: Id<"recipes">;
  locale: Locale;
  /** Local-day timestamp, the client's — "Tuesday" has to mean its Tuesday. */
  date: number;
  slot: MealSlot;
  servings: number;
  /** Local-day timestamp of today: meals planned from here on still hold their stock. */
  today: number;
};

/**
 * One recipe as a draft plate: the dish a cook swaps into the week the tunnel generated.
 *
 * The same reads `planDraft` makes for a whole week, for one plate whose recipe is already chosen:
 * the recipe's lines, scaled to the plate, weighed against what the cellar can still give, and
 * projected by `draftMealOf` — so the review step draws a swapped-in dish exactly as it draws a
 * generated one, lines and `covered` flags included.
 *
 * **Weighed against the cellar alone, not against the draft's other plates.** A generated week
 * scores its plates in eating order, each against what the previous ones left. A swap has no such
 * order to stand in — the draft is the client's, and nothing here knows which plates it still
 * holds — so this plate sees the full available stock. The commit recomputes every plate against
 * the cellar as it stands then, so what the review step shows is an estimate either way; this one
 * errs towards "covered" for one plate rather than towards a shop nobody needs.
 *
 * A recipe may be anyone's (ADR 0014). A missing one is refused rather than answered with an
 * empty plate: the id came from a tile that was drawn from the catalog a moment ago, so a miss is a
 * recipe deleted under the cook, and the sheet must say so rather than put nothing on the plate.
 */
export const draftMeal = async (ctx: QueryCtx, args: Args): Promise<DraftMeal> => {
  if (!isServings(args.servings)) throw new ConvexError({ code: "INVALID_INPUT" });

  const recipe = await ctx.db.get(args.recipeId);
  if (!recipe) throw new ConvexError({ code: "NOT_FOUND", message: "No such recipe." });

  const [stock, lines, plate] = await Promise.all([
    availableStock(ctx, args.householdId, args.today),
    recipeLines(ctx, args.recipeId),
    plateOf(ctx, recipe),
  ]);

  const needs = scaleLines(
    lines.map((row) => row.line),
    { recipeServings: recipe.servings, servings: args.servings },
  );

  /** `isMine` only steers the own-share cap of a week's selection; a chosen plate has no cap to obey. */
  const { covered } = coverageOf({ recipeId: args.recipeId, needs, cuisine: recipe.cuisine, isMine: false }, stock);

  const ingredients = new Map<Id<"ingredients">, Doc<"ingredients">>(
    lines.map((row) => [row.ingredient._id, row.ingredient]),
  );

  const ingredientImages = new Map(
    await Promise.all(
      [...ingredients.values()].map(async (ingredient) => {
        const image = ingredient.imageId ? await getImage(ctx, ingredient.imageId) : null;

        return [ingredient._id, image?.sizes.thumbnail.url] as const;
      }),
    ),
  );

  return draftMealOf({
    plate: { date: args.date, slot: args.slot, servings: args.servings },
    recipeId: args.recipeId,
    card: toRecipeCard(recipe, args.locale, null, plate),
    needs,
    covered,
    ingredients,
    ingredientImages,
    locale: args.locale,
  });
};
