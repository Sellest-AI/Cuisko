import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import { CONFIDENT, MARGIN } from "@shared/ingredientMatch";

import schema from "../../../schema";
import { searchWidened } from "../searchWidened";
import { seedIngredients } from "../seedIngredients";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * The real catalog, seeded once for the whole file.
 *
 * Against fixtures this test proves nothing: the numbers `CONFIDENT` is set from are numbers about
 * *this* catalog — how close its few hundred rows sit to each other, and how loud the noise floor is
 * for an ingredient it does not hold. Hand-written candidates would drift from it silently, which
 * is the one failure this file exists to catch. `searchWidened.test.ts` deliberately does the
 * opposite with two rows by hand, so a failure there points at the search rather than at the seed;
 * the two files are not duplicates, they are the two halves of that trade.
 *
 * It replaces the calibration block that lived in `matchIngredients.test.ts` until that function
 * was deleted. The block never tested `matchIngredients` — it tested the THRESHOLD, using it as
 * the way in. The threshold outlived it as `LINKABLE` in `resolveIngredient` step 1, so the same
 * assertions now go through `searchWidened`, which is what that step reads.
 */
let t: ReturnType<typeof convexTest>;
let slugOf: Map<string, string>;

beforeAll(async () => {
  t = convexTest(schema, modules);
  await t.run(seedIngredients);

  // `t.run` returns through Convex's serializer, which has no Map — the pairs cross as an array.
  const pairs = await t.run(async (ctx) => {
    const rows = await ctx.db.query("ingredients").collect();

    return rows.map((row) => [row._id as string, row.slug!] as const);
  });

  slugOf = new Map(pairs);
});

/**
 * `resolveIngredient`'s step 1 decision, restated over `searchWidened`'s answer.
 *
 * Restated rather than called, because `_fromCatalog` is private to `resolveIngredient` and calling
 * the exported walk would reach the datasets, the live APIs and the model — none of which may run
 * in a test, and all of which would hide which step actually answered. The predicate is two lines
 * and it is the whole subject of this file: at or above `CONFIDENT`, and clear of the runner-up by
 * `MARGIN`.
 *
 * ⚠️ If `_fromCatalog` ever stops agreeing with these two lines, this file measures a bar the app
 *    no longer applies, and every case below keeps passing while saying nothing.
 */
const linked = async (name: string, locale: "fr" | "en" = "fr") => {
  const candidates = await t.run((ctx) => searchWidened(ctx, { text: name, locale }));

  const best = candidates[0];
  const runnerUp = candidates[1]?.score ?? 0;
  if (!best || best.score < CONFIDENT || best.score - runnerUp < MARGIN) return "unmatched";

  return slugOf.get(best.ingredientId)!;
};

describe("functions/ingredients: the bar a name is linked at", () => {
  /**
   * The fixture `CONFIDENT` is tuned from. Each line is what a cook actually writes — a quantity
   * glued to the name, a preparation qualifier, a synonym the catalog records — and each has one
   * right answer. A threshold change that breaks any of these breaks recipe entry.
   */
  test.each([
    ["200g de pâtes", "pasta-dry"],
    ["pâtes", "pasta-dry"],
    ["patates", "potato"],
    ["3 oignons, émincés", "onion"],
    ["2 gousses d'ail", "garlic"],
    ["beurre doux, ramolli", "butter-unsalted"],
    ["farine", "flour-all-purpose"],
    ["sucre en poudre", "white-sugar"],
    ["oeufs", "egg-whole"],
    ["crème liquide", "heavy-cream"],
    ["huile d'olive", "olive-oil"],
    // A grade, not another food: a cupboard holding either covers a recipe asking for the other.
    // CIQUAL files it apart, so step 1 declined and the import invented a second olive oil row.
    ["huile d'olive vierge extra", "olive-oil"],
    ["huile d'olive extra-vierge", "olive-oil"],
    ["huile d'olive vierge", "olive-oil"],
    ["tomates concassées", "canned-tomatoes"],
    ["viande hachée", "ground-beef-80-20"],
    // A whole bird had no row, so step 1 declined and the ranker linked "Poulet piri piri" to
    // `chicken-breast` — the nearest thing it was offered. Wrong name, and a 400 g default where
    // the cook needed a 1.4 kg bird.
    ["poulet entier", "chicken-whole"],
    ["canard entier", "duck-whole"],
    ["fromage râpé", "emmental"],
    ["poivre noir", "black-pepper"],
    ["riz basmati", "basmati-rice"],
    ["yaourt nature", "plain-yogurt"],
    // Black olives had no row, and "olives noires" came back as `olive-oil` through its "huile" alias.
    ["olives noires", "olives-black"],
    ["olives vertes", "olives-green"],
    // The three tomato products sit a word apart, and every one of these fell under the bar and
    // was handed to the ranker, which linked passata and a double concentré to the tin of
    // chopped tomatoes.
    ["passata", "passata"],
    ["purée de tomates", "passata"],
    ["concentré de tomates", "tomato-paste"],
    ["double concentré de tomates", "tomato-paste"],
    ["1 tube de concentré de tomate", "tomato-paste"],
    ["pulpe de tomates", "canned-tomatoes"],
    ["tomates en conserve", "canned-tomatoes"],
    ["sauce tomate", "tomato-sauce"],
    ["sauce tomate cuisinée", "tomato-sauce"],
    ["tomato sauce", "tomato-sauce"],
    ["sauce soja", "soy-sauce"],
    // Common recipe spellings that declined step 1, one per row that gained an alias.
    ["noix de muscade", "nutmeg"],
    ["cassonade", "brown-sugar"],
    ["sucre semoule", "white-sugar"],
    ["semoule", "couscous"],
    ["fécule de maïs", "cornstarch"],
    ["miel liquide", "honey"],
    ["poivre du moulin", "black-pepper"],
    ["paprika doux", "paprika"],
    ["fleur de sel", "salt"],
    ["gros sel", "salt"],
    ["sel fin", "salt"],
    ["moutarde de dijon", "mustard-yellow"],
    ["bouillon de volaille", "chicken-broth"],
    ["citron jaune", "lemon"],
    ["persil plat", "parsley"],
    ["crème liquide entière", "heavy-cream"],
    // Plain "lait" is the carton France buys most, not whichever milk the index returned first.
    ["lait", "milk-semi-skimmed"],
    ["lait UHT", "milk-semi-skimmed"],
    ["lait entier", "milk-whole"],
    // Sold only as a powder or ground, so the bare word names the one row the catalog holds.
    ["cacao", "cocoa-powder"],
    ["café", "coffee-ground"],
    ["origan", "oregano-fresh"],
    ["gros sel", "salt"],
    // A spice is sold ground, so its row is the powder and the form word lands on it by alias.
    ["cannelle en poudre", "cinnamon"],
    ["cumin moulu", "cumin"],
    ["curcuma en poudre", "turmeric"],
    ["paprika en poudre", "paprika"],
    ["paprika fumé en poudre", "paprika-smoked"],
    ["muscade moulue", "nutmeg"],
    ["poivre noir moulu", "black-pepper"],
    // Every spice, not only the ones given aliases by hand: the row is the ground form by default.
    ["safran en poudre", "saffron"],
    // Dried by nature, so the redundant form word still lands on it.
    ["pruneaux séchés", "prunes-dried"],
    // A staple sold dry: the row is the dry product, so the form lands on it.
    ["lentilles corail sèches", "lentils-red"],
    // A powder of a food sold fresh is its own jar, never the bulb.
    ["ail en poudre", "garlic-powder"],
    ["granulés d'ail", "garlic-powder"],
    ["oignon en poudre", "onion-powder"],
    ["ail", "garlic"],
    // A bare herb is fresh; the dried one says so.
    ["thym séché", "dried-thyme"],
    ["persil séché", "dried-parsley"],
    ["thym", "thyme"],
    // Thick cream is the fermented one; whole cream is the liquid one at 30% fat or more.
    ["crème fraîche épaisse", "creme-fraiche"],
    ["crème entière", "heavy-cream"],
    // Smoked belly is the cut lard fumé is cut from: one product under two names.
    ["poitrine fumée", "bacon"],
    // A leaf or a clove is a word of the name, so the rows it measures carry it as an alias.
    ["feuilles de basilic", "basil"],
    ["feuilles de menthe", "mint"],
    ["feuilles de gélatine", "gelatin"],
    // A curry leaf is not curry powder: it lands on its own row, never on the shared word.
    ["feuille de curry", "curry-leaves"],
    ["feuilles de curry", "curry-leaves"],
    // The rows that share a bare word, named in full (see the unlinked cases below).
    ["piment rouge", "chili-red"],
    ["piment vert", "chili-green"],
    ["sucrine", "little-gem"],
    ["crème fraîche épaisse légère", "creme-fraiche-light"],
    // Mincing is a preparation for a vegetable, a product only for meat.
    ["ail haché", "garlic"],
  ])("%s links to %s", async (name, slug) => {
    expect(await linked(name)).toBe(slug);
  });

  test.each([
    ["chopped onions", "onion"],
    ["unsalted butter, softened", "butter-unsalted"],
    ["all-purpose flour, sifted", "flour-all-purpose"],
    ["fresh tomatoes", "tomato"],
    ["chicken breast", "chicken-breast"],
    ["dark chocolate", "dark-chocolate"],
    // The same row as French "lait", so a recipe's "milk" and a shopper's "lait" are one grocery line.
    ["milk", "milk-semi-skimmed"],
    ["whole milk", "milk-whole"],
    ["soy milk", "soy-milk"],
    ["extra virgin olive oil", "olive-oil"],
    ["extra-virgin olive oil", "olive-oil"],
    // "clove" measures garlic and names a spice; only the word garlic tells the two apart.
    ["2 garlic cloves", "garlic"],
    ["3 cloves of garlic", "garlic"],
    ["ground cloves", "cloves"],
    ["cocoa", "cocoa-powder"],
    ["coffee", "coffee-ground"],
    ["curry", "curry-powder"],
    ["smoked paprika powder", "paprika-smoked"],
    ["cardamom powder", "cardamom"],
    ["ground cinnamon", "cinnamon"],
    ["garlic powder", "garlic-powder"],
    ["onion powder", "onion-powder"],
    ["dried thyme", "dried-thyme"],
    ["dried rosemary", "dried-rosemary"],
    ["basil leaves", "basil"],
    ["minced garlic", "garlic"],
  ])("%s links to %s in English", async (name, slug) => {
    expect(await linked(name, "en")).toBe(slug);
  });

  /**
   * The other half of the threshold, and the more expensive half to get wrong: an ingredient the
   * catalog does not hold must link to nothing rather than to its nearest-spelled row. A wrong link
   * corrupts the recipe's nutrition total and its grocery line, and reports no error anywhere.
   *
   * These four now reach `resolveIngredient`'s later steps instead of being dropped, which is the
   * point of the resolve slice — but they must still not be LINKED here, at step 1, with nobody
   * asked.
   */
  // The chickpea row is the tinned one, so dry chickpeas, three times as dense, are not it.
  /**
   * A bare word several rows share names none of them. "Un piment" is red, green, a bird's eye or a
   * scotch bonnet; "une laitue" a romaine or a sucrine; "crème légère" the thick pot or the liquid
   * carton. Each weighs and shops differently, so the name goes on to the steps that can ask,
   * rather than being linked to whichever row the index returned first.
   */
  test.each(["piment", "piments", "1 piment", "laitue", "crème légère", "crème fraîche légère"])(
    "%s, a word several rows share, is not linked",
    async (name) => {
      expect(await linked(name)).toBe("unmatched");
    },
  );

  // A cardamom pod is not the ground spice.
  test.each(["sumac", "kombu", "quatre-quarts breton", "pois chiches secs", "gousse de cardamome"])(
    "%s is not linked to its nearest row",
    async (name) => {
      expect(await linked(name)).toBe("unmatched");
    },
  );

  /**
   * `Blanc de poulet` and `Blanc de poulet en tranches` reduce to the same two words once the
   * portion word is stripped, so both score at or above the bar — raw chicken and deli slices, told
   * apart by whichever the search index returned first. `MARGIN` is what stops that coin flip being
   * linked with nobody asked; the name goes on to the steps that can weigh it instead.
   */
  test("a tie at the top is not linked, and both rows are still returned as evidence", async () => {
    const candidates = await t.run((ctx) =>
      searchWidened(ctx, { text: "blanc de poulet", locale: "fr" }),
    );

    expect(await linked("blanc de poulet")).toBe("unmatched");
    expect(candidates[0]!.score).toBeGreaterThanOrEqual(CONFIDENT);
    expect(candidates.map(({ ingredientId }) => slugOf.get(ingredientId))).toEqual(
      expect.arrayContaining(["chicken-breast", "chicken-slices"]),
    );
  });

  test("an empty catalog returns no candidates at all", async () => {
    const empty = convexTest(schema, modules);
    const candidates = await empty.run((ctx) =>
      searchWidened(ctx, { text: "pâtes", locale: "fr" }),
    );

    expect(candidates).toEqual([]);
  });
});
