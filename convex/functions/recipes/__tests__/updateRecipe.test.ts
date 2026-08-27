import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";
import type { Unit } from "@shared/ingredients";

import schema from "../../../schema";
import { updateRecipe } from "../updateRecipe";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;
let userId: string;
let onionId: string;

/** One catalog row, matched by every fixture recipe below. */
const seed = async () => {
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });
    const onion = await ctx.db.insert("ingredients", {
      name: { values: { fr: "oignon", en: "onion" }, meta: {} },
      search: { fr: "oignon", en: "onion" },
      category: "OTHER",
      diet: "vegan",
      allergens: [],
      defaultUnit: "pcs",
      defaultQuantity: 1,
      nutrition: { calories: 10, protein: 1, fat: 1, carbohydrates: 1 },
      updatedAt: Date.now(),
    });

    return { user, onion };
  });

  userId = ids.user;
  onionId = ids.onion;
  return ids;
};

const seedRecipe = () =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      title: {
        values: { fr: "Soupe à l'oignon", en: "Onion soup" },
        meta: {
          fr: { status: "machine", sourceHash: "old" },
          en: { status: "machine", sourceHash: "old" },
        },
      },
      description: { values: { fr: "Une soupe.", en: "A soup." }, meta: {} },
      instructions: { values: { fr: "Base\n- Émincer.", en: "Base\n- Slice." }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 2,
      userId: userId as Id<"users">,
      tags: ["soup"],
      cuisine: "french",
      timings: { preparation: 15 },
      search: { fr: "oignon", en: "onion" },
      isVegan: false,
      isVegetarian: false,
      isPescatarian: false,
      isGlutenFree: false,
      isDairyFree: false,
      isNutFree: false,
      updatedAt: Date.now(),
    }),
  );

const seedLink = (
  recipeId: Id<"recipes">,
  ingredientId: Id<"ingredients">,
  overrides: Partial<{ position: number; quantity: number; unit: Unit }> = {},
) =>
  t.run((ctx) =>
    ctx.db.insert("recipeIngredients", {
      recipeId,
      ingredientId,
      position: overrides.position ?? 0,
      quantity: overrides.quantity ?? 1,
      unit: overrides.unit ?? "pcs",
      updatedAt: Date.now(),
    }),
  );

const links = (recipeId: Id<"recipes">) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("recipeIngredients").collect();
    return rows.filter((row) => row.recipeId === recipeId);
  });

const recipe = (ingredients: SanitizedRecipe["ingredients"]): SanitizedRecipe => ({
  title: "Soupe à l'oignon, revisitée",
  description: "Une soupe d'hiver, en mieux.",
  servings: 4,
  difficulty: 3,
  cuisine: "french",
  tags: ["soup", "comfort-food"],
  equipments: [],
  timings: { preparation: 20 },
  instructions: [{ steps: ["Émincer les oignons.", "Les faire suer 15 minutes."] }],
  ingredients,
});

const update = (
  recipeId: Id<"recipes">,
  ingredients: SanitizedRecipe["ingredients"],
  analyzed = true,
) =>
  t.run((ctx) =>
    updateRecipe(ctx, { recipeId, locale: "fr", recipe: recipe(ingredients), analyzed }),
  );

beforeEach(async () => {
  t = convexTest(schema, modules);
  await seed();
});

describe("functions/recipes/updateRecipe", () => {
  test("rewrites the locale it was edited in, as machine text", async () => {
    const recipeId = await seedRecipe();

    await update(recipeId, [{ name: "oignon", quantity: 3, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.title.values.fr).toBe("Soupe à l'oignon, revisitée");
    expect(row!.title.meta.fr!.status).toBe("machine");
  });

  /**
   * The whole reason this is a patch and not `saveRecipe`'s `_machine`: an edit in French must not
   * erase a translation the recipe already carries in English.
   */
  test("keeps the other locale's existing translation untouched", async () => {
    const recipeId = await seedRecipe();

    await update(recipeId, [{ name: "oignon", quantity: 3, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.title.values.en).toBe("Onion soup");
    expect(row!.description.values.en).toBe("A soup.");
  });

  test("carries the non-localized fields through from the revised recipe", async () => {
    const recipeId = await seedRecipe();

    await update(recipeId, [{ name: "oignon", quantity: 3, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.servings).toBe(4);
    expect(row!.difficulty).toBe(3);
    expect(row!.timings).toEqual({ preparation: 20 });
  });

  test("recomputes the facets to match the tags the edit produced", async () => {
    const recipeId = await seedRecipe();

    await update(recipeId, [{ name: "oignon", quantity: 3, unit: "pcs" }]);

    const row = await t.run((ctx) => ctx.db.get(recipeId));

    expect(row!.isVegan).toBe(row!.tags.includes("vegan"));
    expect(row!.tags).toEqual(expect.arrayContaining(["soup", "comfort-food"]));
  });

  /**
   * The pointed case: a line dropped from the edited text must not leave its old link behind, and
   * a line added must gain one — a diff would have to get both directions right, a replace cannot
   * get either wrong.
   */
  test("replaces the recipe's ingredient links with the edited set", async () => {
    const recipeId = await seedRecipe();
    const staleLink = await seedLink(recipeId, onionId as Id<"ingredients">);

    await update(recipeId, [{ name: "oignon", quantity: 5, unit: "pcs" }]);

    const rows = await links(recipeId);

    expect(rows).toHaveLength(1);
    expect(rows[0]!._id).not.toBe(staleLink);
    expect(rows[0]!.quantity).toBe(5);
  });

  test("throws for a recipe that does not exist", async () => {
    const missingId = await seedRecipe();
    await t.run((ctx) => ctx.db.delete(missingId));

    await expect(update(missingId, [{ name: "oignon", quantity: 1, unit: "pcs" }])).rejects.toThrow();
  });

  /**
   * `analyzed` is how `updateRecipe` learns whether `recipe` passed through the agent or is the
   * cook's own words carried straight through — see the type's own comment for why that decides
   * the status rather than always writing `"machine"`.
   */
  test("stamps the locale edited rather than machine when the agent did not run", async () => {
    const recipeId = await seedRecipe();

    await update(recipeId, [{ name: "oignon", quantity: 3, unit: "pcs" }], false);

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.meta.fr!.status).toBe("edited");
  });

  test("still stamps machine when the agent did run", async () => {
    const recipeId = await seedRecipe();

    await update(recipeId, [{ name: "oignon", quantity: 3, unit: "pcs" }], true);

    const row = await t.run((ctx) => ctx.db.get(recipeId));
    expect(row!.title.meta.fr!.status).toBe("machine");
  });

  /**
   * The pointed case in the other direction from "replaces the recipe's ingredient links": a
   * title-only edit re-resolves the SAME ingredients, and must not delete and reinsert a link that
   * would come back identical — both because it is wasted work and because a fuzzy match sitting
   * near its threshold is not guaranteed to land on the same catalog row twice.
   */
  test("leaves the ingredient links untouched when the resolved set did not change", async () => {
    const recipeId = await seedRecipe();
    const originalLinkId = await seedLink(recipeId, onionId as Id<"ingredients">, {
      quantity: 2,
      unit: "pcs",
      position: 0,
    });

    await update(recipeId, [{ name: "oignon", quantity: 2, unit: "pcs" }]);

    const rows = await links(recipeId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!._id).toBe(originalLinkId);
  });
});
