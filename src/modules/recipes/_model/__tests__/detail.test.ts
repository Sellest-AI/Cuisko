import { describe, expect, test } from "vitest";

import { flattenSteps, groupByCategory, scaleTo, type RecipeLine } from "../detail";

const line = (name: string, category: RecipeLine["category"], quantity: number): RecipeLine => ({
  name,
  category,
  quantity,
  unit: "g",
  emoji: "🥕",
  conversion: { defaultUnit: "g", gramsPerPiece: 150 },
});

const LINES: RecipeLine[] = [
  line("Onion", "VEGETABLE", 200),
  line("Butter", "DAIRY", 50),
  line("Carrot", "VEGETABLE", 300),
  line("Salt", "SPICE", 5),
];

describe("scaleTo", () => {
  test("scales every quantity by the ratio of wanted to written", () => {
    expect(scaleTo(LINES, 4, 2).map((it) => it.quantity)).toEqual([100, 25, 150, 2.5]);
    expect(scaleTo(LINES, 4, 6).map((it) => it.quantity)).toEqual([300, 75, 450, 7.5]);
  });

  /** The stepper's resting position has to be identical to not having a stepper at all. */
  test("leaves the lines untouched at the servings they were written for", () => {
    expect(scaleTo(LINES, 4, 4)).toBe(LINES);
  });

  /** Nothing else about a line moves — only the number. */
  test("keeps the name, unit and category of each line", () => {
    expect(scaleTo(LINES, 4, 2)[0]).toEqual({ ...LINES[0], quantity: 100 });
  });

  /** A recipe that serves nobody has no ratio, and dividing by it would produce infinities. */
  test("refuses to scale from a servings count of zero or less", () => {
    expect(scaleTo(LINES, 0, 4)).toBe(LINES);
    expect(scaleTo(LINES, -2, 4)).toBe(LINES);
  });
});

describe("groupByCategory", () => {
  /**
   * `CATEGORIES`' own order, which runs produce → proteins → store cupboard. Alphabetical would
   * put condiments above vegetables in English and the reverse in French.
   */
  test("orders the aisles by the vocabulary, not by first appearance", () => {
    expect(groupByCategory(LINES).map((group) => group.category)).toEqual([
      "VEGETABLE",
      "DAIRY",
      "SPICE",
    ]);
  });

  /** The backend already sorted by `position`, and that order is the recipe's. */
  test("keeps the written order of the lines inside an aisle", () => {
    const [vegetables] = groupByCategory(LINES);

    expect(vegetables?.lines.map((it) => it.name)).toEqual(["Onion", "Carrot"]);
  });

  /**
   * A recipe takes one thing from most categories, so grouping honestly is a page of headings with
   * a single tile under each — more labels than ingredients.
   */
  test("folds aisles under the minimum into OTHER", () => {
    const groups = groupByCategory(LINES, 2);

    expect(groups.map((group) => group.category)).toEqual(["VEGETABLE", "OTHER"]);
    expect(groups[1]?.lines.map((it) => it.name)).toEqual(["Butter", "Salt"]);
  });

  /** Folded lines keep the recipe's written order, not the order of the aisles they came from. */
  test("keeps written order among the folded lines", () => {
    const mixed = [
      line("Salt", "SPICE", 5),
      line("Onion", "VEGETABLE", 200),
      line("Butter", "DAIRY", 50),
    ];

    expect(groupByCategory(mixed, 2)[0]?.lines.map((it) => it.name)).toEqual([
      "Salt",
      "Onion",
      "Butter",
    ]);
  });

  /** It is where the small groups land, so measuring it would mean folding it into itself. */
  test("never folds OTHER away, however small it is", () => {
    const groups = groupByCategory([line("Yeast", "OTHER", 1), line("Salt", "SPICE", 5)], 2);

    expect(groups).toEqual([
      { category: "OTHER", lines: [line("Yeast", "OTHER", 1), line("Salt", "SPICE", 5)] },
    ]);
  });

  /** A caller that has not thought about the threshold gets the plain grouping. */
  test("folds nothing by default", () => {
    expect(groupByCategory(LINES).map((group) => group.category)).toEqual([
      "VEGETABLE",
      "DAIRY",
      "SPICE",
    ]);
  });

  /** A heading with nothing under it is a recipe claiming an ingredient it does not have. */
  test("emits no group for a category the recipe does not use", () => {
    expect(groupByCategory([line("Salt", "SPICE", 5)])).toEqual([
      { category: "SPICE", lines: [line("Salt", "SPICE", 5)] },
    ]);
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("flattenSteps", () => {
  const GROUPS = [
    {
      title: "Sauce",
      steps: [
        { instruction: "Soften the onions.", hints: ["Keep the heat low."] },
        { instruction: "Add the tomatoes.", hints: [] },
      ],
    },
    { title: "Plate", steps: [{ instruction: "Spread the sauce.", hints: [] }] },
  ];

  /** "Step 3" has to mean one thing to someone reading the tab and someone standing at the hob. */
  test("numbers across groups rather than restarting in each", () => {
    expect(flattenSteps(GROUPS).map((step) => step.position)).toEqual([1, 2, 3]);
  });

  test("carries each step's heading with it", () => {
    expect(flattenSteps(GROUPS).map((step) => step.title)).toEqual(["Sauce", "Sauce", "Plate"]);
  });

  /** The cooking session draws a step's tips from here, so they must stay on the step they were written under. */
  test("carries each step's hints with it", () => {
    expect(flattenSteps(GROUPS).map((step) => step.hints)).toEqual([["Keep the heat low."], [], []]);
  });

  /** A recipe that is just five steps has one group with no title, and no heading to show. */
  test("leaves an ungrouped run without a title", () => {
    expect(flattenSteps([{ steps: [{ instruction: "Boil the water.", hints: [] }] }])).toEqual([
      { instruction: "Boil the water.", hints: [], position: 1 },
    ]);
  });

  test("flattens a method with no groups to nothing", () => {
    expect(flattenSteps([])).toEqual([]);
  });
});
