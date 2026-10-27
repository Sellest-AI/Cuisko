import { describe, expect, it, vi } from "vitest";

import { parseFromParam, toFromParam } from "../blockedRoute";

describe("the blocked route as a param", () => {
  it("round-trips the template and every param, query and arrays included", () => {
    const route = { pathname: "/recipe/[id]", params: { id: "123", servings: "4", tags: ["vegan", "quick"] } };
    expect(parseFromParam(toFromParam(route))).toEqual(route);
  });

  it("reads a missing param, or one that does not parse, as no route", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseFromParam(undefined)).toBeUndefined();
    expect(parseFromParam('{"pathname":"/recipe/[id]"')).toBeUndefined();
    expect(parseFromParam('{"pathname":3,"params":{}}')).toBeUndefined();
    expect(parseFromParam(["a", "b"])).toBeUndefined();
  });
});
