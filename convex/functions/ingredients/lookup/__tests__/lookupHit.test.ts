import { describe, expect, test } from "vitest";

import type { IngredientNutrition } from "@shared/nutrition";

import {
  measuredCount,
  measuredNutrition,
  measuredOver,
  spellingsOfHit,
  type LookupHit,
} from "../lookupHit";

/**
 * The seam between what a source measured and what the agent produced.
 *
 * Both halves of this file guard the same thing from opposite sides: a number a laboratory
 * published must survive contact with a number a model invented, and a field nobody measured must
 * never acquire a value nobody meant. Getting either wrong is silent — the row stores eight
 * plausible figures, a Nutri-Score is computed from them, and no screen looks broken.
 */
const MODELLED: IngredientNutrition = {
  calories: 100,
  protein: 1,
  fat: 1,
  saturatedFat: 1,
  carbohydrates: 1,
  sugars: 1,
  fiber: 1,
  sodium: 1,
};

const hit = (source: LookupHit["source"], nutrition: LookupHit["nutrition"]): LookupHit => ({
  source,
  names: { en: ["Carrot"] },
  nutrition,
});

describe("functions/ingredients/lookup/measuredNutrition", () => {
  test("keeps the fields a source published", () => {
    expect(measuredNutrition({ calories: 41, protein: 0.9 })).toEqual({
      calories: 41,
      protein: 0.9,
    });
  });

  /**
   * The rule that did NOT change when partial answers started being kept. An absent field is not
   * a zero — a source silent on fiber has said nothing about fiber — and the Nutri-Score reads all
   * eight together, so a fabricated zero moves the grade a shopper reads.
   */
  test("an absent field stays absent rather than becoming a zero", () => {
    const measured = measuredNutrition({ calories: 41 });

    expect(measured).not.toHaveProperty("fiber");
    expect(measured?.fiber).toBeUndefined();
  });

  test.each([
    ["nothing at all", {}],
    ["a NaN", { calories: Number.NaN }],
    ["an infinity", { protein: Number.POSITIVE_INFINITY }],
  ])("returns nothing when a source published %s", (_case, facts) => {
    expect(measuredNutrition(facts)).toBeUndefined();
  });

  test("counts only the fields that carry a number", () => {
    expect(measuredCount(measuredNutrition({ calories: 41, protein: 0.9 }))).toBe(2);
    expect(measuredCount(undefined)).toBe(0);
  });
});

describe("functions/ingredients/lookup/measuredOver", () => {
  test("a modelled number survives only where nothing measured that field", () => {
    const merged = measuredOver(MODELLED, [hit("foodComposition", { calories: 41, fiber: 2.8 })]);

    expect(merged.calories).toBe(41);
    expect(merged.fiber).toBe(2.8);
    expect(merged.sugars).toBe(MODELLED.sugars);
  });

  /**
   * The ordering that matters, and the one a plain "first hit wins" gets backwards: the resolver
   * runs Open Food Facts and USDA in parallel, so `hits` arrives in completion order rather than
   * in order of authority. A manufacturer's declaration must not beat a laboratory measurement
   * because it happened to answer first.
   */
  test("a laboratory measurement beats a label, whatever order they arrived in", () => {
    const label = hit("openFoodFacts", { calories: 72 });
    const laboratory = hit("foodComposition", { calories: 41 });

    expect(measuredOver(MODELLED, [label, laboratory]).calories).toBe(41);
    expect(measuredOver(MODELLED, [laboratory, label]).calories).toBe(41);
  });

  test("a weaker source still fills a field the stronger one left empty", () => {
    const merged = measuredOver(MODELLED, [
      hit("openFoodFacts", { calories: 72, sodium: 680 }),
      hit("foodComposition", { calories: 41 }),
    ]);

    expect(merged.calories).toBe(41);
    expect(merged.sodium).toBe(680);
  });

  test("no hits, or hits that measured nothing, leaves the model's answer alone", () => {
    expect(measuredOver(MODELLED, [])).toEqual(MODELLED);
    expect(measuredOver(MODELLED, [hit("openFoodFacts", undefined)])).toEqual(MODELLED);
  });
});

describe("functions/ingredients/lookup/spellingsOfHit", () => {
  /**
   * Language-tagged spellings lead because the caller tries them in order against the catalog and
   * stops at the first match. An untagged name is a real extra chance the row already exists — the
   * catalog re-search is locale-blind — but it is the weakest guess in the list.
   */
  test("tagged names come before the ones no source put a language on", () => {
    expect(
      spellingsOfHit({
        source: "openFoodFacts",
        names: { en: ["Harissa paste"], fr: ["Harissa"] },
        untagged: ["Harissa du Cap-Bon"],
      }),
    ).toEqual(["Harissa paste", "Harissa", "Harissa du Cap-Bon"]);
  });

  test("a hit with no untagged names is just its tagged ones", () => {
    expect(spellingsOfHit(hit("foodComposition", undefined))).toEqual(["Carrot"]);
  });
});
