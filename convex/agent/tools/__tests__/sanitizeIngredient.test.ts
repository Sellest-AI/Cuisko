import { describe, expect, it } from "vitest";

import type { LookupHit } from "@convex/functions/ingredients/lookup/lookupHit";
import { ALLERGENS } from "@shared/allergens";

import { toSanitizedIngredient } from "../sanitizeIngredient";

/**
 * The generation is not tested here — it is a model call, and the manual test beside this one is
 * where a real model is asked. What is tested is the boundary right after it, where a valid-looking
 * answer becomes a wrong catalog row: a name marked as authored that nobody authored, a modelled
 * figure sitting on top of a measured one, or a unit nothing can weigh.
 */

/**
 * The allergen checklist as a model answers it — every one of the fourteen, the named ones true.
 *
 * Written out in full rather than as a list of the trues, because that is the shape the model is
 * held to: the schema asks all fourteen so that answering cannot be skipped, and a fixture that
 * supplied three keys would be testing a schema nobody ships.
 */
const _allergens = (...present: string[]) =>
  Object.fromEntries(ALLERGENS.map((allergen) => [allergen, present.includes(allergen)]));

const _facts = (overrides: Record<string, unknown> = {}) => ({
  madeFrom: "carrot",
  names: { en: "carrot", fr: "carotte" },
  aliases: { en: [], fr: [] },
  emoji: "🥕",
  category: "VEGETABLE",
  diet: "vegan",
  allergens: _allergens(),
  defaultUnit: "g",
  defaultQuantity: 100,
  gramsPerPiece: 80,
  gramsPerMl: null,
  nutrition: {
    calories: 41,
    protein: 0.9,
    fat: 0.2,
    saturatedFat: 0.04,
    carbohydrates: 9.6,
    sugars: 4.7,
    fiber: 2.8,
    sodium: 69,
  },
  ...overrides,
});

const _answer = (overrides: Record<string, unknown> = {}) => ({
  verdict: "ingredient",
  facts: _facts(),
  ...overrides,
});

const _new = (raw: unknown, hits: LookupHit[] = []) => {
  const sanitized = toSanitizedIngredient(raw, hits);

  if (sanitized.verdict !== "new") throw new Error(`expected a new row, got ${sanitized.verdict}`);

  return sanitized.facts;
};

describe("toSanitizedIngredient", () => {
  it("returns the facts a row is built from, and never a derived field", () => {
    const facts = _new(_answer());

    expect(facts.names.en.value).toBe("carrot");
    expect(facts.category).toBe("VEGETABLE");
    // `search`, `nutriScore` and `slug` are `ingredientRow`'s (ADR 0011) — a tool that produced
    // them would be a second author of a derived field.
    expect(facts).not.toHaveProperty("search");
    expect(facts).not.toHaveProperty("nutriScore");
    expect(facts.slug).toBeUndefined();
  });

  it("refuses without inventing a row", () => {
    expect(toSanitizedIngredient({ verdict: "not-food", facts: null }))
      .toEqual({ verdict: "refused", reason: "not-food" });
    expect(toSanitizedIngredient({ verdict: "not-an-ingredient", facts: null }))
      .toEqual({ verdict: "refused", reason: "not-an-ingredient" });
  });

  it("marks a name the model rendered as machine, and one a source stated as authored", () => {
    const hits: LookupHit[] = [{ source: "foodComposition", names: { fr: ["Carotte"] } }];
    const facts = _new(_answer(), hits);

    // CIQUAL stated the French; nobody stated the English, so it must not claim to be authored —
    // `edited` is what forbids a better translation replacing it later.
    expect(facts.names.fr.status).toBe("edited");
    expect(facts.names.en.status).toBe("machine");
  });

  it("keeps a source's spelling as an alias when the model chose a different word", () => {
    const hits: LookupHit[] = [
      { source: "foodComposition", names: { fr: ["Carotte, crue"], en: ["carrot"] } },
    ];
    const facts = _new(_answer(), hits);

    // The laboratory description is not what a shop calls it, so it does not become the name —
    // but the row still has to be findable under it.
    expect(facts.names.fr.value).toBe("carotte");
    expect(facts.aliases.fr).toEqual(["Carotte, crue"]);
    // The English spelling IS the chosen name, so it is not repeated as an alias of itself.
    expect(facts.aliases.en).toEqual([]);
  });

  it("never repeats an alias, whatever case the model and the source wrote it in", () => {
    const answer = _answer({ facts: _facts({ aliases: { en: ["Carrots", "carrots"], fr: [] } }) });
    const hits: LookupHit[] = [{ source: "openFoodFacts", names: { en: ["CARROTS"] } }];

    expect(_new(answer, hits).aliases.en).toEqual(["Carrots"]);
  });

  it("lets a measured figure win over the model's, field by field", () => {
    const hits: LookupHit[] = [
      { source: "foodComposition", names: {}, nutrition: { calories: 36, fiber: 3.2 } },
    ];
    const facts = _new(_answer(), hits);

    expect(facts.nutrition.calories).toBe(36);
    expect(facts.nutrition.fiber).toBe(3.2);
    // Nothing measured protein, so the modelled number is what the row gets.
    expect(facts.nutrition.protein).toBe(0.9);
  });

  it("prefers the more authoritative source where two measured the same field", () => {
    const hits: LookupHit[] = [
      { source: "openFoodFacts", names: {}, nutrition: { calories: 50 } },
      { source: "foodComposition", names: {}, nutrition: { calories: 36 } },
    ];

    expect(_new(_answer(), hits).nutrition.calories).toBe(36);
  });

  it("drops a ratio the model wrote as null rather than storing one", () => {
    const facts = _new(_answer());

    expect(facts.gramsPerPiece).toBe(80);
    // `undefined` rather than an absent key, matching what `ingredientRow` passes to the row: the
    // schema documents undefined as how a `patch` DROPS a ratio, where an omitted key leaves the
    // old one in place.
    expect(facts.gramsPerMl).toBeUndefined();
  });

  it("weighs a volume the model gave no density for rather than losing the row over it", () => {
    // A per-100g nutrition table is useless to a recipe line it cannot convert. But the row also
    // carries a diet, an allergen walk and eight nutrition figures, and discarding all of them
    // over a missing density is the worse trade — water's 1.0 is wrong by at most a third for
    // anything a recipe pours.
    const noDensity = _answer({
      facts: _facts({ defaultUnit: "cs", gramsPerPiece: null, gramsPerMl: null }),
    });
    const facts = _new(noDensity);

    expect(facts.defaultUnit).toBe("cs");
    expect(facts.gramsPerMl).toBe(1);
  });

  it("keeps the model's own density when it gave one", () => {
    const weighable = _answer({
      facts: _facts({ defaultUnit: "cs", gramsPerPiece: null, gramsPerMl: 0.91 }),
    });

    // The repair above is a net, not a default: a stated density must never be overwritten by it.
    expect(_new(weighable).gramsPerMl).toBe(0.91);
  });

  it("still refuses a countable unit with no weight for one of them", () => {
    // The one unweighable row that cannot be repaired: an onion is 150 g and a bay leaf is 0.1 g,
    // and there is no default between them that is not an invention.
    const unweighable = _answer({
      facts: _facts({ defaultUnit: "pcs", gramsPerPiece: null, gramsPerMl: null }),
    });

    expect(() => toSanitizedIngredient(unweighable)).toThrow(/gramsPerPiece/);
  });

  it("rejects a vocabulary the column would reject, rather than storing it", () => {
    expect(() => toSanitizedIngredient(_answer({ facts: _facts({ category: "VEGETABLES" }) })))
      .toThrow();
    expect(() => toSanitizedIngredient(_answer({ facts: _facts({ diet: "flexitarian" }) })))
      .toThrow();
    expect(() => toSanitizedIngredient(_answer({ facts: _facts({ defaultUnit: "cup" }) })))
      .toThrow();
  });

  it("folds the fourteen answers into the list the column stores", () => {
    const sauce = _answer({
      facts: _facts({ allergens: _allergens("fish", "gluten", "sulphites") }),
    });

    // Order follows ALLERGENS rather than whatever order the model's keys arrived in, so the same
    // three allergens never produce two different-looking rows.
    expect(_new(sauce).allergens).toEqual(["gluten", "fish", "sulphites"]);
  });

  it("reads an allergen the model left unanswered as a no, never as a yes", () => {
    // Absent is the one reading that is safe: the checklist is required on the way OUT, so a key
    // only goes missing when a model wrote something that was not a boolean. Treating that as
    // "contains it" would print an allergen warning nobody claimed.
    const partial = _answer({ facts: _facts({ allergens: { gluten: true, fish: "yes" } }) });

    expect(_new(partial).allergens).toEqual(["gluten"]);
  });

  it("stores a name lowercase however the model capitalised it", () => {
    // A database states its heading capitalised — "Sauce Worcestershire" — and the prompt tells the
    // model to prefer a stated spelling. The name reaches a screen, so the casing is settled here
    // rather than left to whether the model read the whole rule.
    const shouted = _answer({
      facts: _facts({ names: { en: "Worcestershire Sauce", fr: " Sauce Worcestershire " } }),
    });
    const facts = _new(shouted);

    expect(facts.names.en.value).toBe("worcestershire sauce");
    expect(facts.names.fr.value).toBe("sauce worcestershire");
  });

  it("credits a source for a name it stated in another case", () => {
    const hits: LookupHit[] = [{ source: "foodComposition", names: { fr: ["Carotte"] } }];
    const facts = _new(_answer({ facts: _facts({ names: { en: "carrot", fr: "Carotte" } }) }), hits);

    // Lowercasing must not cost the row its provenance: CIQUAL authored this word, whatever case
    // either side wrote it in, and `edited` is what forbids a later translation replacing it.
    expect(facts.names.fr).toEqual({ value: "carotte", status: "edited" });
  });

  it("names the field that broke when the model produced no usable row", () => {
    // The schema drops an invalid `facts` silently (it is absentable), so the caller used to get
    // "no usable row" with no way to tell which rule broke. An operator reading a log needs the
    // field name.
    const broken = { verdict: "ingredient", facts: _facts({ nutrition: { calories: 41 } }) };

    expect(() => toSanitizedIngredient(broken)).toThrow(/protein/);
  });

  it("refuses to call a term an ingredient while producing no row for it", () => {
    expect(() => toSanitizedIngredient({ verdict: "ingredient", facts: null })).toThrow();
  });

  it("never stores a name the model wrote as the word for having none", () => {
    const nameless = _answer({ facts: _facts({ names: { en: "N/A", fr: "carotte" } }) });

    // `names` is required, so a shrug in one language fails loudly here rather than becoming a row
    // the English shopper finds under "N/A" and duplicates.
    expect(() => toSanitizedIngredient(nameless)).toThrow();
  });
});
