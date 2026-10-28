import { describe, expect, it } from "vitest";

import { MAX_SERVINGS, MIN_SERVINGS } from "@shared/servings";

import { recipeIdOfLink, recipeLink, recipeRoute, servingsParamOf } from "../routes";

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

describe("recipeLink", () => {
  it("is the public address the share sheet sends, which the reader reads back", () => {
    const link = recipeLink("k57abc");

    expect(link).toBe("https://cuisko.app/r/k57abc");
    expect(recipeIdOfLink(link)).toBe("k57abc");
  });
});

describe("recipeIdOfLink", () => {
  it.each([
    ["the https link a tap or a share hands over", "https://cuisko.app/r/k57abc"],
    ["the bare path a universal link can arrive as", "/r/k57abc"],
    ["the app's own scheme", "cuisko://r/k57abc"],
    ["a trailing slash", "https://cuisko.app/r/k57abc/"],
    ["a query a chat app appended", "https://cuisko.app/r/k57abc?utm_source=whatsapp"],
    ["the link inside the message an Android share sends", "Poulet au curry sur Cuisko : https://cuisko.app/r/k57abc"],
    ["the www address, which the site redirects to the apex", "https://www.cuisko.app/r/k57abc"],
  ])("reads the id from %s", (_, link) => {
    expect(recipeIdOfLink(link)).toBe("k57abc");
  });

  it.each([
    ["another host", "https://evil.example/r/k57abc"],
    ["another host ending in the website's", "https://notcuisko.app/r/k57abc"],
    ["a recipe link with no id", "https://cuisko.app/r/"],
    ["an in-app path, which already routes as it is", "/recipe/k57abc"],
    ["a deeper path", "https://cuisko.app/r/k57abc/edit"],
    ["the home page", "https://cuisko.app/"],
    ["an id whose escape cannot be decoded, rather than throwing", "/r/%E0%A4"],
  ])("refuses %s", (_, link) => {
    expect(recipeIdOfLink(link)).toBeUndefined();
  });
});
