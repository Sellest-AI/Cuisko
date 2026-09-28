import { describe, expect, test } from "vitest";

import { routeForIncomingLink } from "../oauth-return";

describe("routeForIncomingLink", () => {
  test("keeps an Android OAuth return on /auth, so the gate can send the sign-in to the onboarding", () => {
    expect(routeForIncomingLink("cuisko://?code=4f2a")).toBe("/auth");
    expect(routeForIncomingLink("/?code=4f2a")).toBe("/auth");
    expect(routeForIncomingLink("cuisko:///?state=x&code=4f2a")).toBe("/auth");
  });

  test("lets every other link through as it came", () => {
    expect(routeForIncomingLink("cuisko://recipes")).toBe("cuisko://recipes");
    expect(routeForIncomingLink("/recipe/abc?servings=2")).toBe("/recipe/abc?servings=2");
    expect(routeForIncomingLink("/?barcode=123")).toBe("/?barcode=123");
  });

  /** Only the bare return is sign-in's: a page of the app with a `code` of its own is that page. */
  test("lets a link to a page through, even with a code query", () => {
    expect(routeForIncomingLink("cuisko://invite?code=ABC")).toBe("cuisko://invite?code=ABC");
    expect(routeForIncomingLink("/invite?code=ABC")).toBe("/invite?code=ABC");
    expect(routeForIncomingLink("/recipe/abc?servings=2&code=ABC")).toBe("/recipe/abc?servings=2&code=ABC");
  });
});
