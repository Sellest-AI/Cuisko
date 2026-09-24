import { describe, expect, test } from "vitest";

import {
  type InstructionGroup,
  parseInstructions,
  serializeInstructions,
  toInstructionGroups,
  totalMinutesOf,
  wholeTimingsOf,
} from "../recipes";

/** A step and its hints, spelled the way the text puts them: the instruction, then what goes under it. */
const step = (instruction: string, ...hints: string[]) => ({ instruction, hints });

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
        { title: "Sauce", steps: [step("Mix the yogurt with the mustard")] },
        { title: "Pasta", steps: [step("Preheat the pot"), step("Put the pasta into the pot")] },
      ]),
    ).toBe(
      ["## Sauce", "- Mix the yogurt with the mustard", "", "## Pasta", "- Preheat the pot", "- Put the pasta into the pot"].join(
        "\n",
      ),
    );
  });

  test("writes an ungrouped run as bare steps, with no heading line", () => {
    expect(serializeInstructions([{ steps: [step("Boil the water"), step("Salt it")] }])).toBe(
      "- Boil the water\n- Salt it",
    );
  });

  test("drops a group whose steps are missing or blank", () => {
    // A heading with nothing under it has no representation in the text, so keeping it here would
    // break the round trip on the very first pass.
    expect(serializeInstructions([{ title: "Sauce", steps: [] }, { steps: [step("  ")] }])).toBe("");
  });

  test("strips a step marker from a heading that would otherwise parse back as a step", () => {
    const text = serializeInstructions([{ title: "- Sauce", steps: [step("Whisk")] }]);

    expect(text).toBe("## Sauce\n- Whisk");
    expect(parseInstructions(text)).toEqual([{ title: "Sauce", steps: [step("Whisk")] }]);
  });

  /** `parseInstructions` reads them back as one group, so the blank line would change the text on every pass. */
  test("writes two untitled groups side by side as one run", () => {
    expect(serializeInstructions([{ steps: [step("Preheat")] }, { steps: [step("Serve")] }])).toBe("- Preheat\n- Serve");
  });

  /** Only a heading opens a group, so an untitled one after a section is written as more of that section. */
  test("writes an untitled group after a titled one as more steps of that section", () => {
    expect(serializeInstructions([{ title: "Sauce", steps: [step("Whisk")] }, { steps: [step("Serve")] }])).toBe(
      "## Sauce\n- Whisk\n- Serve",
    );
  });

  test("collapses a newline inside a step, which would otherwise split it in two", () => {
    expect(serializeInstructions([{ steps: [step("Fold the batter\ngently, twice")] }])).toBe(
      "- Fold the batter gently, twice",
    );
  });
});

describe("parseInstructions", () => {
  test("reads back what serialize wrote", () => {
    expect(parseInstructions("Sauce\n- Mix\n\nPasta\n- Boil\n- Drain")).toEqual([
      { title: "Sauce", steps: [step("Mix")] },
      { title: "Pasta", steps: [step("Boil"), step("Drain")] },
    ]);
  });

  test("gives steps before any heading a group with no title", () => {
    expect(parseInstructions("- Preheat the oven\n\nSauce\n- Whisk")).toEqual([
      { steps: [step("Preheat the oven")] },
      { title: "Sauce", steps: [step("Whisk")] },
    ]);
  });

  /** A blank line opens nothing: only a heading does, so the stray ones here change no group. */
  test("accepts CRLF and stray blank lines", () => {
    expect(parseInstructions("Sauce\r\n- Mix\r\n\r\n\r\n- Rest\r\n")).toEqual([
      { title: "Sauce", steps: [step("Mix"), step("Rest")] },
    ]);
  });

  test("never opens a group on blank lines between untitled steps", () => {
    expect(parseInstructions("- first instruction\n- second instruction\n\n\n- third instruction")).toEqual([
      { steps: [step("first instruction"), step("second instruction"), step("third instruction")] },
    ]);
  });

  /**
   * The tartiflette, as stored: a stray blank line inside "Cooking". Split there, steps 4 and 5
   * became an untitled section — drawn with no heading and no rule above step 4.
   */
  test("keeps the steps after a blank line in the titled section above them", () => {
    const stored = [
      "## Cooking",
      "- Preheat the oven to 200°C.",
      "- Heat 2 tbsp oil in a skillet.",
      "",
      "- Add 1 kg potatoes and brown them.",
      "> potatoes taste good.",
      "- Add 200 g bacon.",
      "> potatoes look good.",
      "",
      "## Assembly",
      "- Rub a gratin dish with garlic.",
    ].join("\n");

    expect(parseInstructions(stored)).toEqual([
      {
        title: "Cooking",
        steps: [
          step("Preheat the oven to 200°C."),
          step("Heat 2 tbsp oil in a skillet."),
          step("Add 1 kg potatoes and brown them.", "potatoes taste good."),
          step("Add 200 g bacon.", "potatoes look good."),
        ],
      },
      { title: "Assembly", steps: [step("Rub a gratin dish with garlic.")] },
    ]);
  });

  test("leaves a step's own numbering and punctuation alone", () => {
    // Guessing at "1." as a marker is how a step reading "1. Preheat" loses its numbering; a colon
    // is ordinary step text and must not be read as structure.
    expect(parseInstructions("- 1. Preheat to 180C\n- Note: rest for 10 minutes")).toEqual([
      { steps: [step("1. Preheat to 180C"), step("Note: rest for 10 minutes")] },
    ]);
  });

  test("keeps a heading whose steps never arrived, as a step", () => {
    // A real heading is never childless, so a title with nothing under it is a short instruction
    // the length test misread. Keeping it costs the styling; dropping it cost the sentence.
    expect(parseInstructions("Sauce\n\nPasta\n- Boil")).toEqual([
      { steps: [step("Sauce")] },
      { title: "Pasta", steps: [step("Boil")] },
    ]);
  });

  test("reads a phrase-length heading as a heading, not as a step", () => {
    // 30 characters exactly — under LONG_STEP_THRESHOLD, and the case the threshold was raised for.
    // Below it, this became a step and dragged the step under it into the group above.
    expect(parseInstructions("Champignons et oignons grelots\n- Émincer les champignons")).toEqual([
      { title: "Champignons et oignons grelots", steps: [step("Émincer les champignons")] },
    ]);
  });

  test("never loses an instruction short enough to be mistaken for a heading", () => {
    // The other side of the same trade: a lone step under the threshold has no steps to follow it,
    // so it is the shape the old filter deleted outright.
    expect(parseInstructions("Faire revenir les oignons")).toEqual([
      { steps: [step("Faire revenir les oignons")] },
    ]);
  });

  test("opens a new group on a heading that follows steps directly, with no blank line", () => {
    expect(parseInstructions("- Preheat\nSauce\n- Whisk")).toEqual([
      { steps: [step("Preheat")] },
      { title: "Sauce", steps: [step("Whisk")] },
    ]);
  });

  /** The cook's own example: a heading set apart by blank lines on both sides is still a heading. */
  test("reads a short line between blank lines as a heading over the steps below it", () => {
    const text = [
      "- Cut the carrots",
      "- Heat up the oven",
      "",
      "The meal",
      "",
      "- Add some dough to the table",
    ].join("\n");

    expect(parseInstructions(text)).toEqual([
      { steps: [step("Cut the carrots"), step("Heat up the oven")] },
      { title: "The meal", steps: [step("Add some dough to the table")] },
    ]);
  });

  /** A short first line is a heading even with a blank line under it: the blank line opens and closes nothing. */
  test("reads a short first line as a heading over the steps below it", () => {
    expect(parseInstructions("Préchauffez le four.\n\nAjoutez la farine et fouettez sans cesser pendant deux minutes.")).toEqual([
      { title: "Préchauffez le four.", steps: [step("Ajoutez la farine et fouettez sans cesser pendant deux minutes.")] },
    ]);
  });
});

describe("hints", () => {
  test("writes each hint on its own line under its step", () => {
    expect(
      serializeInstructions([{ steps: [step("Stir the sauce", "Use a spoon", "Keep the heat low"), step("Season")] }]),
    ).toBe("- Stir the sauce\n> Use a spoon\n> Keep the heat low\n- Season");
  });

  test("drops a blank hint rather than writing an empty marker", () => {
    expect(serializeInstructions([{ steps: [step("Stir", "  ")] }])).toBe("- Stir");
  });

  test("attaches every hint to the step above it, in order", () => {
    expect(parseInstructions("- Stir the sauce\n> Use a spoon\n> Keep the heat low\n- Season")).toEqual([
      { steps: [step("Stir the sauce", "Use a spoon", "Keep the heat low"), step("Season")] },
    ]);
  });

  test("reads a hint written with no space after the marker", () => {
    expect(parseInstructions("- Stir\n>Use a spoon")).toEqual([{ steps: [step("Stir", "Use a spoon")] }]);
  });

  /**
   * The hint belongs to the step above it, so the blank line before it is not the end of that
   * step's group — splitting there would cut the method in two and drop the rule between the steps.
   */
  test("keeps a hint on its step, and the steps after it in the same group, across a blank line", () => {
    expect(parseInstructions("- Stir\n\n> Use a spoon\n- Season")).toEqual([
      { steps: [step("Stir", "Use a spoon"), step("Season")] },
    ]);
  });

  /**
   * The chili, as the cook typed it: a stray line return after the hint. Two untitled groups would
   * draw as two lists with no rule between steps 3 and 4, and no heading to say why.
   */
  test("keeps the next step in the same untitled group across a blank line after a hint", () => {
    expect(parseInstructions("- Brown the onions\n> this looks good\n\n- Add the beef")).toEqual([
      { steps: [step("Brown the onions", "this looks good"), step("Add the beef")] },
    ]);
  });

  test("keeps the next step in the titled section across a blank line after a hint", () => {
    expect(parseInstructions("## Sauce\n- Whisk\n> Use a fork\n\n- Serve")).toEqual([
      { title: "Sauce", steps: [step("Whisk", "Use a fork"), step("Serve")] },
    ]);
  });

  /**
   * What the parser wrote for a cook's hint before it knew `>`: a short line, so a heading, so
   * `## > …`. Read back as the hint it was, the recipe repairs itself on its next load.
   */
  test("reads a heading that starts with the hint marker as a hint on the step above", () => {
    const stored = [
      "- Hachez 2 oignons.",
      "- Dans une cocotte, faites dorer les oignons.",
      "",
      "## > utilisez une cocotte",
      "- Ajoutez 500 g de bœuf haché.",
      "- Servez chaud.",
    ].join("\n");

    expect(parseInstructions(stored)).toEqual([
      {
        steps: [
          step("Hachez 2 oignons."),
          step("Dans une cocotte, faites dorer les oignons.", "utilisez une cocotte"),
          step("Ajoutez 500 g de bœuf haché."),
          step("Servez chaud."),
        ],
      },
    ]);
  });

  test("never writes a heading the parser would read back as a hint", () => {
    expect(serializeInstructions([{ title: "> Sauce", steps: [step("Whisk")] }])).toBe("## Sauce\n- Whisk");
  });

  test("attaches a hint under a long unprefixed step", () => {
    expect(parseInstructions("Faire revenir les oignons dans le beurre.\n> À feu doux")).toEqual([
      { steps: [step("Faire revenir les oignons dans le beurre.", "À feu doux")] },
    ]);
  });

  /** A hint belongs below a step, never above one: with nothing above it, it has nothing to annotate. */
  test("drops a hint on the first line", () => {
    expect(parseInstructions("> Use a spoon\n- Stir")).toEqual([{ steps: [step("Stir")] }]);
  });

  test("drops a hint right under a marked heading", () => {
    expect(parseInstructions("- Preheat\n## Sauce\n> Use a spoon\n- Whisk")).toEqual([
      { steps: [step("Preheat")] },
      { title: "Sauce", steps: [step("Whisk")] },
    ]);
  });

  /**
   * A short unmarked line is a heading only by guess, and a heading never carries a hint — so one
   * under it proves the guess wrong. Dropping the hint there would lose text the cook typed below a
   * short instruction, which is the one thing the length guess is never allowed to cost.
   */
  test("reads a guessed heading followed by a hint as the step it was", () => {
    expect(parseInstructions("- Preheat\nFaire revenir\n> Avec du beurre\n- Saler")).toEqual([
      { steps: [step("Preheat"), step("Faire revenir", "Avec du beurre"), step("Saler")] },
    ]);
  });

  test("drops an empty hint line", () => {
    expect(parseInstructions("- Stir\n>\n>   ")).toEqual([{ steps: [step("Stir")] }]);
  });
});

describe("toInstructionGroups", () => {
  test("keeps real hints, in order, on their step", () => {
    expect(
      toInstructionGroups([
        { title: "Sauce", steps: [{ instruction: "Whisk", hints: ["Use a fork", "Go slowly"] }, { instruction: "Rest", hints: [] }] },
      ]),
    ).toEqual([{ title: "Sauce", steps: [step("Whisk", "Use a fork", "Go slowly"), step("Rest")] }]);
  });

  /** Every way a model says "no hints" after `parseModelOutput` has cleaned it: the list or its items gone. */
  test("reads a missing, null or holed hint list as the hints that are actually there", () => {
    expect(
      toInstructionGroups([
        {
          steps: [
            { instruction: "Boil" },
            { instruction: "Drain", hints: null },
            { instruction: "Serve", hints: [undefined, "Warm the plates", null] },
          ],
        },
      ]),
    ).toEqual([{ steps: [step("Boil"), step("Drain"), step("Serve", "Warm the plates")] }]);
  });

  /** `InstructionGroup` spells "no heading" as an absent key; `null` would serialize the same and compare different. */
  test("leaves a null title out rather than carrying it", () => {
    const [group] = toInstructionGroups([{ title: null, steps: [{ instruction: "Boil", hints: [] }] }]);

    expect(group).not.toHaveProperty("title");
  });
});

describe("the round trip", () => {
  test.for([
    { name: "grouped", groups: [{ title: "Sauce", steps: [step("Mix")] }, { title: "Pasta", steps: [step("Boil")] }] },
    { name: "ungrouped", groups: [{ steps: [step("Boil"), step("Drain")] }] },
    { name: "a leading untitled run", groups: [{ steps: [step("Preheat")] }, { title: "Sauce", steps: [step("Whisk")] }] },
    { name: "a trailing untitled run", groups: [{ title: "Sauce", steps: [step("Whisk")] }, { steps: [step("Serve")] }] },
    { name: "two untitled runs", groups: [{ steps: [step("Preheat")] }, { steps: [step("Serve")] }] },
    { name: "a step containing a colon", groups: [{ steps: [step("Note: rest 10 minutes")] }] },
    { name: "a step containing a dash", groups: [{ steps: [step("Bake 20-25 minutes - until golden")] }] },
    // Doubles the marker on the way out ("- - Preheat") and takes one back off on the way in. No
    // escaping needed, but it is the case most likely to be broken by a change to STEP_PREFIX.
    { name: "a step that itself starts with the step marker", groups: [{ steps: [step("- Preheat")] }] },
    { name: "an accented heading", groups: [{ title: "Pâtes", steps: [step("Cuire 8 minutes")] }] },
    { name: "a single step", groups: [{ steps: [step("Serve")] }] },
    // The case the heading marker exists for: unmarked, this heading is past
    // LONG_STEP_THRESHOLD and comes back as a step, losing the title on the first translation.
    {
      name: "a heading long enough to look like a step",
      groups: [{ title: "Pour la garniture et le montage", steps: [step("Monter")] }],
    },
    {
      name: "a heading that itself starts with the heading marker",
      groups: [{ title: "## Sauce", steps: [step("Whisk")] }],
    },
    { name: "steps with hints", groups: [{ title: "Sauce", steps: [step("Whisk", "Use a fork", "Go slowly"), step("Rest")] }] },
    { name: "a hint that itself starts with the hint marker", groups: [{ steps: [step("Whisk", "> 2 minutes")] }] },
    { name: "a step that itself starts with the hint marker", groups: [{ steps: [step("> Whisk", "Gently")] }] },
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
        { steps: [step("Faire revenir les oignons dans le beurre pendant dix minutes.")] },
      ]);
    });

    test("still reads a short unprefixed line as the heading it looks like", () => {
      const groups = parseInstructions("Sauce\nMélanger le tout jusqu'à obtenir une crème lisse.");

      expect(groups).toEqual([
        { title: "Sauce", steps: [step("Mélanger le tout jusqu'à obtenir une crème lisse.")] },
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

      expect(groups).toEqual([
        { title: "Sauce", steps: [step(expect.any(String)), step(expect.any(String))] },
      ]);
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

describe("wholeTimingsOf", () => {
  test("rounds a fraction the agent answered with to the nearest minute", () => {
    expect(wholeTimingsOf({ preparation: 7.5, cooking: 12.4, resting: 30 })).toEqual({
      preparation: 8,
      cooking: 12,
      resting: 30,
    });
  });

  /** A stated timing that rounded to 0 would read as "not stated" — and 0 is what the schema refuses. */
  test("never rounds a stated timing down to zero", () => {
    expect(wholeTimingsOf({ cooking: 0.3 })).toEqual({ cooking: 1 });
  });

  test("writes no key for a timing that is absent", () => {
    expect(Object.keys(wholeTimingsOf({ cooking: 20 }))).toEqual(["cooking"]);
  });
});
