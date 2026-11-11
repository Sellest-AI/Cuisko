import { describe, expect, test } from "vitest";

import { parseModelOutput } from "../../utils";
import { repairIngredientSchema, repairIngredientUserPrompt, toRepairOutput } from "../repairIngredient";

/**
 * The generation is not tested here — the manual test beside this one asks a real model. What is
 * tested is the boundary around it: the schema the model is held to, and what its answer becomes.
 */
const read = (missing: Parameters<typeof repairIngredientSchema>[0], raw: unknown) =>
  toRepairOutput(missing, parseModelOutput(repairIngredientSchema(missing), raw) as Parameters<typeof toRepairOutput>[1]);

describe("repairIngredientSchema", () => {
  test("holds only the fields asked", () => {
    expect(Object.keys(repairIngredientSchema(["gramsPerSlice"]).shape)).toEqual(["gramsPerSlice", "refused"]);
    expect(Object.keys(repairIngredientSchema(["sodium", "iron"]).shape)).toEqual(["sodium", "iron"]);
  });
});

describe("the answer, read", () => {
  test("a negative field is dropped, the others kept", () => {
    expect(read(["sodium", "sugars"], { sodium: -3, sugars: 1.2 })).toEqual({ fields: { sugars: 1.2 }, refused: [] });
  });

  test("a quoted number is read as a number", () => {
    expect(read(["gramsPerSlice"], { gramsPerSlice: "40", refused: [] }).fields).toEqual({ gramsPerSlice: 40 });
  });

  test("null is dropped", () => {
    expect(read(["sodium", "fiber"], { sodium: null, fiber: 0 }).fields).toEqual({ fiber: 0 });
  });

  test("a refused weight is returned and never written", () => {
    expect(read(["gramsPerMl", "sodium"], { gramsPerMl: null, sodium: 60, refused: ["gramsPerMl"] })).toEqual({
      fields: { sodium: 60 },
      refused: ["gramsPerMl"],
    });
  });

  test("a weight both answered and refused is refused", () => {
    expect(read(["gramsPerMl"], { gramsPerMl: 1, refused: ["gramsPerMl"] })).toEqual({
      fields: {},
      refused: ["gramsPerMl"],
    });
  });
});

describe("repairIngredientUserPrompt", () => {
  const HAM = {
    names: { fr: "Jambon", en: "Ham" },
    category: "MEAT",
    defaultUnit: "g",
    nutrition: { calories: 115 },
    missing: ["gramsPerSlice"],
  } as const satisfies Parameters<typeof repairIngredientUserPrompt>[0];

  test("names the fields to fill", () => {
    const prompt = repairIngredientUserPrompt({
      names: { fr: "Jambon", en: "Ham" },
      category: "MEAT",
      defaultUnit: "g",
      nutrition: { calories: 115 },
      missing: ["gramsPerSlice"],
    });

    expect(prompt).toContain("Fill these fields, and only these: gramsPerSlice.");
    expect(prompt).not.toContain("Measured");
  });

  test("lists how recipes write the food, with each recipe", () => {
    const prompt = repairIngredientUserPrompt({
      ...HAM,
      missing: [...HAM.missing],
      uses: [
        { quantity: 2, unit: "slice", recipeTitle: "Croque-monsieur" },
        { quantity: 150, unit: "g", recipeTitle: "Quiche" },
      ],
    });

    expect(prompt).toContain('How recipes write it: 2 slice in "Croque-monsieur"; 150 g in "Quiche".');
  });

  test("says nothing of a recipe when it has none", () => {
    expect(repairIngredientUserPrompt({ ...HAM, missing: [...HAM.missing] })).not.toContain("recipe");
  });
});
