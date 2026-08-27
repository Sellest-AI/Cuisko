import { describe, expect, test } from "vitest";

import { EQUIPMENTS } from "@shared/equipments";
import { TAGS } from "@shared/tags";

import { EQUIPMENT_EMOJI, TAG_EMOJI } from "../vocabulary";

/**
 * The `Record<Tag, string>` annotation already makes a missing glyph a compile error. What it
 * cannot catch is the two ways a map can be complete and still wrong: an empty string, and a key
 * that outlived its removal from the vocabulary.
 */
describe("recipe vocabulary glyphs", () => {
  test.each([
    ["tags", TAGS, TAG_EMOJI],
    ["equipments", EQUIPMENTS, EQUIPMENT_EMOJI],
  ] as const)("%s map the vocabulary exactly, with nothing blank", (_name, vocabulary, emoji) => {
    expect(Object.keys(emoji).sort()).toEqual([...vocabulary].sort());
    expect(Object.values(emoji).filter((glyph) => glyph.trim() === "")).toEqual([]);
  });
});
