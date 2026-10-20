import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE } from "@shared/translations";

import { catalogLocaleOf } from "../catalogLocale";

describe("catalogLocaleOf", () => {
  it("reads BBC Good Food in English and Marmiton in French", () => {
    expect(catalogLocaleOf("https://www.bbcgoodfood.com/recipes/chicken-tikka-masala")).toBe("en");
    expect(catalogLocaleOf("https://www.marmiton.org/recettes/recette_blanquette-de-veau_19219.aspx")).toBe("fr");
  });

  it("reads a page by its host, not by a path that names another source", () => {
    expect(catalogLocaleOf("https://www.marmiton.org/recettes/bbcgoodfood.com")).toBe("fr");
  });

  it("matches a source's host or its subdomains, never a host that only ends the same way", () => {
    expect(catalogLocaleOf("https://marmiton.org/recettes/tarte.aspx")).toBe("fr");
    expect(catalogLocaleOf("https://notmarmiton.org/recettes/tarte.aspx")).toBe(DEFAULT_LOCALE);
  });

  it("reads a host no source names in the default locale", () => {
    expect(catalogLocaleOf("https://www.allrecipes.com/recipe/chili")).toBe(DEFAULT_LOCALE);
  });
});
