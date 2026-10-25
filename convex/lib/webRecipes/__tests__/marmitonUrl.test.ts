import { describe, expect, it } from "vitest";

import { isMarmitonRecipeUrl, searchUrlOf } from "../marmitonUrl";

describe("isMarmitonRecipeUrl", () => {
  it("accepts a recipe page", () => {
    expect(isMarmitonRecipeUrl("https://www.marmiton.org/recettes/recette_tartiflette_11111.aspx")).toBe(true);
  });

  it.each([
    ["the search page", "https://www.marmiton.org/recettes/recherche.aspx?aqt=tartiflette"],
    ["an editorial page", "https://www.marmiton.org/shopping/meilleurs-moules-a-tarte-s4012345.html"],
    ["another host", "https://www.750g.com/recettes/recette_tartiflette.htm"],
    ["plain http", "http://www.marmiton.org/recettes/recette_tartiflette_11111.aspx"],
    ["a lookalike host", "https://www.marmiton.org.example.com/recettes/recette_tartiflette_11111.aspx"],
    ["the apex host", "https://marmiton.org/recettes/recette_tartiflette_11111.aspx"],
    ["a reel", "https://www.instagram.com/reel/C8abcdefghi/"],
    ["text that is no address", "tartiflette"],
  ])("refuses %s", (_case, url) => {
    expect(isMarmitonRecipeUrl(url)).toBe(false);
  });
});

describe("searchUrlOf", () => {
  it("searches by aqt alone, the one query robots.txt allows", () => {
    expect(searchUrlOf("tartiflette")).toBe("https://www.marmiton.org/recettes/recherche.aspx?aqt=tartiflette");
  });

  it("encodes the accent and the space, and keeps the apostrophe, which a URL may hold as it is", () => {
    expect(searchUrlOf("soupe à l'oignon")).toBe(
      "https://www.marmiton.org/recettes/recherche.aspx?aqt=soupe%20%C3%A0%20l'oignon",
    );
  });

  it("encodes what would otherwise add a query parameter", () => {
    expect(searchUrlOf("pâtes&page=2")).toBe("https://www.marmiton.org/recettes/recherche.aspx?aqt=p%C3%A2tes%26page%3D2");
  });
});
