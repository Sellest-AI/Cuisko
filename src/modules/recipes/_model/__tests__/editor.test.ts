import { describe, expect, it } from "vitest";

import { MAX_TIMING_MINUTES } from "@shared/recipes";

import {
  computedTagsOf,
  detailsOf,
  durationOf,
  durationTextOf,
  type EditorDetails,
  minutesOf,
  sameDetails,
} from "../editor";

/**
 * The duration field reads what a cook types into a box asking "how long", and rewrites it on blur.
 * What is pinned here is that contract: every shape a person actually types, the shapes it refuses
 * on purpose, and a canonical form that survives its own re-parse.
 */
describe("minutesOf", () => {
  it.each([
    ["30", 30],
    ["30 min", 30],
    ["30min", 30],
    ["30m", 30],
    ["1h30", 90],
    ["1 h 30", 90],
    ["1H30", 90],
    ["1:30", 90],
    ["1h", 60],
    ["1h00", 60],
    ["60", 60],
    ["2h05", 125],
  ])("reads %j as %i minutes", (typed, minutes) => {
    expect(minutesOf(typed)).toBe(minutes);
  });

  it.each(["", "0", "-3", "abc", "1:", "1h75"])("refuses %j", (typed) => {
    expect(minutesOf(typed)).toBeUndefined();
  });

  it("refuses decimal hours, the shape this parser exists to spare the cook", () => {
    expect(minutesOf("1.5h")).toBeUndefined();
  });

  it("accepts a whole week and refuses anything past it, which is a typo rather than a recipe", () => {
    expect(minutesOf(String(MAX_TIMING_MINUTES))).toBe(MAX_TIMING_MINUTES);
    expect(minutesOf(String(MAX_TIMING_MINUTES + 1))).toBeUndefined();
    expect(minutesOf("200h")).toBeUndefined();
  });
});

describe("durationOf", () => {
  it("splits minutes into hours and the remainder", () => {
    expect(durationOf(90)).toEqual({ hours: 1, minutes: 30 });
    expect(durationOf(45)).toEqual({ hours: 0, minutes: 45 });
    expect(durationOf(undefined)).toBeUndefined();
  });
});

describe("durationTextOf", () => {
  it("writes hours as 1h30, whole hours as 1h and short ones in minutes", () => {
    expect(durationTextOf(90, "min")).toBe("1h30");
    expect(durationTextOf(125, "min")).toBe("2h05");
    expect(durationTextOf(60, "min")).toBe("1h");
    expect(durationTextOf(45, "min")).toBe("45 min");
    expect(durationTextOf(undefined, "min")).toBe("");
  });

  /** Blurring twice must change nothing, so every canonical text has to parse back to its number. */
  it("re-parses to the minutes it was written from, for every duration up to the cap", () => {
    for (let minutes = 1; minutes <= MAX_TIMING_MINUTES; minutes++)
      expect(minutesOf(durationTextOf(minutes, "min"))).toBe(minutes);
  });
});

describe("detailsOf", () => {
  it("opens on the authored tags only, and computedTagsOf holds the rest", () => {
    const recipe = {
      tags: ["vegetarian", "main", "gluten-free", "comfort-food"] as const,
      equipments: ["oven"] as const,
      difficulty: 2,
      cuisine: "french",
      timings: { preparation: 20 },
    } as const;

    const details = detailsOf({ ...recipe, tags: [...recipe.tags], equipments: [...recipe.equipments] });

    expect(details.tags).toEqual(["main", "comfort-food"]);
    expect(computedTagsOf([...recipe.tags])).toEqual(["vegetarian", "gluten-free"]);
  });
});

describe("sameDetails", () => {
  const stored: EditorDetails = {
    tags: ["main", "comfort-food"],
    equipments: ["oven", "blender"],
    difficulty: 3,
    cuisine: "french",
    timings: { preparation: 20, cooking: 45 },
  };

  it("ignores the order of the two arrays", () => {
    expect(
      sameDetails(stored, { ...stored, tags: ["comfort-food", "main"], equipments: ["blender", "oven"] }),
    ).toBe(true);
  });

  it("sees a timing going from 20 to not stated", () => {
    expect(sameDetails(stored, { ...stored, timings: { cooking: 45 } })).toBe(false);
  });

  it("sees a cuisine change", () => {
    expect(sameDetails(stored, { ...stored, cuisine: "italian" })).toBe(false);
  });

  it("sees a tag removed even when the counts would otherwise line up", () => {
    expect(sameDetails(stored, { ...stored, tags: ["main", "starter"] })).toBe(false);
  });
});
