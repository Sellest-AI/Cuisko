import { describe, expect, test } from "vitest";

import { NUTRITION_PREFERENCES } from "@shared/preferences";
import { TASTES } from "@shared/tastes";

import { TAG_EMOJI } from "~/lib/vocabulary";

import { optionsOf } from "../options";

describe("optionsOf", () => {
  test("keeps the vocabulary's own order", () => {
    const options = optionsOf(TASTES, TAG_EMOJI, (taste) => taste);

    expect(options.map((option) => option.id)).toEqual([...TASTES]);
  });

  test("reads the word from the label function, never from the value", () => {
    const options = optionsOf(["budget"] as const, TAG_EMOJI, (tag) => `word:${tag}`);

    expect(options[0]?.label).toBe("word:budget");
  });

  /**
   * The failure the two hand-written lists actually shipped: a row drawn with no glyph, or with one
   * invented beside the vocabulary's. Both steps' vocabularies are checked, because `TAG_EMOJI` is
   * keyed by `Tag` and it is the subsetting that could silently miss an entry.
   */
  test.each([
    ["tastes", TASTES],
    ["seeks", NUTRITION_PREFERENCES],
  ] as const)("gives every %s row the vocabulary's glyph", (_name, values) => {
    for (const option of optionsOf(values, TAG_EMOJI, () => "")) {
      expect(option.emoji).toBe(TAG_EMOJI[option.id]);
      expect(option.emoji).not.toBe("");
    }
  });

  test("returns nothing for an empty vocabulary rather than throwing", () => {
    expect(optionsOf([], TAG_EMOJI, () => "")).toEqual([]);
  });
});
