/**
 * `matchesDish`, on real titles.
 *
 * Every "rejects" case is a card a Marmiton search really returned as its most reviewed passing
 * result, in a 70-dish survey run on 2026-09-21. Every "accepts" case is the right recipe from the
 * same run, spelled as the site spelled it.
 */
import { describe, expect, it } from "vitest";

import { matchesDish } from "../dishMatch";

describe("matchesDish", () => {
  it.each([
    ["Madeleines au miel", "mafé"],
    ["Poulet Massala", "poulet yassa"],
    ["Pumpkin pie (tarte au potiron des Etats-Unis)", "shepherd's pie"],
    ["Tarte aux courgettes miam-mioum", "imam bayildi"],
    ["Keftedes (boulettes de viande au citron) (Grèce)", "köfte"],
  ])("rejects %j for %j, a popular card for another dish", (title, dish) => {
    expect(matchesDish(title, dish)).toBe(false);
  });

  it.each([
    ["Boeuf Bourguignon rapide", "boeuf bourguignon"],
    ["Omelette Espagnole (Tortilla auténtica)", "tortilla espagnole"],
    ["Paëlla fruits de mer, chorizo et poulet de Patou", "paella"],
    ["LASAGNE SAUMON ÉPINARD (Mascarpone)", "lasagnes au saumon"],
    ["Tajine aux citrons confits ou poulet M'chermel (Maroc)", "tajine de poulet aux citrons confits"],
    ["Bacalhau a bras (morue à la portugaise)", "bacalhau"],
  ])("accepts %j for %j: accents, case, plurals, word order and extra words don't matter", (title, dish) => {
    expect(matchesDish(title, dish)).toBe(true);
  });

  it("allows one typo in a word of 5 letters or more", () => {
    expect(matchesDish("Gaspacho express ( Espagne )", "gazpacho")).toBe(true);
  });

  it("allows no typo in a shorter word", () => {
    expect(matchesDish("Ris de veau", "riz")).toBe(false);
  });

  it("requires every significant word of the dish, not most of them", () => {
    expect(matchesDish("Poulet rôti", "poulet yassa")).toBe(false);
  });

  it("reads œ as oe, so bœuf and boeuf are one word", () => {
    expect(matchesDish("Bœuf bourguignon", "boeuf bourguignon")).toBe(true);
  });

  it("reads a URL slug like a title", () => {
    expect(matchesDish("vegan-shepherds-pie", "shepherd's pie")).toBe(true);
  });

  it("matches nothing for a dish made only of filler words", () => {
    expect(matchesDish("La recette maison", "la recette")).toBe(false);
  });

  it("allows no typo at all when typos are off, since one letter away can be another dish", () => {
    expect(matchesDish("gazpacho", "gaspacho", { typos: false })).toBe(false);
    expect(matchesDish("Wild garlic pesto", "pisto", { typos: false })).toBe(false);
    expect(matchesDish("Gazpacho andaluz", "gazpacho", { typos: false })).toBe(true);
  });
});
