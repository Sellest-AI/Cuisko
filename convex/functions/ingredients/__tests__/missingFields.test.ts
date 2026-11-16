import { describe, expect, test } from "vitest";

import type { Doc, Id } from "@convex/_generated/dataModel";
import { missingFields, stillMissing } from "../missingFields";

/** Ham with every score nutrient and no weight but grams: what a slice line cannot weigh. */
const ham = (over: Partial<Doc<"ingredients">> = {}): Doc<"ingredients"> => ({
  _id: "ham" as Id<"ingredients">,
  _creationTime: 0,
  name: { values: { en: "Ham", fr: "Jambon" }, meta: {} },
  emoji: "🍖",
  search: { en: "Ham", fr: "Jambon" },
  category: "MEAT",
  defaultUnit: "g",
  defaultQuantity: 200,
  nutrition: {
    calories: 115,
    protein: 20,
    fat: 3.5,
    saturatedFat: 1.2,
    carbohydrates: 1,
    sugars: 0.8,
    fiber: 0,
    sodium: 0.8,
    iron: 0.6,
  },
  updatedAt: 0,
  ...over,
});

describe("missingFields", () => {
  test("a slice line on a row with no gramsPerSlice asks for gramsPerSlice", () => {
    expect(missingFields(ham(), ["slice"])).toEqual(["gramsPerSlice"]);
  });

  test("cl and l with no gramsPerMl ask for gramsPerMl once", () => {
    expect(missingFields(ham(), ["cl", "l"])).toEqual(["gramsPerMl"]);
  });

  test("each unit asks for the ratio toGrams needs to weigh it", () => {
    expect(missingFields(ham(), ["pcs"])).toEqual(["gramsPerPiece"]);
    expect(missingFields(ham(), ["tbsp"])).toEqual(["gramsPerMl"]);
    expect(missingFields(ham(), ["g", "kg", "oz"])).toEqual([]);
  });

  test("a ratio the row already has is not asked for", () => {
    expect(missingFields(ham({ gramsPerSlice: 30 }), ["slice"])).toEqual([]);
  });

  test("a score nutrient missing is asked for, whatever the units", () => {
    const { sugars: _sugars, ...nutrition } = ham().nutrition;

    expect(missingFields(ham({ nutrition }), ["g"])).toEqual(["sugars"]);
  });

  test("only iron missing asks for nothing: iron gates no grade", () => {
    const { iron: _iron, ...nutrition } = ham().nutrition;

    expect(missingFields(ham({ nutrition }), ["g"])).toEqual([]);
  });

  test("iron is added beside another missing field", () => {
    const { iron: _iron, ...nutrition } = ham().nutrition;

    expect(missingFields(ham({ nutrition }), ["slice"])).toEqual(["gramsPerSlice", "iron"]);
  });
});

describe("stillMissing", () => {
  test("drops a field set since the job was scheduled", () => {
    const { sodium: _sodium, ...nutrition } = ham().nutrition;
    const row = ham({ gramsPerSlice: 30, nutrition });

    expect(stillMissing(row, ["gramsPerSlice", "sodium"])).toEqual(["sodium"]);
  });
});
