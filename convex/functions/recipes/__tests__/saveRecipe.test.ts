import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";

import schema from "../../../schema";
import { saveRecipe } from "../saveRecipe";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;
let userId: string;

/**
 * Two catalog rows and nothing else.
 *
 * `matchIngredients` is tested against the REAL catalog in `functions/ingredients/__tests__`,
 * where the thresholds it is tuned to are the thresholds under test. Here it is a collaborator:
 * what this file asserts is what `saveRecipe` does with a match and with a miss, so a two-row
 * catalog with unambiguous names is the honest fixture — a bigger one would only make the
 * assertions depend on ranking decisions that are already covered elsewhere.
 *
 * `search` is set because that is the field the index reads; a row without it is invisible to
 * `searchCatalog`, and every ingredient would come back unmatched for the wrong reason.
 */
const seed = async () => {
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });

    const catalog = async (fr: string, en: string) =>
      ctx.db.insert("ingredients", {
        name: { values: { fr, en }, meta: {} },
        search: { fr, en },
        category: "OTHER",
        defaultUnit: "pcs",
        defaultQuantity: 1,
        nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
        updatedAt: Date.now(),
      });

    return {
      user,
      onion: await catalog("oignon", "onion"),
      oil: await catalog("huile d'olive", "olive oil"),
    };
  });

  userId = ids.user;
  return ids;
};

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
    { title: "Base", steps: ["Émincer les oignons.", "Les faire suer 10 minutes."] },
    { steps: ["Servir bien chaud."] },
  ],
  ingredients,
});

const save = (ingredients: SanitizedRecipe["ingredients"]) =>
  t.run((ctx) =>
    saveRecipe(ctx, {
      userId: userId as Id<"users">,
      locale: "fr",
      recipe: recipe(ingredients),
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

  /**
   * `tags` is the one field that is NOT carried through untouched: what the model authored is kept
   * whole, and the computed half is appended to it. The fixture catalog is `OTHER` throughout, so
   * nothing in it contradicts a diet claim — which is what makes this an assertion about the
   * appending, not about the tag rules. Those are `computeTags.test.ts`.
   */
  test("keeps the authored tags and appends the computed ones", async () => {
    const recipeId = await save([{ name: "oignon", quantity: 2, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.tags).toEqual(expect.arrayContaining(["soup", "comfort-food"]));
    expect(row!.tags).toEqual(expect.arrayContaining(["vegetarian", "vegan"]));
  });

  /** An unmatched line is an unknown ingredient, so no diet claim can be made about the recipe. */
  test("appends no computed tags when a line did not match the catalog", async () => {
    const recipeId = await save([
      { name: "oignon", quantity: 2, unit: "pcs" },
      { name: "zzzzzzz nonexistent", quantity: 1, unit: "pcs" },
    ]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.tags).toEqual(["soup", "comfort-food"]);
  });

  test("links a confidently matched ingredient to its catalog row", async () => {
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

  test("drops a name the catalog does not hold rather than guessing at one", async () => {
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
   * The regression this file exists for: matching by NAME collapses two lines of the same
   * ingredient into one, and gives both the first line's quantity. The link is the INDEX.
   */
  test("keeps both lines when the same ingredient appears twice with different amounts", async () => {
    const recipeId = await save([
      { name: "oignon", quantity: 2, unit: "pcs" },
      { name: "huile d'olive", quantity: 2, unit: "cs" },
      { name: "oignon", quantity: 1, unit: "pcs" },
    ]);

    const rows = (await links(recipeId)).sort((a, b) => a.position - b.position);

    expect(rows.map((row) => row.position)).toEqual([0, 1, 2]);
    expect(rows.map((row) => row.quantity)).toEqual([2, 2, 1]);
    expect(rows[0]!.ingredientId).toBe(rows[2]!.ingredientId);
  });
});
