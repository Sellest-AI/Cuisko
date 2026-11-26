import { describe, expect, test } from "vitest";

import { isAuthFlowPath, isGuestPath } from "../auth-flow";

describe("isAuthFlowPath", () => {
  test("covers the sign-in page and every step of the onboarding", () => {
    expect(isAuthFlowPath("/auth")).toBe(true);
    expect(isAuthFlowPath("/onboarding/promise")).toBe(true);
    expect(isAuthFlowPath("/onboarding/import")).toBe(true);
  });

  test("leaves the app's own pages out, one whose name only starts like them included", () => {
    expect(isAuthFlowPath("/")).toBe(false);
    expect(isAuthFlowPath("/recipes")).toBe(false);
    expect(isAuthFlowPath("/share-import")).toBe(false);
    expect(isAuthFlowPath("/authors")).toBe(false);
  });
});

describe("isGuestPath", () => {
  test("covers a recipe's three tabs", () => {
    expect(isGuestPath("/recipe/k57abc")).toBe(true);
    expect(isGuestPath("/recipe/k57abc/ingredients")).toBe(true);
    expect(isGuestPath("/recipe/k57abc/instructions")).toBe(true);
  });

  test("covers a recipe whose id only starts like a page beside it", () => {
    expect(isGuestPath("/recipe/newcastle")).toBe(true);
    expect(isGuestPath("/recipe/edit7")).toBe(true);
  });

  test("leaves out what writes or cooks a recipe, whatever id it carries", () => {
    expect(isGuestPath("/recipe/new")).toBe(false);
    expect(isGuestPath("/recipe/edit/k57abc")).toBe(false);
    expect(isGuestPath("/recipe/edit/ingredients")).toBe(false);
    expect(isGuestPath("/recipe/step-by-step/k57abc")).toBe(false);
    expect(isGuestPath("/recipe/step-by-step/instructions")).toBe(false);
  });

  test("leaves every other page out", () => {
    expect(isGuestPath("/")).toBe(false);
    expect(isGuestPath("/recipe")).toBe(false);
    expect(isGuestPath("/recipes")).toBe(false);
    expect(isGuestPath("/recipe/k57abc/other")).toBe(false);
    expect(isGuestPath("/auth")).toBe(false);
  });
});
