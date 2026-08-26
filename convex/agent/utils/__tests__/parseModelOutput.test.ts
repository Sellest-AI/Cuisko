import { describe, expect, it } from "vitest";
import * as z from "zod/v4";

import { modelNumber, modelText, parseModelOutput } from "../parseModelOutput";

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
