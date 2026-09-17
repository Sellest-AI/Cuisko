import { describe, expect, test } from "vitest";

import { type InstructionGroup, parseInstructions, serializeInstructions, totalMinutesOf } from "../recipes";

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
      ["## Sauce", "- Mix the yogurt with the mustard", "", "## Pasta", "- Preheat the pot", "- Put the pasta into the pot"].join(
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

    expect(text).toBe("## Sauce\n- Whisk");
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

  test("keeps a heading whose steps never arrived, as a step", () => {
    // A real heading is never childless, so a title with nothing under it is a short instruction
    // the length test misread. Keeping it costs the styling; dropping it cost the sentence.
    expect(parseInstructions("Sauce\n\nPasta\n- Boil")).toEqual([
      { steps: ["Sauce"] },
      { title: "Pasta", steps: ["Boil"] },
    ]);
  });

  test("reads a phrase-length heading as a heading, not as a step", () => {
    // 30 characters exactly — under LONG_STEP_THRESHOLD, and the case the threshold was raised for.
    // Below it, this became a step and dragged the step under it into the group above.
    expect(parseInstructions("Champignons et oignons grelots\n- Émincer les champignons")).toEqual([
      { title: "Champignons et oignons grelots", steps: ["Émincer les champignons"] },
    ]);
  });

  test("never loses an instruction short enough to be mistaken for a heading", () => {
    // The other side of the same trade: a lone step under the threshold has no steps to follow it,
    // so it is the shape the old filter deleted outright.
    expect(parseInstructions("Faire revenir les oignons")).toEqual([
      { steps: ["Faire revenir les oignons"] },
    ]);
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
    // The case the heading marker exists for: unmarked, this heading is past
    // LONG_STEP_THRESHOLD and comes back as a step, losing the title on the first translation.
    {
      name: "a heading long enough to look like a step",
      groups: [{ title: "Pour la garniture et le montage", steps: ["Monter"] }],
    },
    {
      name: "a heading that itself starts with the heading marker",
      groups: [{ title: "## Sauce", steps: ["Whisk"] }],
    },
  ] satisfies { name: string; groups: InstructionGroup[] }[])(
    "survives $name unchanged on a second pass",
    ({ groups }) => expectStableThroughText(groups),
  );

  /**
   * What a cook actually pastes: prose, no dashes, no headings. The length heuristic is the only
   * thing standing between that and a recipe with no steps in it.
   */
  describe("free text as a cook writes it", () => {
    test("reads an unprefixed sentence as a step, not as a heading", () => {
      const groups = parseInstructions(
        "Faire revenir les oignons dans le beurre pendant dix minutes.",
      );

      expect(groups).toEqual([
        { steps: ["Faire revenir les oignons dans le beurre pendant dix minutes."] },
      ]);
    });

    test("still reads a short unprefixed line as the heading it looks like", () => {
      const groups = parseInstructions("Sauce\nMélanger le tout jusqu'à obtenir une crème lisse.");

      expect(groups).toEqual([
        { title: "Sauce", steps: ["Mélanger le tout jusqu'à obtenir une crème lisse."] },
      ]);
    });

    test("groups a pasted block of sentences under the heading above it", () => {
      const groups = parseInstructions(
        [
          "Sauce",
          "Faire fondre le beurre dans une casserole à feu doux.",
          "Ajouter la farine et fouetter sans cesser pendant deux minutes.",
        ].join("\n"),
      );

      expect(groups).toEqual([{ title: "Sauce", steps: [expect.any(String), expect.any(String)] }]);
      expect(groups[0]!.steps).toHaveLength(2);
    });
  });

  test("an empty recipe round-trips as empty rather than as one blank group", () => {
    expect(parseInstructions(serializeInstructions([]))).toEqual([]);
    expect(serializeInstructions([])).toBe("");
  });
});

describe("totalMinutesOf", () => {
  test("adds up the three timings a recipe declares", () => {
    expect(totalMinutesOf({ preparation: 10, cooking: 20, resting: 5 })).toBe(35);
  });

  test("totals what it has when the recipe declares only some of them", () => {
    expect(totalMinutesOf({ preparation: 10 })).toBe(10);
    expect(totalMinutesOf({ cooking: 20, resting: 5 })).toBe(25);
  });

  /** Nobody timed it is not the same claim as it is instant — the card prints "—", not "0 min". */
  test("gives nothing at all when the recipe declares none of them", () => {
    expect(totalMinutesOf({})).toBeUndefined();
  });

  /** A declared zero is an answer, and `0` is falsy — the filter must not read it as undeclared. */
  test("keeps a declared zero as zero rather than as undeclared", () => {
    expect(totalMinutesOf({ cooking: 0 })).toBe(0);
  });
});
