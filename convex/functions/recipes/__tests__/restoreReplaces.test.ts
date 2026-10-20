import { describe, expect, test } from "vitest";

import { RECIPE_STATUSES } from "@convex/schema/recipes";

import { exportCanUpgrade, restoreReplaces } from "../restoreReplaces";

describe("restoreReplaces", () => {
  test("a generated recipe gives way to a reviewed or edited export", () => {
    expect(restoreReplaces("generated", "reviewed")).toBe(true);
    expect(restoreReplaces("generated", "edited")).toBe(true);
  });

  test("a generated recipe stays for a generated export, or one from before the status column", () => {
    expect(restoreReplaces("generated", "generated")).toBe(false);
    expect(restoreReplaces("generated", undefined)).toBe(false);
  });

  test("a reviewed or edited recipe is never replaced, whatever the export says", () => {
    for (const exported of [...RECIPE_STATUSES, undefined]) {
      expect(restoreReplaces("reviewed", exported)).toBe(false);
      expect(restoreReplaces("edited", exported)).toBe(false);
    }
  });
});

describe("exportCanUpgrade", () => {
  test("is true exactly for the exports that replace some copy here", () => {
    for (const exported of [...RECIPE_STATUSES, undefined]) {
      const replacesSome = RECIPE_STATUSES.some((existing) => restoreReplaces(existing, exported));
      expect(exportCanUpgrade(exported)).toBe(replacesSome);
    }
  });
});
