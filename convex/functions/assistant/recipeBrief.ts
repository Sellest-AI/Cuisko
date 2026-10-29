import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { vCookingRecipe } from "@convex/schema/assistantPayloads";
import { roundQuantity } from "@shared/ingredients";
import { parseInstructions } from "@shared/recipes";
import { isServings, scaleQuantity } from "@shared/servings";
import type { Locale } from "@shared/translations";
import type { Infer } from "convex/values";

import { loadRecipeContent } from "../recipes/recipeContent";
import { loadRecipeLines } from "../recipes/recipeNutrition";

/**
 * The recipe a cook is in the middle of: its id, the step on screen (numbered from 1 across groups,
 * as the cooking screen numbers it), and how many they are making, which the stepper may have moved
 * off the recipe's own.
 */
export type CookingRecipe = Infer<typeof vCookingRecipe>;

type Args = { recipe: CookingRecipe; locale: Locale };

/**
 * The `<recipe>` block of a turn's brief: the dish the cook asked from, so "how much salt?" is
 * about this pot and not salt in general.
 *
 * **Ingredients scaled, steps as written.** The lines go out for the servings the cook is making,
 * by `scaleQuantity` — the rule the recipe screens scale by, so the brief quotes the amount on the
 * cook's screen — rounded to the unit's precision (`roundQuantity`). The amounts written inside
 * the steps are not rewritten (`scaleInstructions` is the client's alone), so the block says so and
 * the prompt has the model read amounts from the ingredients. A `servings` `isServings` refuses is
 * not something the stepper can send, so it is dropped rather than trusted, and the lines stay
 * as written.
 *
 * **Steps numbered as on screen.** One run from 1 across groups, the way `flattenSteps` numbers
 * the cooking session, so "current step: 3" is the step the cook is looking at. A `step` outside
 * the method is dropped like a bad `servings`: the rest of the block is still worth sending.
 *
 * `undefined` when the id names nothing, so the question is answered without the block rather
 * than refused. An archived recipe still reads — a read by id never asks (ADR 0017). No ids go in:
 * nothing here is something the model should recite or hand to a tool (ADR 0010).
 */
export const recipeBrief = async (ctx: QueryCtx, { recipe, locale }: Args): Promise<string | undefined> => {
  const row = await ctx.db.get(recipe.id);
  if (!row) return undefined;

  const [{ lines }, { instructions }] = await Promise.all([loadRecipeLines(ctx, row._id), loadRecipeContent(ctx, row)]);
  const steps = parseInstructions(resolvei18n(instructions, locale)).flatMap((group) =>
    group.steps.map(({ instruction }) => (group.title ? `(${group.title}) ${instruction}` : instruction)),
  );

  const { step, servings } = recipe;
  const isStepShown = step !== undefined && Number.isInteger(step) && step >= 1 && step <= steps.length;
  const isServingsShown = servings !== undefined && isServings(servings);
  const wanted = isServingsShown ? servings : row.servings;

  return [
    "<recipe>",
    `name: ${resolvei18n(row.title, locale)}`,
    `written for: ${row.servings}`,
    ...(isServingsShown ? [`cooking for: ${servings}`] : []),
    "scaled ingredients:",
    ...lines.map(({ ingredient, quantity, unit }) => {
      const amount = roundQuantity(scaleQuantity(quantity, row.servings, wanted), unit);
      return `- ${amount} ${unit} ${resolvei18n(ingredient.name, locale)}`;
    }),
    "not-scaled steps:",
    ...steps.map((instruction, index) => `${index + 1}. ${instruction}`),
    ...(isStepShown ? [`current step: ${step}`] : []),
    "</recipe>",
  ].join("\n");
};
