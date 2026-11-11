import * as z from "zod/v4";

import {
  isRatioField,
  REPAIRABLE_FIELDS,
  type RatioField,
  type RepairableField,
} from "@convex/schema/ingredientPayloads";
import { CATEGORIES } from "@shared/categories";
import { retryPromise } from "@shared/helpers";
import { UNITS } from "@shared/ingredients";
import { SUPPORTED_LOCALES, type Locale } from "@shared/translations";

import { ingredientsAgent } from "../agents";
import { REPAIR_INGREDIENT_PROMPT } from "../config/prompts/repairIngredient";
import { createTool, parseModelOutput, providerSchema, wrapAgent, type TracedToolCtx } from "../utils";

const _inputSchema = z.object({
  recipeTitle: z.string().optional().describe("The recipe's title, for the trace and the prompt."),
  names: z.object(
    Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, z.string()])) as { [K in Locale]: z.ZodString },
  ).describe("The row's name in every language."),
  category: z.enum(CATEGORIES),
  defaultUnit: z.enum(UNITS).describe("How the food is bought."),
  nutrition: z.record(z.string(), z.number()).describe("What the row already holds, per 100 g."),
  missing: z.array(z.enum(REPAIRABLE_FIELDS)).min(1).describe("The fields to fill, and only these."),
});

export type RepairIngredientInput = z.infer<typeof _inputSchema>;

export type RepairIngredientOutput = {
  fields: Partial<Record<RepairableField, number>>;
  /** Ratio fields only: a nutrient always has an answer. "Chicken has no density" → ["gramsPerMl"]. */
  refused: RatioField[];
};

/**
 * The output schema, built from the fields asked: ham missing a slice weight sees one field.
 *
 * A weight is positive, a nutrient may be 0 (0 g of sugars is an answer). Each is
 * `.nullable().optional()`: null is the model's "I do not know", and `parseModelOutput` drops it as
 * an absent key. `refused` exists only when a weight is asked, and names only the weights asked.
 */
export const repairIngredientSchema = (missing: readonly RepairableField[]) => {
  const ratios = missing.filter(isRatioField);
  const fields = Object.fromEntries(
    missing.map((field) => [
      field,
      (isRatioField(field) ? z.number().positive() : z.number().min(0)).nullable().optional(),
    ]),
  );

  return z.object({
    ...fields,
    ...(ratios.length && {
      refused: z
        .array(z.enum(ratios as [RatioField, ...RatioField[]]))
        .describe("The weights that have no answer for this food. Empty when every one has."),
    }),
  });
};

/** What the call is shown. Exported so the manual test scores the prompt the tool sends. */
export const repairIngredientUserPrompt = ({
  recipeTitle,
  names,
  category,
  defaultUnit,
  nutrition,
  missing,
}: RepairIngredientInput) =>
  [
    recipeTitle && `The recipe that needs more details from this ingredient is ${recipeTitle}.`,
    `The food: ${JSON.stringify(names)} — category ${category}, bought in ${defaultUnit}.`,
    `What the row already holds, per 100 g: ${JSON.stringify(nutrition)}`,
    `Fill these fields, and only these: ${missing.join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

/**
 * The model's answer as the repair reads it: the numbers it gave, and the weights it refused.
 * A field both answered and refused is refused: the refusal is the stronger claim.
 */
export const toRepairOutput = (
  missing: readonly RepairableField[],
  answer: Partial<Record<RepairableField, number>> & { refused?: RatioField[] },
): RepairIngredientOutput => {
  const refused = [...new Set(answer.refused ?? [])].filter((field) => missing.includes(field));
  const fields = Object.fromEntries(
    missing.flatMap((field) =>
      answer[field] === undefined || (refused as RepairableField[]).includes(field) ? [] : [[field, answer[field]]],
    ),
  );

  return { fields, refused };
};

/**
 * The fields a catalog row lacks, filled by one structured call — `repairIngredient` in
 * `functions/ingredients/` is the step that reads the row and writes the result.
 *
 * Nothing is written down — `saveMessages: "none"`, for the reason `sanitizeIngredient` gives: this
 * is a transformation, not a conversation. It writes no row either; it returns numbers.
 */
export const repairIngredient = createTool({
  description: "Fill the missing weights and nutrients of one catalog ingredient, or refuse a weight it cannot have.",
  inputSchema: _inputSchema,
  execute: async (ctx: TracedToolCtx, args): Promise<RepairIngredientOutput> => {
    const schema = repairIngredientSchema(args.missing);

    // The parse is inside the retry, as in `sanitizeIngredient`: a shape the provider accepted
    // and the authored schema refuses is worth one more call, not a failed job.
    return retryPromise(async () => {
      const result = await wrapAgent(ingredientsAgent).generateObject(
        ctx,
        {},
        {
          system: REPAIR_INGREDIENT_PROMPT,
          prompt: repairIngredientUserPrompt(args),
          schema: providerSchema(schema),
          output: "object",
          maxRetries: 3,
        },
        { storageOptions: { saveMessages: "none" } },
      );

      // The schema is built at run time, so its parsed type is only known as this shape.
      const answer = parseModelOutput(schema, result.object) as Parameters<typeof toRepairOutput>[1];

      return toRepairOutput(args.missing, answer);
    }, 2);
  },
});

