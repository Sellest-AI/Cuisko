import { describe, expect, test } from "vitest";

import { ALLERGENS } from "@shared/allergens";
import { DIETS } from "@shared/diets";
import { EQUIPMENTS } from "@shared/equipments";
import { TAGS } from "@shared/tags";

import { ALLERGEN_EMOJI, DIET_EMOJI, EQUIPMENT_EMOJI, EQUIPMENT_IMAGE, TAG_EMOJI } from "../vocabulary";

/**
 * The `Record<Tag, string>` annotation already makes a missing glyph a compile error. What it
 * cannot catch is the two ways a map can be complete and still wrong: an empty string, and a key
 * that outlived its removal from the vocabulary.
 */
describe("vocabulary glyphs", () => {
  test.each([
    ["tags", TAGS, TAG_EMOJI],
    ["equipments", EQUIPMENTS, EQUIPMENT_EMOJI],
    ["diets", DIETS, DIET_EMOJI],
    ["allergens", ALLERGENS, ALLERGEN_EMOJI],
  ] as const)("%s map the vocabulary exactly, with nothing blank", (_name, vocabulary, emoji) => {
    expect(Object.keys(emoji).sort()).toEqual([...vocabulary].sort());
    expect(Object.values(emoji).filter((glyph) => glyph.trim() === "")).toEqual([]);
  });
});

/**
 * The pictures get their own block rather than a row in the table above: their values are bundler
 * handles, not strings, so "nothing blank" is a different assertion — under Vitest an unresolved
 * asset is `undefined`, which is exactly what a tile would draw nothing for.
 */
describe("equipment pictures", () => {
  test("map the vocabulary exactly", () => {
    expect(Object.keys(EQUIPMENT_IMAGE).sort()).toEqual([...EQUIPMENTS].sort());
  });

  test("every appliance resolves to something the bundler produced", () => {
    expect(Object.entries(EQUIPMENT_IMAGE).filter(([, source]) => !source)).toEqual([]);
  });
});
