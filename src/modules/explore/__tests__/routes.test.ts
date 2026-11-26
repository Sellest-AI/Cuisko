import { describe, expect, it } from "vitest";

import { exploreRoute, isExplorePath } from "../routes";

describe("exploreRoute", () => {
  it("opens on the featured recipes when no cuisine is named", () => {
    expect(exploreRoute()).toEqual({ pathname: "/explore", params: {} });
  });

  it("carries the cuisine as the category param", () => {
    expect(exploreRoute("french")).toEqual({ pathname: "/explore", params: { category: "french" } });
  });
});

describe("isExplorePath", () => {
  it("matches the page, with or without a trailing slash", () => {
    expect(isExplorePath("/explore")).toBe(true);
    expect(isExplorePath("/explore/")).toBe(true);
  });

  it("matches no other page", () => {
    expect(isExplorePath("/")).toBe(false);
    expect(isExplorePath("/recipes")).toBe(false);
    expect(isExplorePath("/explorer")).toBe(false);
  });
});
