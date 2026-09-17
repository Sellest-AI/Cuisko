import { describe, expect, test } from "vitest";

import { canBeMadeWith } from "../equipments";

describe("canBeMadeWith", () => {
  /** An empty list is the sanitizer saying "pans and a knife", not an unanswered question. */
  test("a recipe needing nothing passes any kitchen, an empty one included", () => {
    expect(canBeMadeWith([], ["oven"])).toBe(true);
    expect(canBeMadeWith([], [])).toBe(true);
  });

  /** The list is alternatives: the cook needs any one of them, never all. */
  test("one shared appliance is enough", () => {
    expect(canBeMadeWith(["slow cooker", "oven"], ["oven"])).toBe(true);
  });

  test("no shared appliance fails", () => {
    expect(canBeMadeWith(["slow cooker", "oven"], ["microwave", "toaster"])).toBe(false);
  });

  test("an empty kitchen fails any recipe that needs something", () => {
    expect(canBeMadeWith(["microwave"], [])).toBe(false);
  });
});
