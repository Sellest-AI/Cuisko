import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";

import schema from "../../../schema";
import type { RecipeLink } from "../resolveRecipeIngredients";
import { saveRecipe } from "../saveRecipe";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;
let userId: string;
/** The two fixture rows, by the name a recipe line would spell them — see `linksOf`. */
let catalog: Record<string, Id<"ingredients">>;

/**
 * Two catalog rows and nothing else.
 *
 * Resolving a name is tested where it happens — `resolveRecipeIngredients.test.ts`, and the walk's
 * own tests under `functions/ingredients/__tests__`. What this file asserts is what `saveRecipe`
 * does with a link and with a line that has none, so the rows exist only to be pointed at.
 *
 * `search` is set because that is the field the index reads; a row without it is invisible to
 * `searchCatalog`, and every ingredient would come back unmatched for the wrong reason.
 */
const seed = async () => {
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });

    const catalog = async (fr: string, en: string, category: "OTHER" | "OIL" = "OTHER") =>
      ctx.db.insert("ingredients", {
        name: { values: { fr, en }, meta: {} },
        search: { fr, en },
        category,
        emoji: "🥕",
        // Classified, and classified as the permissive answer: a plant carrying no allergen.
        // `computeTags` refuses to tag at all when a row carries neither field, so leaving them
        // off would make every assertion below pass for the wrong reason.
        diet: "vegan",
        allergens: [],
        defaultUnit: "pcs",
        defaultQuantity: 1,
        nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
        updatedAt: Date.now(),
      });

    return {
      user,
      onion: await catalog("oignon", "onion"),
      oil: await catalog("huile d'olive", "olive oil", "OIL"),
    };
  });

  userId = ids.user;
  catalog = {
    "oignon": ids.onion as Id<"ingredients">,
    "huile d'olive": ids.oil as Id<"ingredients">,
  };

  return ids;
};

/**
 * The links the ACTION would have resolved, stated outright.
 *
 * `saveRecipe` no longer decides which lines link: `resolveRecipeIngredients` does that in the
 * action, where a name may reach two datasets, two live APIs and a model. A line naming one of the
 * two fixture rows links; anything else stands for a name the resolver refused or could not buy,
 * and reaches this writer unlinked — which is the case every "no link" assertion below is about.
 */
const linksOf = (ingredients: SanitizedRecipe["ingredients"]): RecipeLink[] =>
  ingredients.flatMap((line, position) => {
    const ingredientId = catalog[line.name];
    if (!ingredientId) return [];

    return [{ ingredientId, position, quantity: line.quantity, unit: line.unit, ...(line.fatUse && { fatUse: line.fatUse }) }];
  });

const recipe = (ingredients: SanitizedRecipe["ingredients"]): SanitizedRecipe => ({
  title: "Soupe à l'oignon",
  description: "Une soupe d'hiver.",
  servings: 4,
  difficulty: 2,
  cuisine: "french",
  tags: ["soup", "comfort-food"],
  equipments: [],
  timings: { preparation: 15, cooking: 45 },
  instructions: [
    {
      title: "Base",
      steps: [
        { instruction: "Émincer les oignons.", hints: [] },
        { instruction: "Les faire suer 10 minutes.", hints: ["À feu doux, sans les colorer."] },
      ],
    },
    { steps: [{ instruction: "Servir bien chaud.", hints: [] }] },
  ],
  ingredients,
});

const save = (ingredients: SanitizedRecipe["ingredients"], sourceUrl?: string) =>
  t.run((ctx) =>
    saveRecipe(ctx, {
      userId: userId as Id<"users">,
      locale: "fr",
      recipe: recipe(ingredients),
      links: linksOf(ingredients),
      sourceUrl,
    }),
  );

/**
 * `t.run` hands back a ctx over the GENERIC data model, so `withIndex` has no index to name here
 * and the filtering happens in memory. Fine for a fixture of three rows, and not a pattern to copy
 * into `functions/` — S1 still applies there.
 */
const links = (recipeId: Id<"recipes">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("recipeIngredients").collect();
    return rows.filter((row) => row.recipeId === recipeId);
  });

beforeEach(async () => {
  t = convexTest(schema, modules);
  await seed();
});

describe("functions/recipes/saveRecipe", () => {
  test("stores every localized field under the locale it was generated in, as machine text", async () => {
    const recipeId = await save([{ name: "oignon", quantity: 2, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.title.values).toEqual({ fr: "Soupe à l'oignon" });
    expect(row!.title.meta.fr!.status).toBe("machine");
    expect(row!.description.values.fr).toBe("Une soupe d'hiver.");
    // The groups reach the column as one string — a `vLocalized` holds text, not structure.
    expect(row!.instructions.values.fr).toContain("Base");
    expect(row!.instructions.values.fr).toContain("Émincer les oignons.");
    // The hint is written under its own step, where the parser will look for it on the way back.
    expect(row!.instructions.values.fr).toContain("- Les faire suer 10 minutes.\n> À feu doux, sans les colorer.");
    expect(row!.title.values.en).toBeUndefined();
  });

  test("carries the non-localized fields through untouched", async () => {
    const recipeId = await save([{ name: "oignon", quantity: 2, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.userId).toBe(userId);
    expect(row!.servings).toBe(4);
    expect(row!.difficulty).toBe(2);
    expect(row!.cuisine).toBe("french");
    expect(row!.timings).toEqual({ preparation: 15, cooking: 45 });
  });

  /** Nobody has read what the model just wrote, and no recipe is born deleted. */
  test("stores the recipe as generated and live", async () => {
    const recipeId = await save([{ name: "oignon", quantity: 2, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.status).toBe("generated");
    expect(row!.isArchived).toBe(false);
  });

  /**
   * `tags` is the one field that is NOT carried through untouched: what the model authored is kept
   * whole, and the computed half is appended to it. Every fixture row is classified as a plant
   * carrying nothing, so none of them contradicts a claim — which is what makes this an assertion
   * about the appending, not about the tag rules. Those are `computeTags.test.ts`.
   */
  test("keeps the authored tags and appends the computed ones", async () => {
    const recipeId = await save([{ name: "oignon", quantity: 2, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.tags).toEqual(expect.arrayContaining(["soup", "comfort-food"]));
    expect(row!.tags).toEqual(expect.arrayContaining(["vegetarian", "vegan"]));
    expect(row!.tags).toEqual(expect.arrayContaining(["gluten-free", "nut-free"]));
  });

  /**
   * The facets are a projection of `tags`, so the assertion that matters is that the two AGREE —
   * a boolean set true for a tag the recipe does not carry is a recipe surfacing in a filter that
   * promises something about it.
   */
  test("writes the filter facets to match the tags it just computed", async () => {
    const recipeId = await save([{ name: "oignon", quantity: 2, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.isVegan).toBe(row!.tags.includes("vegan"));
    expect(row!.isVegetarian).toBe(row!.tags.includes("vegetarian"));
    expect(row!.isGlutenFree).toBe(row!.tags.includes("gluten-free"));
    expect(row!.isNutFree).toBe(row!.tags.includes("nut-free"));
  });

  /** No claim computed means no facet claimed — `false` is "not claimed", never "contains it". */
  test("claims no facet when a line resolved to nothing", async () => {
    const recipeId = await save([
      { name: "oignon", quantity: 2, unit: "pcs" },
      { name: "quelque chose d'inconnu", quantity: 1, unit: "pcs" },
    ]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.isVegan).toBe(false);
    expect(row!.isGlutenFree).toBe(false);
  });

  test("writes the ingredient search blob in both locales", async () => {
    const recipeId = await save([{ name: "oignon", quantity: 2, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.search?.fr).toContain("oignon");
    expect(row!.search?.en).toContain("onion");
  });

  /** The blob is what makes an unlinked line findable at all — see recipeSearchText.test.ts. */
  test("keeps an unlinked line's raw name in the search blob", async () => {
    const recipeId = await save([{ name: "nuoc-mâm", quantity: 1, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    // Tokenized, because that is what the index stores — see recipeSearchText.test.ts.
    expect(row!.search?.fr).toContain("nuoc");
    expect(row!.search?.fr).toContain("mâm");
  });

  /** An unlinked line is an unknown ingredient, so no diet claim can be made about the recipe. */
  test("appends no computed tags when a line resolved to nothing", async () => {
    const recipeId = await save([
      { name: "oignon", quantity: 2, unit: "pcs" },
      { name: "zzzzzzz nonexistent", quantity: 1, unit: "pcs" },
    ]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.tags).toEqual(["soup", "comfort-food"]);
  });

  test("writes one join row per link, carrying the line's own quantity and unit", async () => {
    const { onion } = await t.run(async (ctx) => ({
      onion: (await ctx.db.query("ingredients").collect())[0]!._id,
    }));

    const recipeId = await save([{ name: "oignon", quantity: 2, unit: "pcs" }]);
    const rows = await links(recipeId);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipeId).toBe(recipeId);
    expect(rows[0]!.ingredientId).toBe(onion);
    expect(rows[0]!.quantity).toBe(2);
    expect(rows[0]!.unit).toBe("pcs");
  });

  /**
   * The model tags a line by reading the steps, and can tag the onion it fried rather than the oil
   * it fried in. Only a cooking fat keeps the tag; the onion's line is still written, untagged.
   */
  test("keeps a line's fat use on a cooking fat, and drops it from anything else", async () => {
    const recipeId = await save([
      { name: "oignon", quantity: 3, unit: "pcs", fatUse: "fried" },
      { name: "huile d'olive", quantity: 7, unit: "tbsp", fatUse: "fried" },
    ]);

    const rows = await links(recipeId);
    const byIngredient = new Map(rows.map((row) => [row.ingredientId, row]));

    expect(rows).toHaveLength(2);
    expect(byIngredient.get(catalog["oignon"]!)!.fatUse).toBeUndefined();
    expect(byIngredient.get(catalog["huile d'olive"]!)!.fatUse).toBe("fried");
  });

  test("writes no join row for a line the resolver returned no link for", async () => {
    const recipeId = await save([
      { name: "oignon", quantity: 2, unit: "pcs" },
      { name: "poudre de perlimpinpin", quantity: 1, unit: "g" },
    ]);

    const rows = await links(recipeId);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantity).toBe(2);
  });

  test("keeps a dropped line's position, so the links still index the list the cook reads", async () => {
    const recipeId = await save([
      { name: "poudre de perlimpinpin", quantity: 1, unit: "g" },
      { name: "oignon", quantity: 2, unit: "pcs" },
    ]);

    const rows = await links(recipeId);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.position).toBe(1);
  });

  /**
   * Two lines on one food are one line, summed: the cook would otherwise read onions twice. The
   * regression this file was first written for still holds inside it: keying a line by NAME gave
   * both lines the FIRST one's quantity, which would sum to 4, not 3.
   */
  test("merges the same ingredient appearing twice into one line, summing both amounts", async () => {
    const recipeId = await save([
      { name: "oignon", quantity: 2, unit: "pcs" },
      { name: "huile d'olive", quantity: 2, unit: "tbsp" },
      { name: "oignon", quantity: 1, unit: "pcs" },
    ]);

    const rows = (await links(recipeId)).sort((a, b) => a.position - b.position);

    // The merged line takes the last position its food held — see `mergeRecipeLines` for why.
    expect(rows.map((row) => [row.ingredientId, row.position, row.quantity, row.unit])).toEqual([
      [catalog["huile d'olive"], 0, 2, "tbsp"],
      [catalog["oignon"], 1, 3, "pcs"],
    ]);
  });

  /**
   * `computeTags` refuses every tag when fewer links come back than the recipe has lines, so a merge
   * that did not take the folded line off the count would read as an unresolved line.
   */
  test("keeps its computed tags when two lines were merged", async () => {
    const recipeId = await save([
      { name: "oignon", quantity: 2, unit: "pcs" },
      { name: "oignon", quantity: 1, unit: "pcs" },
    ]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.tags).toEqual(expect.arrayContaining(["vegan", "gluten-free"]));
  });

  /**
   * The persist is the last writer before the column, and the column is a future dedupe key: a
   * caller that skipped the import's canonicalization — `createOne.authed` called by hand — must
   * not be able to store a second spelling of the same page.
   */
  test("writes sourceUrl in canonical form, trackers stripped, even when the caller passes them", async () => {
    const recipeId = await save(
      [{ name: "oignon", quantity: 2, unit: "pcs" }],
      "https://example.com/tarte?utm_source=fb&id=12#comments",
    );

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.sourceUrl).toBe("https://example.com/tarte?id=12");
  });

  test("stores no sourceUrl for a recipe that came from nowhere", async () => {
    const recipeId = await save([{ name: "oignon", quantity: 2, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.sourceUrl).toBeUndefined();
  });

  test("stores a sourceUrl that is not a web address as absent, rather than refusing the recipe", async () => {
    const recipeId = await save([{ name: "oignon", quantity: 2, unit: "pcs" }], "not a url");

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.sourceUrl).toBeUndefined();
  });
});
