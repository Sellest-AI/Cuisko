import { describe, expect, test } from "vitest";

import { cookingContextOf } from "../cookingContext";

describe("cookingContextOf", () => {
  test("no recipe in the URL: the question goes out on its own", () => {
    expect(cookingContextOf({})).toBeUndefined();
    expect(cookingContextOf({ recipeId: "", step: "3" })).toBeUndefined();
  });

  test("reads the recipe, the step on screen and the servings back as numbers", () => {
    expect(cookingContextOf({ recipeId: "k17gratin", step: "3", servings: "2" })).toEqual({
      id: "k17gratin",
      step: 3,
      servings: 2,
    });
  });

  test("keeps the recipe when the step or the servings do not parse", () => {
    expect(cookingContextOf({ recipeId: "k17gratin", step: "trois", servings: "" })).toEqual({ id: "k17gratin" });
  });

  test("a repeated key takes its first value, as the route's `q` does", () => {
    expect(cookingContextOf({ recipeId: ["k17gratin", "k17other"], step: ["2", "5"] })).toEqual({
      id: "k17gratin",
      step: 2,
    });
  });
});
