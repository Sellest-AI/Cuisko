import { describe, expect, test } from "vitest";

import {
  ALLERGENS,
  isAllergen,
  parseAllergens,
  serializeAllergens,
  sortAllergens,
} from "../allergens";

describe("the vocabulary", () => {
  /** Fourteen, because it is the EU-1169/2011 list and not a list of our own. */
  test("is the fourteen regulated allergens, with no repeats", () => {
    expect(ALLERGENS).toHaveLength(14);
    expect(new Set(ALLERGENS).size).toBe(14);
  });

  test("recognises its own members and nothing else", () => {
    for (const allergen of ALLERGENS) expect(isAllergen(allergen)).toBe(true);
    expect(isAllergen("gluten-free")).toBe(false);
    expect(isAllergen("coconut")).toBe(false);
  });
});

describe("sortAllergens", () => {
  test("puts any set into the vocabulary's own order", () => {
    expect(sortAllergens(["milk", "gluten", "sesame"])).toEqual(["gluten", "milk", "sesame"]);
  });

  test("collapses repeats", () => {
    expect(sortAllergens(["milk", "milk"])).toEqual(["milk"]);
  });

  /**
   * The property the stored column depends on: two rows carrying the same allergens compare equal
   * whatever order they were assembled in. The catalog merges a category baseline with a per-slug
   * list, so the assembly order genuinely varies.
   */
  test("makes the same set serialize identically however it was built", () => {
    expect(serializeAllergens(["nuts", "gluten"])).toBe(serializeAllergens(["gluten", "nuts"]));
  });

  test("does not mutate what it was given", () => {
    const input = ["milk", "gluten"] as const;
    sortAllergens(input);
    expect(input).toEqual(["milk", "gluten"]);
  });
});

describe("parseAllergens", () => {
  test("reads a string this module wrote", () => {
    const allergens = ["gluten", "milk", "nuts"] as const;
    expect(parseAllergens(serializeAllergens(allergens))).toEqual([...allergens]);
  });

  test("answers nothing for nothing", () => {
    expect(parseAllergens("")).toEqual([]);
    expect(parseAllergens(null)).toEqual([]);
    expect(parseAllergens(undefined)).toEqual([]);
  });

  /** OpenFoodFacts answers in language-prefixed tags; the prefix is not part of the name. */
  test.each([
    ["en:milk,en:gluten", ["gluten", "milk"]],
    ["fr:milk; en:nuts", ["milk", "nuts"]],
  ])("strips a language prefix from %s", (input, expected) => {
    expect(parseAllergens(input)).toEqual(expected);
  });

  test("accepts whitespace, commas and semicolons alike", () => {
    expect(parseAllergens("milk, gluten;  nuts")).toEqual(["gluten", "milk", "nuts"]);
  });

  test("is case-insensitive", () => {
    expect(parseAllergens("MILK Gluten")).toEqual(["gluten", "milk"]);
  });

  test("returns the canonical order and no repeats, whatever the input order", () => {
    expect(parseAllergens("nuts milk milk gluten")).toEqual(["gluten", "milk", "nuts"]);
  });

  /**
   * ⚠️ The documented hazard, pinned so it cannot become a surprise: an unrecognised word is
   * DROPPED, so a misspelled input yields a shorter list — and a shorter list is what earns a
   * free-from tag. A caller handling untrusted text must decide separately whether the source was
   * understood at all, and store `undefined` rather than this `[]` when it was not.
   */
  test("silently drops what it does not recognise", () => {
    expect(parseAllergens("gluten glutten kiwi")).toEqual(["gluten"]);
    expect(parseAllergens("kiwi coconut")).toEqual([]);
  });
});
