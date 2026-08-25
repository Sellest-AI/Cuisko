import { describe, expect, test } from "vitest";

import { type InstructionGroup, parseInstructions, serializeInstructions } from "../recipes";

/**
 * The contract, stated once: text is the stored form, so serializing is what must be stable.
 *
 * Asserting `parse(serialize(x)) === x` directly would be wrong — `serialize` normalizes, so a
 * group titled `"Sauce "` legitimately comes back as `"Sauce"`. What must hold is that a second
 * pass changes nothing, because that is what a recipe edited twice actually does.
 */
const expectStableThroughText = (groups: InstructionGroup[]) => {
  const text = serializeInstructions(groups);
  const parsed = parseInstructions(text);

  expect(serializeInstructions(parsed)).toBe(text);
  expect(parseInstructions(serializeInstructions(parsed))).toEqual(parsed);
};

describe("serializeInstructions", () => {
  test("writes a heading above its steps, groups separated by a blank line", () => {
    expect(
      serializeInstructions([
        { title: "Sauce", steps: ["Mix the yogurt with the mustard"] },
        { title: "Pasta", steps: ["Preheat the pot", "Put the pasta into the pot"] },
      ]),
    ).toBe(
      ["Sauce", "- Mix the yogurt with the mustard", "", "Pasta", "- Preheat the pot", "- Put the pasta into the pot"].join(
        "\n",
      ),
    );
  });

  test("writes an ungrouped run as bare steps, with no heading line", () => {
    expect(serializeInstructions([{ steps: ["Boil the water", "Salt it"] }])).toBe(
      "- Boil the water\n- Salt it",
    );
  });

  test("drops a group whose steps are missing or blank", () => {
    // A heading with nothing under it has no representation in the text, so keeping it here would
    // break the round trip on the very first pass.
    expect(serializeInstructions([{ title: "Sauce", steps: [] }, { steps: ["  "] }])).toBe("");
  });

  test("strips a step marker from a heading that would otherwise parse back as a step", () => {
    const text = serializeInstructions([{ title: "- Sauce", steps: ["Whisk"] }]);

    expect(text).toBe("Sauce\n- Whisk");
    expect(parseInstructions(text)).toEqual([{ title: "Sauce", steps: ["Whisk"] }]);
  });

  test("collapses a newline inside a step, which would otherwise split it in two", () => {
    expect(serializeInstructions([{ steps: ["Fold the batter\ngently, twice"] }])).toBe(
      "- Fold the batter gently, twice",
    );
  });
});

describe("parseInstructions", () => {
  test("reads back what serialize wrote", () => {
    expect(parseInstructions("Sauce\n- Mix\n\nPasta\n- Boil\n- Drain")).toEqual([
      { title: "Sauce", steps: ["Mix"] },
      { title: "Pasta", steps: ["Boil", "Drain"] },
    ]);
  });

  test("gives steps before any heading a group with no title", () => {
    expect(parseInstructions("- Preheat the oven\n\nSauce\n- Whisk")).toEqual([
      { steps: ["Preheat the oven"] },
      { title: "Sauce", steps: ["Whisk"] },
    ]);
  });

  test("accepts CRLF and stray blank lines", () => {
    expect(parseInstructions("Sauce\r\n- Mix\r\n\r\n\r\n- Rest\r\n")).toEqual([
      { title: "Sauce", steps: ["Mix"] },
      { steps: ["Rest"] },
    ]);
  });

  test("leaves a step's own numbering and punctuation alone", () => {
    // Guessing at "1." as a marker is how a step reading "1. Preheat" loses its numbering; a colon
    // is ordinary step text and must not be read as structure.
    expect(parseInstructions("- 1. Preheat to 180C\n- Note: rest for 10 minutes")).toEqual([
      { steps: ["1. Preheat to 180C", "Note: rest for 10 minutes"] },
    ]);
  });

  test("drops a heading whose steps never arrived", () => {
    expect(parseInstructions("Sauce\n\nPasta\n- Boil")).toEqual([{ title: "Pasta", steps: ["Boil"] }]);
  });

  test("opens a new group on a heading that follows steps directly, with no blank line", () => {
    expect(parseInstructions("- Preheat\nSauce\n- Whisk")).toEqual([
      { steps: ["Preheat"] },
      { title: "Sauce", steps: ["Whisk"] },
    ]);
  });
});

describe("the round trip", () => {
  test.for([
    { name: "grouped", groups: [{ title: "Sauce", steps: ["Mix"] }, { title: "Pasta", steps: ["Boil"] }] },
    { name: "ungrouped", groups: [{ steps: ["Boil", "Drain"] }] },
    { name: "a leading untitled run", groups: [{ steps: ["Preheat"] }, { title: "Sauce", steps: ["Whisk"] }] },
    { name: "a trailing untitled run", groups: [{ title: "Sauce", steps: ["Whisk"] }, { steps: ["Serve"] }] },
    { name: "two untitled runs", groups: [{ steps: ["Preheat"] }, { steps: ["Serve"] }] },
    { name: "a step containing a colon", groups: [{ steps: ["Note: rest 10 minutes"] }] },
    { name: "a step containing a dash", groups: [{ steps: ["Bake 20-25 minutes - until golden"] }] },
    // Doubles the marker on the way out ("- - Preheat") and takes one back off on the way in. No
    // escaping needed, but it is the case most likely to be broken by a change to STEP_PREFIX.
    { name: "a step that itself starts with the step marker", groups: [{ steps: ["- Preheat"] }] },
    { name: "an accented heading", groups: [{ title: "Pâtes", steps: ["Cuire 8 minutes"] }] },
    { name: "a single step", groups: [{ steps: ["Serve"] }] },
  ] satisfies { name: string; groups: InstructionGroup[] }[])(
    "survives $name unchanged on a second pass",
    ({ groups }) => expectStableThroughText(groups),
  );

  test("an empty recipe round-trips as empty rather than as one blank group", () => {
    expect(parseInstructions(serializeInstructions([]))).toEqual([]);
    expect(serializeInstructions([])).toBe("");
  });
});
