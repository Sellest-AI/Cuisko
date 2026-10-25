import { describe, expect, it } from "vitest";

import { httpsImageOf } from "../imageUrl";

const PAGE = "https://www.marmiton.org/recettes/recette_tartiflette_11111.aspx";

describe("httpsImageOf", () => {
  it("keeps an absolute https address", () => {
    expect(httpsImageOf("https://assets.afcdn.com/recipe/tartiflette.jpg", PAGE)).toBe(
      "https://assets.afcdn.com/recipe/tartiflette.jpg",
    );
  });

  it("drops a plain http address, which iOS will not load", () => {
    expect(httpsImageOf("http://assets.afcdn.com/recipe/tartiflette.jpg", PAGE)).toBeUndefined();
  });

  it("resolves a relative address against the page, kept because the page is https", () => {
    expect(httpsImageOf("/images/tartiflette.jpg", PAGE)).toBe("https://www.marmiton.org/images/tartiflette.jpg");
  });

  it("drops a relative address on a page served over http", () => {
    expect(httpsImageOf("/images/tartiflette.jpg", "http://blog.example.com/tartiflette")).toBeUndefined();
  });

  it("resolves a protocol-relative address to https on an https page", () => {
    expect(httpsImageOf("//assets.afcdn.com/recipe/tartiflette.jpg", PAGE)).toBe(
      "https://assets.afcdn.com/recipe/tartiflette.jpg",
    );
  });

  it.each([undefined, "", "   "])("is absent when the page gave none (%j)", (raw) => {
    expect(httpsImageOf(raw, PAGE)).toBeUndefined();
  });

  it("drops an address that is not one", () => {
    expect(httpsImageOf("data:image/png;base64,iVBORw0KGgo=", PAGE)).toBeUndefined();
  });
});
