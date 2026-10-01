import { describe, expect, it } from "vitest";
import * as z from "zod/v4";

import { modelNumber, modelText, parseModelOutput, parseToolInput } from "../parseModelOutput";

describe("modelText", () => {
  it("keeps a real answer, trimmed", () => {
    expect(modelText("  Sauce  ")).toBe("Sauce");
  });

  it("reads the words for nothing as nothing, whatever the case", () => {
    for (const nothing of ["null", "NULL", "None", "n/a", "empty", "undefined", "-", "   "])
      expect(modelText(nothing)).toBeUndefined();
  });

  it("reads a missing value, a null and a non-string as nothing", () => {
    expect(modelText(null)).toBeUndefined();
    expect(modelText(undefined)).toBeUndefined();
    expect(modelText(12)).toBeUndefined();
  });

  it("keeps a real answer that merely contains one of the words", () => {
    expect(modelText("Nothing-to-it dressing")).toBe("Nothing-to-it dressing");
  });
});

describe("modelNumber", () => {
  it("keeps a number", () => {
    expect(modelNumber(45)).toBe(45);
    expect(modelNumber(0)).toBe(0);
  });

  it("reads the number out of the prose a model writes instead", () => {
    expect(modelNumber("45")).toBe(45);
    expect(modelNumber("45 minutes")).toBe(45);
    expect(modelNumber("1,5")).toBe(1.5);
  });

  it("reads the words for nothing, and anything unparseable, as nothing", () => {
    for (const nothing of ["null", "none", "", "about an hour", null, undefined, NaN, Infinity])
      expect(modelNumber(nothing)).toBeUndefined();
  });
});

const _schema = z.object({
  name: z.string(),
  count: z.number(),
  size: z.enum(["s", "l"]),
  minutes: z.number().positive().nullable().optional(),
  label: z.string().nullable().optional(),
  groups: z.array(z.object({ title: z.string().nullable().optional(), steps: z.array(z.string()) })),
  nested: z.object({ deep: z.number().nullable().optional() }),
});

const _answer = (overrides: Record<string, unknown> = {}) => ({
  name: "one",
  count: 2,
  size: "s",
  minutes: 30,
  label: "a label",
  groups: [{ title: "Sauce", steps: ["Boil"] }],
  nested: { deep: 1 },
  ...overrides,
});

describe("parseModelOutput", () => {
  it("leaves a well-formed answer alone", () => {
    expect(parseModelOutput(_schema, _answer())).toEqual(_answer());
  });

  it("drops an absentable field the model wrote as null, as a word, or not at all", () => {
    for (const nothing of [null, "null", "N/A", "", undefined])
      expect(parseModelOutput(_schema, _answer({ minutes: nothing, label: nothing })))
        .not.toHaveProperty("minutes");

    expect(parseModelOutput(_schema, _answer({ label: "none" }))).not.toHaveProperty("label");
  });

  it("reads a number out of the string a model wrote it as", () => {
    expect(parseModelOutput(_schema, _answer({ minutes: "45 minutes" })).minutes).toBe(45);
    expect(parseModelOutput(_schema, _answer({ count: "2" })).count).toBe(2);
  });

  it("drops an absentable value that fails its own rule rather than throwing", () => {
    expect(parseModelOutput(_schema, _answer({ minutes: 0 }))).not.toHaveProperty("minutes");
    expect(parseModelOutput(_schema, _answer({ minutes: -5 }))).not.toHaveProperty("minutes");
  });

  it("cleans inside arrays and nested objects", () => {
    const groups = [{ title: "null", steps: ["Boil"] }, { title: "  Pasta  ", steps: ["Drain"] }];

    const parsed = parseModelOutput(_schema, _answer({ groups, nested: { deep: "none" } }));

    expect(parsed.groups[0]).toEqual({ steps: ["Boil"] });
    expect(parsed.groups[1]?.title).toBe("Pasta");
    expect(parsed.nested).toEqual({});
  });

  it("still throws on a wrong answer, as opposed to a badly worded one", () => {
    expect(() => parseModelOutput(_schema, _answer({ size: "xl" }))).toThrow();
    expect(() => parseModelOutput(_schema, _answer({ count: "many" }))).toThrow();
    expect(() => parseModelOutput(_schema, _answer({ name: undefined }))).toThrow();
  });
});

describe("an array a model wrote", () => {
  it("loses the empty items it holds: blank, null or missing", () => {
    const groups = [{ steps: ["Boil", "", null, "  ", undefined, "Drain"] }];

    expect(parseModelOutput(_schema, _answer({ groups })).groups[0]?.steps).toEqual(["Boil", "Drain"]);
  });

  it("loses the items that are a word for nothing, or a number that is not one", () => {
    const groups = [{ steps: ["Boil", "null", "N/A", "NaN", "Drain"] }];
    const schema = z.object({ counts: z.array(z.number()) });

    expect(parseModelOutput(_schema, _answer({ groups })).groups[0]?.steps).toEqual(["Boil", "Drain"]);
    expect(parseModelOutput(schema, { counts: [2, "NaN", Number.NaN, null, 3] })).toEqual({ counts: [2, 3] });
  });

  it("goes absent when it was absentable and held nothing but empty items", () => {
    const schema = z.object({ tags: z.array(z.string()).optional() });

    expect(parseModelOutput(schema, { tags: ["", null] })).toEqual({});
  });
});

/**
 * What a tool's `execute` receives. A model fills the fields it was told it may leave out: GPT-6 Luna
 * asked for two eggs sent `recipeIds: [""]` beside the real lines, and a recipe with
 * `lines: [{ ingredientId: "" }]` beside its real id. A stand-in is read as the field left out;
 * anything that is not one still reaches the tool, which refuses it by name (ADR 0010).
 */
describe("parseToolInput", () => {
  const _nutrition = z.object({
    recipeIds: z.array(z.string()).max(5).optional(),
    lines: z.array(z.object({ ingredientId: z.string(), quantity: z.number().positive(), unit: z.enum(["g", "pcs"]) })).optional(),
    servings: z.number().int().min(1).optional(),
  });
  const eggs = [{ ingredientId: "egg", quantity: 2, unit: "pcs" }];

  it("leaves a well-formed call alone", () => {
    expect(parseToolInput(_nutrition, { recipeIds: ["chili"], servings: 2 })).toEqual({ recipeIds: ["chili"], servings: 2 });
  });

  it("reads a list of empty ids as the field left out", () => {
    expect(parseToolInput(_nutrition, { recipeIds: [""], lines: eggs })).toEqual({ lines: eggs });
  });

  it("drops an item whose required text is empty, and the list with it when nothing is left", () => {
    const standIn = [{ ingredientId: "", quantity: 1, unit: "g" }];

    expect(parseToolInput(_nutrition, { recipeIds: ["chili"], lines: standIn })).toEqual({ recipeIds: ["chili"] });
    expect(parseToolInput(_nutrition, { lines: [...standIn, ...eggs] })).toEqual({ lines: eggs });
  });

  it("reads an empty list it may leave out as left out", () => {
    expect(parseToolInput(_nutrition, { recipeIds: [], lines: eggs })).toEqual({ lines: eggs });
  });

  it("still refuses a wrong call, as opposed to a stand-in", () => {
    expect(() => parseToolInput(_nutrition, { lines: [{ ingredientId: "egg", quantity: 2, unit: "dozen" }] })).toThrow();
    expect(parseToolInput(_nutrition, { recipeIds: ["k57-mangled"] })).toEqual({ recipeIds: ["k57-mangled"] });
  });

  /**
   * `sanitizeRecipe`'s `outdated` is `.nullable()` alone: null means "a creation", and leaving it
   * out is not allowed. Read as absent, the null became a missing key the schema then refused, and
   * no recipe could be created.
   */
  it("keeps the null of a field that may be null but not left out", () => {
    const sanitize = z.object({ instructions: z.string(), outdated: z.object({ title: z.string() }).nullable() });

    expect(parseToolInput(sanitize, { instructions: "Boil", outdated: null })).toEqual({ instructions: "Boil", outdated: null });
    expect(parseModelOutput(sanitize, { instructions: "Boil", outdated: "N/A" })).toEqual({ instructions: "Boil", outdated: null });
  });
});
