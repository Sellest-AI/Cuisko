import { describe, expect, test } from "vitest";

import type { IngredientNutrition } from "@shared/nutrition";

import {
  aboutTheSameFood,
  curatedSpellingsIn,
  measuredAboutIt,
  measuredCount,
  measuredNutrition,
  measuredOver,
  mostLikelyFirst,
  spellingsOfHit,
  type LookupHit,
} from "../lookupHit";

/**
 * The seam between what a source measured and what the agent produced.
 *
 * Both halves of this file guard the same thing from opposite sides: a number a laboratory
 * published must survive contact with a number a model invented, and a field nobody measured must
 * never acquire a value nobody meant. Getting either wrong is silent — the row stores eight
 * plausible figures, a Nutri-Score is computed from them, and no screen looks broken.
 */
const MODELLED: IngredientNutrition = {
  calories: 100,
  protein: 1,
  fat: 1,
  saturatedFat: 1,
  carbohydrates: 1,
  sugars: 1,
  fiber: 1,
  sodium: 1,
};

const hit = (source: LookupHit["source"], nutrition: LookupHit["nutrition"]): LookupHit => ({
  source,
  names: { en: ["Carrot"] },
  nutrition,
});

describe("functions/ingredients/lookup/measuredNutrition", () => {
  test("keeps the fields a source published", () => {
    expect(measuredNutrition({ calories: 41, protein: 0.9 })).toEqual({
      calories: 41,
      protein: 0.9,
    });
  });

  /**
   * The rule that did NOT change when partial answers started being kept. An absent field is not
   * a zero — a source silent on fiber has said nothing about fiber — and the Nutri-Score reads all
   * eight together, so a fabricated zero moves the grade a shopper reads.
   */
  test("an absent field stays absent rather than becoming a zero", () => {
    const measured = measuredNutrition({ calories: 41 });

    expect(measured).not.toHaveProperty("fiber");
    expect(measured?.fiber).toBeUndefined();
  });

  test.each([
    ["nothing at all", {}],
    ["a NaN", { calories: Number.NaN }],
    ["an infinity", { protein: Number.POSITIVE_INFINITY }],
  ])("returns nothing when a source published %s", (_case, facts) => {
    expect(measuredNutrition(facts)).toBeUndefined();
  });

  test("counts only the fields that carry a number", () => {
    expect(measuredCount(measuredNutrition({ calories: 41, protein: 0.9 }))).toBe(2);
    expect(measuredCount(undefined)).toBe(0);
  });
});

describe("functions/ingredients/lookup/measuredOver", () => {
  test("a modelled number survives only where nothing measured that field", () => {
    const merged = measuredOver(MODELLED, [hit("foodComposition", { calories: 41, fiber: 2.8 })]);

    expect(merged.calories).toBe(41);
    expect(merged.fiber).toBe(2.8);
    expect(merged.sugars).toBe(MODELLED.sugars);
  });

  /**
   * The ordering that matters, and the one a plain "first hit wins" gets backwards: the resolver
   * runs Open Food Facts and USDA in parallel, so `hits` arrives in completion order rather than
   * in order of authority. A manufacturer's declaration must not beat a laboratory measurement
   * because it happened to answer first.
   */
  test("a laboratory measurement beats a label, whatever order they arrived in", () => {
    const label = hit("openFoodFacts", { calories: 72 });
    const laboratory = hit("foodComposition", { calories: 41 });

    expect(measuredOver(MODELLED, [label, laboratory]).calories).toBe(41);
    expect(measuredOver(MODELLED, [laboratory, label]).calories).toBe(41);
  });

  test("a weaker source still fills a field the stronger one left empty", () => {
    const merged = measuredOver(MODELLED, [
      hit("openFoodFacts", { calories: 72, sodium: 680 }),
      hit("foodComposition", { calories: 41 }),
    ]);

    expect(merged.calories).toBe(41);
    expect(merged.sodium).toBe(680);
  });

  test("no hits, or hits that measured nothing, leaves the model's answer alone", () => {
    expect(measuredOver(MODELLED, [])).toEqual(MODELLED);
    expect(measuredOver(MODELLED, [hit("openFoodFacts", undefined)])).toEqual(MODELLED);
  });
});

describe("functions/ingredients/lookup/aboutTheSameFood", () => {
  /**
   * A spelling sharing one word of the name is not about it when it drops another. "Pesto" clears
   * the fuzzy bar against "pesto rouge" on the shared word alone, and the red pesto then took
   * USDA's basil pesto figures: the colour was the identity, and it was the word that went missing.
   */
  test.each([
    ["Pesto", "pesto rouge"],
    ["Sauce, pesto, CLASSICO, basil pesto, ready-to-serve", "red pesto"],
  ])("%s is not about %s: it drops a word of the name", (spelling, name) => {
    expect(aboutTheSameFood(spelling, name)).toBe(false);
  });

  test.each([
    ["Pesto rouge bio", "pesto rouge"],
    ["Carrots, raw", "carrot"],
  ])("%s is about %s: it keeps every word of the name", (spelling, name) => {
    expect(aboutTheSameFood(spelling, name)).toBe(true);
  });
});

/**
 * The gate across borderline foods: does a source's spelling describe the food we hold, so its
 * figures may be stored as ours?
 *
 * A benchmark for whoever tunes the comparator (`scoreCandidate`, `keepsEveryWord`, the word lists
 * in `@shared/ingredientMatch`). Each pair has one clear answer; a pair a cook could argue either
 * way does not belong here, because it would pin a guess.
 *
 * `KNOWN_WRONG` holds the pairs the gate gets wrong today, each with why. They run as `test.fails`,
 * so they turn red the day a change fixes one: move it to `GATE` then, and the fix stays pinned.
 */
type GatePair = [spelling: string, name: string, about: boolean];

const GATE: GatePair[] = [
  ["Oignon frais", "oignon", true],
  ["Oignon", "oignon rouge", false],
  ["Onions, red, raw", "red onion", true],
  ["Pesto, red, ready-to-serve", "red pesto", true],
  ["Lentils, pink or red, raw", "red lentils", true],
  ["Lentilles vertes du Puy", "lentilles vertes", true],
  ["Lentilles", "lentilles corail", false],
  ["Alcoholic beverage, wine, table, red", "red wine", true],
  ["Vinegar, red wine", "red wine vinegar", true],
  ["Alcoholic beverage, wine, table, red", "red wine vinegar", false],
  ["Rice, white, long-grain, raw", "rice", true],
  ["Rice, white, long-grain, raw", "brown rice", false],
  ["Rice, white, raw", "rice vinegar", false],
  ["Soup, stock, beef, home-prepared", "beef stock", true],
  ["Soup, stock, beef, home-prepared", "chicken stock", false],
  ["Chicken, broilers, breast, meat only, raw", "chicken breast", true],
  ["Chicken, broilers, breast, meat only, raw", "chicken thigh", false],
  ["Potatoes, raw", "sweet potato", false],
  ["Sweet potato, raw", "sweet potato", true],
  ["Peanuts, raw", "peanut butter", false],
  ["Peanut butter, smooth style", "peanut butter", true],
  ["Milk, whole", "almond milk", false],
  ["Nuts, coconut milk, raw", "coconut milk", true],
  ["Nuts, chestnuts, european, raw", "chestnut spread", false],
  ["Crème de marrons de l'Ardèche", "crème de marrons", true],
  ["Huile d'olive vierge extra", "huile d'olive", true],
  ["Tomatoes, red, ripe, raw", "tomatoes", true],
  ["Beurre doux", "beurre salé", false],
  ["Butter, salted", "butter", true],
  ["Wheat flour, white, all-purpose", "flour", true],
  ["Wheat flour, white, all-purpose", "rye flour", false],
  ["Egg, whole, raw, fresh", "egg", true],
  ["Egg, whole, raw, fresh", "egg yolk", false],
  ["Cheese, feta", "feta", true],
  ["Garlic, raw", "garlic", true],
  ["Sel de Guérande", "sel", true],
  ["Curry powder", "red curry paste", false],
  ["Chocolate, dark, 70-85% cacao solids", "dark chocolate", true],
  ["Chocolate, dark, 70-85% cacao solids", "milk chocolate", false],
  ["Honey", "honey", true],
];

const KNOWN_WRONG: [...GatePair, why: string][] = [
  // The spelling ADDS an identifying word. `keepsEveryWord` checks only that the name's words
  // are kept, and the score's penalty for extra words is soft.
  ["Onion rings, breaded", "onion", false, "the spelling adds a word"],
  ["Pasta with pesto", "pesto", false, "the spelling adds a word"],
  ["Sweet potato, raw", "potato", false, "the spelling adds a word"],
  ["Egg, yolk, raw, fresh", "egg", false, "the spelling adds a word"],
  ["Garlic powder", "garlic", false, "the spelling adds a word"],
  ["Ail des ours", "ail", false, "the spelling adds a word"],
  // A preservation word is folded off as a qualifier, so dried tomatoes ARE tomatoes, at 1.00.
  ["Tomates", "tomates séchées", false, "séchées is stripped as a qualifier"],
  // Vocabulary, not the rule: these words should not count as identifying.
  ["Beurre", "beurre doux", true, "doux is not a qualifier"],
  ["Huile d'olive", "huile d'olive vierge extra", true, "vierge extra is not a grade"],
  ["Tomates pelées", "tomates en conserve", true, "conserve is not a qualifier"],
  // A synonym shares no spelling, and no string rule finds it.
  ["Onions, spring or scallions, raw", "green onion", true, "a synonym, not a shared word"],
];

describe("functions/ingredients/lookup/aboutTheSameFood across borderline foods", () => {
  test.each(GATE)("%s is about %s: %s", (spelling, name, about) => {
    expect(aboutTheSameFood(spelling, name)).toBe(about);
  });

  test.fails.each(KNOWN_WRONG)("%s is about %s: %s (known wrong: %s)", (spelling, name, about) => {
    expect(aboutTheSameFood(spelling, name)).toBe(about);
  });
});

describe("functions/ingredients/lookup/measuredAboutIt", () => {
  const RED_PESTO = { en: "red pesto", fr: "pesto rouge" };

  const usdaPesto = (measuredAs: string): LookupHit => ({
    source: "foodComposition",
    names: { en: [measuredAs] },
    searched: true,
    nutrition: { calories: 372, protein: 4.16, fat: 36.4, sodium: 1030 },
    measuredAs: [{ name: measuredAs, locale: "en" }],
  });

  test("drops a basil pesto's figures from a red pesto", () => {
    const [kept] = measuredAboutIt(
      [usdaPesto("Sauce, pesto, CLASSICO, basil pesto, ready-to-serve")],
      RED_PESTO,
    );

    expect(kept?.nutrition).toBeUndefined();
  });

  test("keeps the figures of a hit measured on a red pesto", () => {
    const [kept] = measuredAboutIt([usdaPesto("Pesto, red, ready-to-serve")], RED_PESTO);

    expect(kept?.nutrition?.calories).toBe(372);
  });

  /** Spelling drops the "vierge extra"; Jev knows the oil is the same oil, and it already decided. */
  test("keeps the figures Jev picked, even on a spelling the word rule would refuse", () => {
    const [kept] = measuredAboutIt(
      [{ ...usdaPesto("Huile d'olive"), judged: true }],
      { en: "extra virgin olive oil", fr: "huile d'olive vierge extra" },
    );

    expect(kept?.nutrition?.calories).toBe(372);
  });
});

describe("functions/ingredients/lookup/spellingsOfHit", () => {
  /**
   * Language-tagged spellings lead because the caller tries them in order against the catalog and
   * stops at the first match. An untagged name is a real extra chance the row already exists — the
   * catalog re-search is locale-blind — but it is the weakest guess in the list.
   */
  test("tagged names come before the ones no source put a language on", () => {
    expect(
      spellingsOfHit({
        source: "openFoodFacts",
        names: { en: ["Harissa paste"], fr: ["Harissa"] },
        untagged: ["Harissa du Cap-Bon"],
      }),
    ).toEqual(["Harissa paste", "Harissa", "Harissa du Cap-Bon"]);
  });

  test("a hit with no untagged names is just its tagged ones", () => {
    expect(spellingsOfHit(hit("foodComposition", undefined))).toEqual(["Carrot"]);
  });
});

describe("functions/ingredients/lookup/mostLikelyFirst", () => {
  const result = (name: string, nutrition: LookupHit["nutrition"]) => ({
    measuredAs: [{ name, locale: "en" as const }],
    nutrition: nutrition!,
  });

  /** USDA measured the rings on more fields than raw onions; completeness alone picked the rings. */
  test("puts the result named like the food first, however few fields it measured", () => {
    const rings = result("Onion rings, breaded, par fried, frozen", { calories: 276, fat: 14, sugars: 4, fiber: 2 });
    const raw = result("Onions, raw", { calories: 40 });

    expect(mostLikelyFirst("onion", [rings, raw])).toEqual([raw, rings]);
  });

  test("breaks a tie on the name by how many of the nine were measured", () => {
    const sparse = result("Onions, raw", { calories: 40 });
    const full = result("Onions, raw", { calories: 40, protein: 1.1, fat: 0.1 });

    expect(mostLikelyFirst("onion", [sparse, full])).toEqual([full, sparse]);
  });

  test("keeps the source's own order when name and completeness tie", () => {
    const first = result("Onions, raw", { calories: 40 });
    const second = result("Onions, raw", { calories: 42 });

    expect(mostLikelyFirst("onion", [first, second])).toEqual([first, second]);
  });

  /** A search knows no locale, so an Open Food Facts jar is judged on its best-matching title. */
  test("scores a result on whichever of its titles reads most like the food", () => {
    const basil = result("Pesto alla genovese", { calories: 520 });
    const red = { measuredAs: [{ name: "Red pesto", locale: "en" as const }, { name: "Pesto rouge", locale: "fr" as const }], nutrition: { calories: 310 } };

    expect(mostLikelyFirst("pesto rouge", [basil, red])[0]).toBe(red);
  });
});

describe("functions/ingredients/lookup/curatedSpellingsIn", () => {
  /** A keyword search answers with whatever ranked highest; only a hand-filed name is vocabulary. */
  test("returns the spellings of curated hits only, in one language", () => {
    const curated: LookupHit = { source: "foodComposition", names: { en: ["Carrot"], fr: ["Carotte"] } };
    const searched: LookupHit = { source: "openFoodFacts", names: { fr: ["Yaourt brassé carotte"] }, searched: true };

    expect(curatedSpellingsIn([curated, searched], "fr")).toEqual(["Carotte"]);
  });

  test("returns nothing when no curated hit named the food in that language", () => {
    expect(curatedSpellingsIn([{ source: "foodComposition", names: { en: ["Carrot"] } }], "fr")).toEqual([]);
  });
});
