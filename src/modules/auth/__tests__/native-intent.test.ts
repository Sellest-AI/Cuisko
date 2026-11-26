import { describe, expect, test } from "vitest";

import { redirectSystemPath } from "../native-intent";

const route = (path: string) => redirectSystemPath({ path, initial: true });

describe("redirectSystemPath", () => {
  test("keeps an OAuth return on /auth while the app is open, before any other rule", () => {
    expect(redirectSystemPath({ path: "cuisko://?code=4f2a", initial: false })).toBe("/auth");
  });

  test("lands an OAuth return that starts the app on home", () => {
    expect(route("cuisko://?code=4f2a")).toBe("/");
  });

  test("lands iOS's share extension link on home, where the sheet opens over it", () => {
    expect(route("cuisko://dataUrl=cuiskoShareKey")).toBe("/");
  });

  /** A shared recipe link, however it arrives: a tap on the https address, its bare path, the scheme. */
  test("opens a shared recipe link on that recipe", () => {
    expect(route("https://cuisko.app/r/k57abc")).toBe("/recipe/k57abc");
    expect(route("/r/k57abc")).toBe("/recipe/k57abc");
    expect(route("cuisko://r/k57abc")).toBe("/recipe/k57abc");
  });

  test("lets every other link through as it came", () => {
    expect(route("/recipe/k57abc?servings=2")).toBe("/recipe/k57abc?servings=2");
    expect(route("cuisko://recipes")).toBe("cuisko://recipes");
  });
});
