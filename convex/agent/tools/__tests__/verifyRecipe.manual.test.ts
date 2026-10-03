/**
 * A bake-off: which model, at which effort, should check an imported recipe against its page?
 *
 * ⚠️ THIS COSTS MONEY AND MINUTES — it calls OpenRouter for real. Run it by hand:
 *
 *     pnpm test:manual
 *
 * Everything `sanitizeRecipe.manual.test.ts` says about the harness, the key and the output file
 * holds here. What is measured is the real thing: `verificationSchema`, `toRecipeVerification`,
 * `verifyRecipePrompt` and `verifyRecipeUserPrompt` are all imported from the tool, and the page goes
 * through the real `toRecipeDraft`. The one thing faked is the catalog the verifier searches,
 * below — a bake-off has no database to search.
 */
import { tool } from "ai";
import { describe, expect, it } from "vitest";

import { parseInstructions } from "@shared/recipes";
import { AUTHORED_TAGS, type AuthoredTag } from "@shared/tags";

import { CATALOG as SEED_CATALOG } from "../../../functions/ingredients/ingredientCatalog";
import { runBakeOff, type Candidate } from "../../__bench__";
import { type ScrapedRecipe, toRecipeDraft } from "../../../lib/scraping/toRecipeDraft";
import {
  type RecipeVerification,
  toRecipeVerification,
  verificationSchema,
  verifyRecipeUserPrompt,
} from "../verifyRecipe";
import { searchIngredientsInputSchema } from "../searchIngredients";
import { VERIFY_TOOLS, verifyRecipePrompt } from "../../config/prompts/verifyRecipe";

/* ── The field ─────────────────────────────────────────────────────────────────────────── */

/** `models.verifier` ships GPT-6 Luna at `xhigh`; the efforts either side are what it is weighed against. */
const CANDIDATES: Candidate[] = [
  { name: "openai/gpt-6.1-sol", modes: ["low"] }, // ships as models.verifier
  // { name: "openai/gpt-6-luna", modes: ["high"] }, // missed the method-only ingredient, 0/3
  // { name: "openai/gpt-6-luna", modes: ["xhigh", "max"] }, // too slow
  // { name: "z-ai/glm-5.3-flash", modes: ["high", "max"] }, // too slow
  // { name: "deepseek/deepseek-v4.1-flash", modes: ["high", "max"] }, // too slow
];

/* ── The recipe ────────────────────────────────────────────────────────────────────────── */

const LOCALE = "en" as const;

/**
 * Japchae, from https://www.bbcgoodfood.com/recipes/japchae-stir-fried-noodles — a real import, the
 * whole of it on both sides, because a verifier is only as good as what it is shown.
 *
 * `STORED` is the dev row as the first pass wrote it (`m5794h19yw6j15rd8xd2gkjt898f5ax0`, read on
 * 2026-10-03): its English text, its catalog names, its quantities, verbatim. Against the page it
 * holds these faults, and the checks below are keyed to them:
 *
 * | Ingredient   | Page                                   | Stored                                         |
 * | ------------ | -------------------------------------- | ---------------------------------------------- |
 * | sesame oil   | 1 tbsp sauce + ½ tsp spinach = 3.5 tsp | 10.5 tsp: 9 in the sauce, 1½ in the marinade   |
 * | caster sugar | 2 tsp sauce + 2 tsp marinade = 4 tsp   | 2 tsp, "golden", none in the marinade          |
 * | garlic       | 1 + 2 + 1 small cloves = 4             | 3, and the spinach lost its clove              |
 * | black pepper | ½ tsp in the marinade (method only)    | missing; the white pepper moved there          |
 * | sesame seeds | none in the marinade                   | 2 tsp invented in the marinade                 |
 *
 * The vegetable oil is RIGHT — 7 tbsp, 21 tsp across the omelette and five fryings — and must stay.
 */
const STORED_INSTRUCTIONS = `## Beef marinade
- Cut 100 g of frying steak into 5 mm strips. Mix it with 1 tablespoon of soy sauce, 2 finely grated garlic cloves, 1½ teaspoons of sesame oil, 2 teaspoons of sesame seeds and ½ teaspoon of white pepper, then leave it to marinate for 10 minutes.

## Noodles
- Cook 150 g of sweet potato noodles according to the package instructions, then drain and rinse them under cold water.
- While the noodles cook and the beef marinates, mix 4 tablespoons of dark soy sauce, 2 teaspoons of caster sugar, 9 teaspoons of sesame oil, 6 teaspoons of sesame seeds and 1 finely grated garlic clove to make the sauce. Slice ½ carrot into matchsticks, thinly slice 1 red pepper and 100 g of chestnut mushrooms, and cut 3 spring onions into 5 cm lengths.

## Spinach
- Put 200 g of spinach in a heatproof bowl, cover it with boiling water and leave it for 1 minute. Drain, rinse under cold water and squeeze out the excess water.
- Mix the spinach with ¼ teaspoon of salt, ½ teaspoon of sesame oil and 2 teaspoons of sesame seeds, then set it aside.

## Omelette
- Beat 1 egg with ⅛ teaspoon of salt. Heat 5 teaspoons of vegetable oil in a small frying pan over medium heat, pour in the egg and tilt the pan to make a thin layer. Cook for 30 seconds on each side, transfer it to cool, roll it into a tube and slice it into thin strips about 0.5 cm thick.

## Stir-fried ingredients
- Heat 3 teaspoons of vegetable oil in a large frying pan over medium heat. Lift the beef from its marinade with tongs, fry it for 1–2 minutes, then remove it and set it aside. Wipe the pan clean.
- Add 1 teaspoon of vegetable oil to the pan. Add the carrot with ⅛ teaspoon of salt and fry for 2 minutes, until slightly softened. Remove it and wipe the pan clean.
- Add 3 teaspoons of vegetable oil to the pan and fry the pepper for 2–3 minutes, until soft. Remove it and wipe the pan clean.
- Add 3 teaspoons of vegetable oil to the pan and fry the mushrooms for 6–8 minutes, until soft and golden. Remove them and wipe the pan clean.

## Assembly
- Return the pan to medium heat and add 6 teaspoons of vegetable oil. When it is hot, add the noodles and toss for 2 minutes. Add the sauce, beef, carrot, pepper, mushrooms, spinach, omelette strips and spring onions, then toss over high heat for 2 minutes, until everything is well combined and coated. Serve immediately, sprinkled with 1 teaspoon of sesame seeds.`;

/** The row's tags, minus the computed ones (`dairy-free`, `low-carb`…), which `toModelRecipe` drops too. */
const STORED_TAGS = ["main", "comfort-food", "world-flavours", "dairy-free", "nut-free", "low-carb", "high-calorie"]
  .filter((tag): tag is AuthoredTag => (AUTHORED_TAGS as readonly string[]).includes(tag));

const STORED = {
  title: "Japchae (stir fried noodles)",
  description:
    "Sweet potato noodles are tossed with tender steak, mushrooms, spinach and vegetables in a savoury, " +
    "slightly sweet sesame-soy sauce. Make it for a flavourful Korean-inspired weeknight meal.",
  servings: 2,
  difficulty: 3 as const,
  cuisine: "korean" as const,
  tags: STORED_TAGS,
  equipments: [],
  timings: { preparation: 5, cooking: 30 },
  instructions: parseInstructions(STORED_INSTRUCTIONS),
  // The catalog rows' names, as `loadRecipe` returns them — not the lines' own wording.
  ingredients: [
    { name: "sweet potato noodle", quantity: 150, unit: "g" as const },
    { name: "Egg", quantity: 1, unit: "pcs" as const },
    { name: "Vegetable oil", quantity: 21, unit: "tsp" as const },
    { name: "frying steak", quantity: 100, unit: "g" as const },
    { name: "Carrot", quantity: 0.5, unit: "pcs" as const },
    { name: "Red bell pepper", quantity: 1, unit: "pcs" as const },
    { name: "chestnut mushroom", quantity: 100, unit: "g" as const },
    { name: "Spring onion", quantity: 3, unit: "pcs" as const },
    { name: "Sesame seeds", quantity: 9, unit: "tsp" as const },
    { name: "Sesame oil", quantity: 10.5, unit: "tsp" as const },
    { name: "dark soy sauce", quantity: 4, unit: "tbsp" as const },
    { name: "golden caster sugar", quantity: 2, unit: "tsp" as const },
    { name: "Garlic", quantity: 3, unit: "pcs" as const },
    { name: "ground white pepper", quantity: 0.5, unit: "tsp" as const },
    { name: "Soy sauce", quantity: 1, unit: "tbsp" as const },
    { name: "Spinach", quantity: 200, unit: "g" as const },
    { name: "Salt", quantity: 0.5, unit: "tsp" as const },
  ],
};

const _items = (...values: string[]) => values.map((value) => ({ value }));

/**
 * The page as `recipe-scrapers` hands it over, put through the real `toRecipeDraft` — so the
 * verifier sees exactly what production shows it, losses included. One loss matters here:
 * `toRecipeDraft` flattens the ingredient groups, so "For the beef marinade" never reaches the
 * model, and which sugar or garlic line belongs to the marinade cannot be read off the page it is
 * given. The checks below are therefore on TOTALS, which the flat list does carry.
 */
const SCRAPED: ScrapedRecipe = {
  title: "Japchae (stir fried noodles)",
  description:
    "Create a Korean classic, with sweet potato noodles mixed with tender steak strips, chestnut mushrooms " +
    "and spinach in a savoury and slightly sweet sauce",
  yields: "Serves 2 as a main – 4 as a side",
  ingredients: [
    {
      name: null,
      items: _items(
        "150g dangmyun (sweet potato noodles)",
        "1 egg",
        "7tbsp vegetable oil for frying",
        "100g frying steak cut into 5mm strips",
        "½ carrot sliced into matchsticks",
        "1 red pepper thinly sliced",
        "100g chestnut mushrooms thinly sliced",
        "3 spring onions cut into 5cm lengths",
        "sesame seeds to garnish",
      ),
    },
    {
      name: "For the japchae sauce",
      items: _items(
        "1 tbsp sesame oil",
        "4 tbsp dark soy sauce",
        "2 tsp caster sugar",
        "2 tbsp toasted sesame seeds (with some extra for garnish)",
        "1 small garlic clove finely grated",
        "½ tsp finely ground white pepper",
      ),
    },
    {
      name: "For the beef marinade",
      items: _items("1 tbsp soy sauce", "2 small garlic cloves finely grated", "2 tsp caster sugar"),
    },
    {
      name: "For the spinach",
      items: _items(
        "200g spinach",
        "¼ tsp salt",
        "1 small garlic clove finely grated",
        "½ tsp sesame oil",
        "2 tsp toasted sesame seeds",
      ),
    },
  ],
  instructions: [
    {
      name: null,
      items: _items(
        "Cook the noodles following pack instructions, then drain and rinse under cold water. Mix the ingredients for the japchae sauce together and set aside.",
        "Mix the ingredients for the beef marinade together along with ½ tsp ground black pepper. Tip the beef into the marinade and ensure everything is thoroughly mixed. Set aside for 10 mins to marinate.",
        "Place the spinach in a large heatproof bowl and cover with boiling water. Wilt for 1 min. Drain the spinach and rinse under cold water. Squeeze out any excess water. Place the drained spinach in a bowl along with the remaining spinach ingredients and ¼ tsp salt and mix. Set to one side.",
        "Crack the egg into a small bowl and stir with a fork. Place a small frying pan over a medium heat and heat the vegetable oil. Pour in the egg with a pinch of salt and move the pan around to coat it with a thin layer of the egg. Fry for 30 seconds, then flip and cook on the second side for 30 seconds to create a very thin omelette. Remove from the pan to cool, then roll into a tube shape to make it easier to slice. Slice the egg into thin strips, around 0.5cm thick. Set aside.",
        "In a large frying pan, heat 1 tbsp vegetable oil over a medium heat. Using a pair of tongs, place the beef in the frying pan and fry for 1-2 mins. Remove the beef and set aside. Wipe the pan clean using kitchen paper and add 1 tsp more oil. Tip in the carrots with a pinch of salt and fry for 2 mins until slightly softened. Remove from the pan, wipe with a paper towel and add another tablespoon of oil. Fry the peppers for 2-3 mins until soft, remove from the pan, wipe clean and add another tablespoon of oil before frying the mushrooms for 6-8 mins until soft and golden.",
        "Wipe out the pan and keep it on medium heat. Pour in 2 tbsp vegetable oil and when hot tip in the noodles to the pan and toss with a pair of tongs for 2 mins to heat through. Once the noodles are heated through, pour in the japchae sauce and all the other prepared ingredients, including the spring onions. Toss the ingredients together over a high heat for a further 2 mins, making sure everything is well combined and coated with the sauce. Serve immediately with some sesame seeds sprinkled over.",
      ),
    },
  ],
};

const SOURCE = toRecipeDraft(SCRAPED);

/* ── The catalog it searches ───────────────────────────────────────────────────────────── */

/**
 * The dev catalog's English names for the foods in this recipe and their neighbours, as read on
 * 2026-10-03 — real rows, so the search answers what production's would. A row seeded from
 * `ingredientCatalog.ts` is also found under its English aliases, as the real search finds it:
 * "caster sugar" reaches "White sugar". The rows the import learned since carry none.
 */
const CATALOG = [
  "Beef broth", "Beef roast", "Black pepper", "Brown sugar", "Carrot", "Cayenne pepper", "Egg", "Egg noodles",
  "Egg white", "Egg yolk", "Flank steak", "Garlic", "Green bell pepper", "Ground beef (80/20)", "Mushroom",
  "Onion", "Palm sugar", "Powdered sugar", "Red bell pepper", "Red onion", "Rice noodles", "Salt",
  "Sesame oil", "Sesame seeds", "Soy sauce", "Spinach", "Spring onion", "Vegetable oil", "White sugar",
  "Yellow bell pepper", "beef steak", "beef stir-fry strips", "chestnut mushroom", "dark soy sauce",
  "frying steak", "garlic granules", "golden caster sugar", "ground white pepper", "light soy sauce",
  "low-salt soy sauce", "sea salt flakes", "sweet potato noodle", "wheat noodles", "white sesame paste",
];

/** Each fixture row's searchable names: its own, then the seed catalog's English aliases for it. */
const _NAMES = CATALOG.map((name) => ({
  name,
  terms: [name, ...(SEED_CATALOG.find(({ en }) => en.toLowerCase() === name.toLowerCase())?.aliases.en ?? [])]
    .map((term) => term.toLowerCase()),
}));

/**
 * Rows sharing a word with the query, most shared words first — near enough to a full-text index.
 * A query that IS a row's name or alias ranks that row first, as the real search's exact match does.
 */
const _search = (query: string) => {
  const wanted = query.toLowerCase().trim();
  const words = wanted.split(/\s+/).filter(Boolean);
  const scoreOf = (term: string) => (term === wanted ? 100 : words.filter((word) => term.split(" ").includes(word)).length);

  return _NAMES
    .map(({ name, terms }) => ({ name, score: Math.max(...terms.map(scoreOf)) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ name }) => ({ name }));
};

/** The real tool's name and input schema, over the fixture catalog. */
const TOOLS = {
  [VERIFY_TOOLS.searchIngredients]: tool({
    description: "Looks up ingredients in this app's catalog, several names at once, best match first.",
    inputSchema: searchIngredientsInputSchema,
    execute: async ({ queries }) => queries.map((query) => ({ query, ingredients: _search(query) })),
  }),
};

/* ── How to rank them ──────────────────────────────────────────────────────────────────── */

const CRITERIA = [
  "Did it fix every fault the page proves? Sesame oil is 3.5 tsp in all (1 tbsp, ½ tsp), not 10.5. " +
  "Caster sugar is 4 tsp (2 + 2), not 2. Garlic is 4 small cloves, and the spinach gets its clove. " +
  "The ½ tsp of black pepper the method adds to the marinade is listed. The vegetable oil, stored " +
  "before fatUse existed, is now tagged \"fried\" — every frying ends with the pan wiped — and the " +
  "sesame oil, which goes into the sauce, is not tagged. Each one missed is a fault.",
  "Did it break nothing that was right? The vegetable oil is 7 tbsp, spread over the omelette and " +
  "five fryings, each pan wiped between them; dark soy sauce and soy sauce are two different bottles " +
  "and stay two lines; the noodles, steak and vegetables are correct as stored.",
  "Where the flat page cannot say which group a line belongs to (the sugar and garlic of the " +
  "marinade versus the sauce), did it place them plausibly from the method, without inventing an " +
  "ingredient the page does not list? The stored marinade's sesame seeds and sesame oil are such " +
  "inventions, and removing them is right.",
  "Is every ingredient named the way the catalog knows it? \"caster sugar\" and \"white sugar\" are " +
  "both right — the catalog finds White sugar under either — while \"golden caster sugar\" is an " +
  "unrefined other product the page does not name.",
  "Every other change is allowed — timings (the page says 20 minutes prep, 20 cook), wording, tags " +
  "— but each must answer a fault it names in corrections. A change with no correction behind it is " +
  "a fault itself.",
  "Do the steps agree with the new list — every amount named where the ingredient enters, and one " +
  "ingredient's amounts across steps adding up to its line?",
  "Is each correction one short, accurate sentence a reader can act on, one per fix?",
];

/** The exact rules, settled in code — see `sanitizeRecipe.manual.test.ts` for why only exact ones. */
const _ML: Partial<Record<string, number>> = { ml: 1, cl: 10, l: 1000, tsp: 5, tbsp: 15 };

type _Recipe = NonNullable<RecipeVerification["recipe"]>;

/** Total millilitres across every line whose name matches, or undefined when one is not a volume. */
const _mlOf = (recipe: _Recipe, match: (name: string) => boolean): number | undefined => {
  const matching = recipe.ingredients.filter(({ name }) => match(name.toLowerCase()));
  if (!matching.length || matching.some(({ unit }) => _ML[unit] === undefined)) return undefined;

  return matching.reduce((sum, { quantity, unit }) => sum + quantity * _ML[unit]!, 0);
};

const _near = (actual: number | undefined, expected: number) => actual !== undefined && Math.abs(actual - expected) < 1;

/** A volume as the flag reads it — "missing" rather than "undefined ml" when no line measures it. */
const _volume = (ml: number | undefined) => (ml === undefined ? "missing or not a volume" : `${ml} ml`);

/** A correction that says nothing was corrected — "Nothing was wrong; the recipe matches the page". */
const _SAYS_NOTHING = /\b(nothing|no (fault|change|correction)s?)\b.*\b(wrong|needed|found|matches)\b/i;

const CHECKS = ({ corrections, recipe }: RecipeVerification) => {
  if (!recipe) return ["returned no recipe — every fault left standing"];

  const names = recipe.ingredients.map(({ name }) => name.toLowerCase());
  const garlic = recipe.ingredients.find(({ name }) => name.toLowerCase() === "garlic");
  const sesameOil = _mlOf(recipe, (name) => name.includes("sesame oil"));
  const sugar = _mlOf(recipe, (name) => name.includes("sugar"));
  const vegetableOil = _mlOf(recipe, (name) => name.includes("vegetable oil"));
  const vegetableOilLine = recipe.ingredients.find(({ name }) => name.toLowerCase().includes("vegetable oil"));
  const vegetableOilUnit = vegetableOilLine?.unit;
  const sesameOilLine = recipe.ingredients.find(({ name }) => name.toLowerCase().includes("sesame oil"));
  const darkSoy = _mlOf(recipe, (name) => name.includes("dark soy"));
  const soy = _mlOf(recipe, (name) => name.includes("soy sauce") && !name.includes("dark"));

  return [
    ...(_near(sesameOil, 17.5) ? [] : [`sesame oil is ${_volume(sesameOil)}, the page has 17.5 ml (3.5 tsp)`]),
    ...(_near(sugar, 20) ? [] : [`sugar is ${_volume(sugar)}, the page has 20 ml (4 tsp)`]),
    ...(garlic?.quantity === 4 && garlic.unit === "pcs"
      ? []
      : [`garlic is ${garlic ? `${garlic.quantity} ${garlic.unit}` : "missing"}, the page has 4 cloves`]),
    ...(names.some((name) => name.includes("black pepper")) ? [] : ["the marinade's black pepper is not listed"]),
    // Right as stored, and facts of the page: a verifier may reword anything, never these.
    // The white pepper is the sauce's, on the page's list; the black pepper is added beside it,
    // never in its place.
    ...(names.some((name) => name.includes("white pepper")) ? [] : ["the sauce's white pepper is no longer listed"]),
    ...(_near(vegetableOil, 105) ? [] : [`vegetable oil is ${_volume(vegetableOil)}, the page has 105 ml (7 tbsp)`]),
    // Stored as 21 tsp, which IS the page's 7 tbsp: a unit swap fixes nothing, and pushes fractions
    // of a tablespoon into the frying steps.
    ...(vegetableOilUnit === "tsp" ? [] : [`vegetable oil rewritten to ${vegetableOilUnit}, though 21 tsp was already the page's 7 tbsp`]),
    // Stored before fatUse existed. Every frying in this method ends with the pan wiped, so most of
    // the oil never reaches the plate: "fried". The sesame oil goes into the sauce and is eaten.
    ...(vegetableOilLine?.fatUse === "fried"
      ? []
      : [`vegetable oil's fatUse is ${vegetableOilLine?.fatUse ?? "missing"}, the pan is wiped after each frying: "fried"`]),
    ...(sesameOilLine?.fatUse ? [`sesame oil tagged "${sesameOilLine.fatUse}", though it goes into the sauce`] : []),
    // The noodles' and the spinach's water is poured away, not eaten.
    ...(names.some((name) => /\bwater\b/.test(name)) ? ["the cooking water is listed as an ingredient"] : []),
    ...(_near(darkSoy, 60) && _near(soy, 15)
      ? []
      : ["dark soy sauce (4 tbsp) and soy sauce (1 tbsp) are no longer two right lines"]),
    ...(recipe.servings === 2 ? [] : [`serves ${recipe.servings}, the page says 2 as a main`]),
    ...(corrections.length > 0 ? [] : ["a rewrite with no corrections listed"]),
    ...corrections
      .filter((correction) => _SAYS_NOTHING.test(correction))
      .map((correction) => `a rewrite whose correction says nothing was wrong: "${correction}"`),
  ];
};

/* ── The run ───────────────────────────────────────────────────────────────────────────── */

describe("verifyRecipe — model bake-off", () => {
  it("ranks the field", async () => {
    const result = await runBakeOff({
      title: "verifyRecipe",
      candidates: CANDIDATES,
      system: verifyRecipePrompt(LOCALE),
      prompt: verifyRecipeUserPrompt({ stored: STORED, source: SOURCE }),
      answer: { schema: verificationSchema, parse: toRecipeVerification, check: CHECKS },
      tools: TOOLS,
      provider: { sort: "price" },
      criteria: CRITERIA,
      runs: 3,
    });

    // Guards the benchmark, not the models: an empty table is a broken key or a dead slug.
    expect(result.ok).toBeGreaterThan(0);
  });
});
