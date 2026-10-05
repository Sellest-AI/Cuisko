import { afterEach, describe, expect, test, vi } from "vitest";

import { searchFoodDataCentral } from "../foodDataCentral";
import { spellingsOfHit } from "../lookupHit";
import { searchOpenFoodFacts } from "../openFoodFacts";

/**
 * The two network lookups, against payloads shaped like the real ones.
 *
 * Stubbed rather than live, deliberately: this suite runs on every commit, and a test that asks
 * somebody else's server a question fails when that server is down — which says nothing about this
 * code. What is worth pinning here is the parsing, and the parsing is where the two mistakes that
 * would never look wrong on screen live: Open Food Facts publishes sodium in GRAMS where the
 * schema stores milligrams, and USDA publishes energy in KJ on some foods and KCAL on others.
 */
const respondWith = (body: unknown, ok = true) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)),
  );

const OFF_NUTRIMENTS = {
  "energy-kcal_100g": 72,
  proteins_100g: 2.9,
  fat_100g: 1,
  "saturated-fat_100g": 0.5,
  carbohydrates_100g: 11,
  sugars_100g: 6.9,
  fiber_100g: 2.5,
  sodium_100g: 0.68,
};

const fdcFood = (description: string, nutrients: [number, number, string][]) => ({
  description,
  foodNutrients: nutrients.map(([nutrientId, value, unitName]) => ({ nutrientId, value, unitName })),
});

const FDC_CARROT: [number, number, string][] = [
  [1008, 41, "KCAL"],
  [1003, 0.93, "G"],
  [1004, 0.24, "G"],
  [1258, 0.03, "G"],
  [1005, 9.58, "G"],
  [2000, 4.7, "G"],
  [1079, 2.8, "G"],
  [1093, 69, "MG"],
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("functions/ingredients/lookup/openFoodFacts", () => {
  test("reads a product's names and its declared per-100g figures", async () => {
    respondWith({
      products: [
        { product_name: "Harissa du Cap-Bon", product_name_fr: "Harissa", nutriments: OFF_NUTRIMENTS },
      ],
    });

    const hit = await searchOpenFoodFacts("harissa");

    expect(hit?.source).toBe("openFoodFacts");
    expect(hit?.names.fr).toContain("Harissa");
    expect(hit?.nutrition?.calories).toBe(72);
  });

  /**
   * The one conversion in this folder, and the one that would never look wrong: 0.68 g of sodium
   * silently stored as 0.68 mg understates it a thousandfold, and every screen would draw a
   * plausible number.
   */
  test("converts sodium from grams to milligrams", async () => {
    respondWith({ products: [{ product_name: "Harissa", nutriments: OFF_NUTRIMENTS }] });

    expect((await searchOpenFoodFacts("harissa"))?.nutrition?.sodium).toBe(680);
  });

  /**
   * A partial table is kept rather than discarded, and the absent fields stay ABSENT. That second
   * half is the load-bearing one: a source that did not publish fiber has not said fiber is zero,
   * and the Nutri-Score reads all eight together, so a filled-in zero moves the grade a shopper
   * sees. The agent fills the holes later, and `measuredOver` puts these two back on top of it.
   */
  test("a product declaring only some fields keeps those and invents none", async () => {
    respondWith({
      products: [
        { product_name_fr: "Harissa", nutriments: { "energy-kcal_100g": 72, proteins_100g: 2.9 } },
      ],
    });

    const hit = await searchOpenFoodFacts("harissa");

    expect(hit?.names).toEqual({ fr: ["Harissa"] });
    expect(hit?.nutrition).toEqual({ calories: 72, protein: 2.9 });
  });

  /**
   * The split that lets a row be built from this at all. `product_name_fr` is a language Open Food
   * Facts stated; `product_name` is whatever the contributor had in hand. Storing the second as a
   * locale's name would be guessing the one fact that must not be guessed — a name filed under the
   * wrong language is a row that language's shopper never finds — so it stays searchable and
   * unstorable.
   */
  test("a name whose language the source stated is kept apart from one it did not", async () => {
    respondWith({
      products: [
        {
          product_name: "Harissa du Cap-Bon",
          product_name_fr: "Harissa",
          nutriments: OFF_NUTRIMENTS,
        },
      ],
    });

    const hit = await searchOpenFoodFacts("harissa");

    expect(hit?.names).toEqual({ fr: ["Harissa"] });
    expect(hit?.untagged).toEqual(["Harissa du Cap-Bon"]);
    expect(spellingsOfHit(hit!)).toEqual(["Harissa", "Harissa du Cap-Bon"]);
  });

  test("the product that declared the MOST of the eight wins, and its name leads", async () => {
    respondWith({
      products: [
        { product_name_fr: "Sauce piquante", nutriments: { "energy-kcal_100g": 72 } },
        { product_name_fr: "Harissa", nutriments: OFF_NUTRIMENTS },
      ],
    });

    const hit = await searchOpenFoodFacts("harissa");

    expect(hit?.names.fr?.[0]).toBe("Harissa");
    expect(hit?.nutrition).toBeDefined();
  });

  /**
   * Completeness used to pick alone, so a jar of basil pesto declaring all eight beat the red pesto
   * jar declaring five. The name decides first; completeness breaks a tie.
   */
  test("the product named like the search beats a more complete one, and every product is a candidate", async () => {
    respondWith({
      products: [
        { product_name_fr: "Pesto alla genovese", nutriments: OFF_NUTRIMENTS },
        { product_name_fr: "Pesto rouge", nutriments: { "energy-kcal_100g": 310, fat_100g: 29 } },
      ],
    });

    const hit = await searchOpenFoodFacts("pesto rouge");

    expect(hit?.measuredAs).toEqual([{ name: "Pesto rouge", locale: "fr" }]);
    expect(hit?.nutrition?.calories).toBe(310);
    expect(hit?.candidates?.map(({ measuredAs }) => measuredAs[0]?.name)).toEqual([
      "Pesto rouge",
      "Pesto alla genovese",
    ]);
  });

  /**
   * Titles are read as `names` are, trimmed and never blank: Jev's pick is found in `names` by its
   * title, and a blank one would be offered to Jev as an option that says nothing.
   */
  test("a product's titles are trimmed, and a blank one is no title", async () => {
    respondWith({
      products: [
        { product_name_fr: "Pesto rouge ", product_name: "  ", nutriments: OFF_NUTRIMENTS },
        { product_name_fr: "  ", nutriments: OFF_NUTRIMENTS },
      ],
    });

    const hit = await searchOpenFoodFacts("pesto rouge");

    expect(hit?.measuredAs).toEqual([{ name: "Pesto rouge", locale: "fr" }]);
    expect(hit?.candidates).toHaveLength(1);
  });

  test.each([
    ["a network failure", () => vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))))],
    ["an error status", () => respondWith({}, false)],
    ["a payload with no products", () => respondWith({ products: [] })],
    ["a payload that is not what we expected", () => respondWith({ unexpected: true })],
  ])("returns nothing on %s rather than throwing", async (_case, arrange) => {
    arrange();

    await expect(searchOpenFoodFacts("harissa")).resolves.toBeUndefined();
  });
});

describe("functions/ingredients/lookup/foodDataCentral", () => {
  test("reads a food's description and its measured per-100g figures", async () => {
    respondWith({ foods: [fdcFood("Carrots, raw", FDC_CARROT)] });

    const hit = await searchFoodDataCentral("carrot");

    expect(hit?.source).toBe("foodComposition");
    expect(hit?.names).toEqual({ en: ["Carrots, raw"] });
    expect(hit?.nutrition).toEqual({
      calories: 41,
      protein: 0.93,
      fat: 0.24,
      saturatedFat: 0.03,
      carbohydrates: 9.58,
      sugars: 4.7,
      fiber: 2.8,
      sodium: 69,
    });
  });

  /**
   * USDA publishes energy in KJ on some foods. Accepting a kilojoule figure as kilocalories
   * overstates it 4.2× and lands straight on a Nutri-Score, so the unit is checked rather than
   * assumed — and a food whose energy is in the wrong unit is incomplete, not wrong.
   */
  test("drops energy published in the wrong unit rather than misreading it", async () => {
    const inKilojoules = FDC_CARROT.map(
      ([id, value, unit]) => [id, id === 1008 ? 173 : value, id === 1008 ? "kJ" : unit] as [number, number, string],
    );
    respondWith({ foods: [fdcFood("Carrots, raw", inKilojoules)] });

    const hit = await searchFoodDataCentral("carrot");

    expect(hit?.names).toEqual({ en: ["Carrots, raw"] });
    // The seven fields in the right unit survive; the one in kilojoules is absent rather than
    // wrong, which is the difference between a gap the agent fills and a grade that is 4.2x off.
    expect(hit?.nutrition?.calories).toBeUndefined();
    expect(hit?.nutrition?.protein).toBe(0.93);
  });

  test("a food measured on four nutrients contributes those four", async () => {
    respondWith({ foods: [fdcFood("Carrots, raw", FDC_CARROT.slice(0, 4))] });

    const hit = await searchFoodDataCentral("carrot");

    expect(hit?.names).toEqual({ en: ["Carrots, raw"] });
    expect(hit?.nutrition).toEqual({ calories: 41, protein: 0.93, fat: 0.24, saturatedFat: 0.03 });
  });

  /** Onion rings measured on eight fields used to beat raw onions measured on four. */
  test("the food named like the search beats a more complete one, and every food is a candidate", async () => {
    respondWith({
      foods: [
        fdcFood("Onion rings, breaded, par fried, frozen", FDC_CARROT),
        fdcFood("Onions, raw", FDC_CARROT.slice(0, 4)),
      ],
    });

    const hit = await searchFoodDataCentral("onion");

    expect(hit?.measuredAs).toEqual([{ name: "Onions, raw", locale: "en" }]);
    expect(hit?.names.en?.[0]).toBe("Onions, raw");
    expect(hit?.candidates?.map(({ measuredAs }) => measuredAs[0]?.name)).toEqual([
      "Onions, raw",
      "Onion rings, breaded, par fried, frozen",
    ]);
  });

  test.each([
    ["a network failure", () => vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))))],
    ["an error status", () => respondWith({}, false)],
    ["no results", () => respondWith({ foods: [] })],
  ])("returns nothing on %s rather than throwing", async (_case, arrange) => {
    arrange();

    await expect(searchFoodDataCentral("carrot")).resolves.toBeUndefined();
  });

  test("sends the key from the validated environment, never an empty one", async () => {
    respondWith({ foods: [] });

    await searchFoodDataCentral("carrot");

    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain("api_key=test-fdc-api-key");
  });
});
