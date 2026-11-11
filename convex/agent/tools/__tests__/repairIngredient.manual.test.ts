/**
 * A live check of `repairIngredient`'s one call: does the shipped model fill a weight that exists,
 * and refuse one that does not?
 *
 * ⚠️ THIS COSTS MONEY — it calls OpenRouter for real. Run it by hand, after a prompt change:
 *
 *     pnpm test:manual
 *
 * It needs a real `OPENROUTER_API_KEY` in `.env.local`. Nothing automatic runs this file: it
 * belongs to the `manual` project alone.
 *
 * The prompt, schema, user prompt and parser are imported from the tool, so what is scored is what
 * ships. `wrapAgent` is not shared: the harness calls the provider directly.
 */
import { describe, expect, it } from "vitest";

import type { RepairableField } from "@convex/schema/ingredientPayloads";

import { runBakeOff, type Candidate } from "../../__bench__";
import { REPAIR_INGREDIENT_PROMPT } from "../../config/prompts/repairIngredient";
import { parseModelOutput } from "../../utils";
import {
  repairIngredientSchema,
  repairIngredientUserPrompt,
  toRepairOutput,
  type RepairIngredientInput,
  type RepairIngredientOutput,
} from "../repairIngredient";

/** The incumbent: `ingredientsAgent` runs on `models.ingredients`, GPT-6 Luna at low effort. */
const CANDIDATES: Candidate[] = [{ name: "openai/gpt-6-luna", modes: ["low"] }];

const bench = (title: string, input: RepairIngredientInput, check: (output: RepairIngredientOutput) => string[]) => {
  const schema = repairIngredientSchema(input.missing);

  return runBakeOff({
    title,
    candidates: CANDIDATES,
    system: REPAIR_INGREDIENT_PROMPT,
    prompt: repairIngredientUserPrompt(input),
    answer: {
      schema,
      parse: (raw) => toRepairOutput(input.missing, parseModelOutput(schema, raw) as Parameters<typeof toRepairOutput>[1]),
      check,
    },
    criteria: ["Is each figure a true typical value for this raw food, and is each refusal a weight nobody measures?"],
    runs: 3,
  });
};

const _food = (fr: string, en: string, category: RepairIngredientInput["category"], missing: RepairableField[]) => ({
  names: { fr, en },
  category,
  defaultUnit: "g" as const,
  nutrition: { calories: 115, protein: 20, fat: 3.5, carbohydrates: 1 },
  missing,
});

describe("repairIngredient · live", () => {
  it("fills a slice of ham", { timeout: 300_000 }, async () => {
    const result = await bench("repairIngredient · jambon slice", _food("Jambon blanc", "Ham", "MEAT", ["gramsPerSlice"]), ({ fields, refused }) => [
      ...(refused.length ? [`refused ${refused.join(", ")} — ham is sold sliced`] : []),
      ...(fields.gramsPerSlice === undefined || fields.gramsPerSlice < 15 || fields.gramsPerSlice > 80
        ? [`gramsPerSlice ${fields.gramsPerSlice} — a slice of ham is 25–50 g`]
        : []),
    ]);

    expect(result.ok).toBeGreaterThan(0);
  });

  it("refuses the density of chicken", { timeout: 300_000 }, async () => {
    const result = await bench("repairIngredient · poulet density", _food("Blanc de poulet", "Chicken breast", "MEAT", ["gramsPerMl"]), ({ fields, refused }) => [
      ...(refused.includes("gramsPerMl") ? [] : [`gramsPerMl ${fields.gramsPerMl} — nobody measures chicken in ml`]),
    ]);

    expect(result.ok).toBeGreaterThan(0);
  });
});
