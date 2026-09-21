import { describe, expect, it } from "vitest";

import { MAX_SERVINGS, MIN_SERVINGS } from "@shared/servings";

import { recipeRoute, servingsParamOf } from "../routes";

describe("recipeRoute", () => {
  it("carries no servings when none were asked for", () => {
    expect(recipeRoute("abc")).toEqual({ pathname: "/recipe/[id]", params: { id: "abc" } });
  });

  it("writes the servings as the text the reader parses back", () => {
    const route = recipeRoute("abc", 6);

    expect(route).toEqual({ pathname: "/recipe/[id]", params: { id: "abc", servings: "6" } });
    expect(servingsParamOf("6")).toBe(6);
  });
});

describe("servingsParamOf", () => {
  it("is nothing when the route carried nothing", () => {
    expect(servingsParamOf(undefined)).toBeUndefined();
  });

  it("accepts the bounds the server accepts", () => {
    expect(servingsParamOf(String(MIN_SERVINGS))).toBe(MIN_SERVINGS);
    expect(servingsParamOf(String(MAX_SERVINGS))).toBe(MAX_SERVINGS);
  });

  it.each(["", "abc", "0", "2.5", String(MAX_SERVINGS + 1), "-1"])(
    "refuses %j rather than seeding a count the server would refuse",
    (raw) => {
      expect(servingsParamOf(raw)).toBeUndefined();
    },
  );
});
