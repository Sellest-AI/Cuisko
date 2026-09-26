import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Diet } from "@shared/diets";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { searchForUser } from "../searchForUser";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const seedUser = (name: string) => t.run((ctx) => ctx.db.insert("users", { name }));

const seedDiet = (userId: Id<"users">, diet: Diet) =>
  t.run((ctx) =>
    ctx.db.insert("userPreferences", { userId, diet, avoids: [], seeks: [], updatedAt: Date.now() }),
  );

/**
 * `search` is written as a literal rather than through `searchTextOf`.
 *
 * That is what C11 excludes `__tests__` for: a fixture stating what is in the blob is stating an
 * input, and pushing it through the serializer would make these tests assert how the blob is built
 * instead of what a cook can find with it. `recipeSearchText` has its own test for the building.
 *
 * `userId` absent is a seeded catalog row, the one kind of recipe nobody wrote. A vegan fixture
 * claims the two diets it nests, as `facetsOf` would.
 */
const seedRecipe = (
  userId: Id<"users"> | undefined,
  { title, search = "", isVegan = false }: { title: string; search?: string; isVegan?: boolean },
) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      title: { values: { en: title, fr: title }, meta: {} },
      description: { values: {}, meta: {} },
      instructions: { values: {}, meta: {} },
      servings: 2,
      equipments: [],
      difficulty: 2,
      userId,
      tags: [],
      cuisine: "italian",
      timings: {},
      search: { en: search, fr: search },
      isVegan,
      isVegetarian: isVegan,
      isPescatarian: isVegan,
      isGlutenFree: false,
      isDairyFree: false,
      isNutFree: false,
      updatedAt: Date.now(),
    }),
  );

const search = (userId: Id<"users">, query: string, limit?: number) =>
  t.run((ctx) => searchForUser(ctx, { userId, locale: "en", query, limit }));

const titlesOf = (userId: Id<"users">, query: string, limit?: number) =>
  search(userId, query, limit).then((cards) => cards.map((card) => card.title));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/recipes/searchForUser", () => {
  test("finds a recipe by a word of its own name", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, { title: "Aubergine lasagna" });

    expect(await titlesOf(userId, "lasagna")).toEqual(["Aubergine lasagna"]);
  });

  /**
   * The blob carries each ingredient's catalog aliases, so a recipe is reachable under a name its
   * author never typed. Nothing in the recipe below says "aubergine" outside the blob.
   */
  test("finds a recipe by an ingredient in it, under an alias of that ingredient", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, { title: "Summer bake", search: "eggplant aubergine tomato" });

    expect(await titlesOf(userId, "aubergine")).toEqual(["Summer bake"]);
  });

  /**
   * The ranking rule inside a band, and the reason both reads happen in one function: someone
   * typing "tomato" wants the recipe called that, not the four that merely contain tomatoes.
   */
  test("ranks a name match ahead of an ingredient match", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, { title: "Bean stew", search: "tomato beans" });
    await seedRecipe(userId, { title: "Tomato soup", search: "onion" });

    expect(await titlesOf(userId, "tomato")).toEqual(["Tomato soup", "Bean stew"]);
  });

  /** Matching both indexes is the common case, not the odd one — "Tomato soup" contains tomatoes. */
  test("returns a recipe matching both indexes once, in the name band", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, { title: "Tomato soup", search: "tomato onion" });
    await seedRecipe(userId, { title: "Bean stew", search: "tomato beans" });

    const titles = await titlesOf(userId, "tomato");

    expect(titles).toEqual(["Tomato soup", "Bean stew"]);
    expect(titles.filter((title) => title === "Tomato soup")).toHaveLength(1);
  });

  /** The catalog is shared: a seeded row and another cook's are both answers, by either index. */
  test("reaches the seeded catalog and other cooks' recipes", async () => {
    const userId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    await seedRecipe(undefined, { title: "Tomato soup", search: "tomato" });
    await seedRecipe(strangerId, { title: "Bean stew", search: "tomato beans" });

    expect(await titlesOf(userId, "tomato")).toEqual(["Tomato soup", "Bean stew"]);
  });

  /**
   * Archived is left out of every scope and both indexes: the caller's own recipe and a stranger's,
   * found by name or by ingredient, are found by nobody once their cook deleted them.
   */
  test("never returns an archived recipe, the caller's own or anyone else's", async () => {
    const userId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    await seedRecipe(undefined, { title: "Tomato soup", search: "tomato" });
    const mine = await seedRecipe(userId, { title: "Tomato tart", search: "tomato" });
    const theirs = await seedRecipe(strangerId, { title: "Bean stew", search: "tomato beans" });
    await t.run(async (ctx) => {
      await ctx.db.patch(mine, { isArchived: true });
      await ctx.db.patch(theirs, { isArchived: true });
    });

    expect(await titlesOf(userId, "tomato")).toEqual(["Tomato soup"]);
  });

  /**
   * Ownership outranks the index a match came from: the cook's own stew, found only by an
   * ingredient, comes before a stranger's soup found by its name.
   */
  test("ranks the caller's own recipes ahead of everyone else's", async () => {
    const userId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    await seedRecipe(undefined, { title: "Tomato soup", search: "tomato" });
    await seedRecipe(strangerId, { title: "Tomato tart", search: "tomato" });
    await seedRecipe(userId, { title: "Bean stew", search: "tomato beans" });

    expect((await titlesOf(userId, "tomato"))[0]).toBe("Bean stew");
  });

  /**
   * A diet ranks, it does not filter: the chicken curry is still there for the cook who meant it,
   * and it comes last.
   */
  test("ranks a vegan cook's diet-suitable matches first, and still returns the rest", async () => {
    const userId = await seedUser("Franck");
    await seedDiet(userId, "vegan");
    await seedRecipe(undefined, { title: "Chicken curry", search: "chicken" });
    await seedRecipe(undefined, { title: "Chickpea curry", search: "chickpea", isVegan: true });

    expect(await titlesOf(userId, "curry")).toEqual(["Chickpea curry", "Chicken curry"]);
  });

  /** Own beats diet: the cook wrote the egg curry, and a search is not a diet filter. */
  test("ranks the caller's own non-suitable recipe ahead of a stranger's suitable one", async () => {
    const userId = await seedUser("Franck");
    await seedDiet(userId, "vegan");
    await seedRecipe(undefined, { title: "Chickpea curry", search: "chickpea", isVegan: true });
    await seedRecipe(userId, { title: "Egg curry", search: "egg" });

    expect(await titlesOf(userId, "curry")).toEqual(["Egg curry", "Chickpea curry"]);
  });

  /** A vegan cook's own recipes are ranked by the same rule among themselves. */
  test("ranks the caller's own suitable recipe ahead of their own non-suitable one", async () => {
    const userId = await seedUser("Franck");
    await seedDiet(userId, "vegan");
    await seedRecipe(userId, { title: "Egg curry", search: "egg" });
    await seedRecipe(userId, { title: "Chickpea curry", search: "chickpea", isVegan: true });

    expect(await titlesOf(userId, "curry")).toEqual(["Chickpea curry", "Egg curry"]);
  });

  /** Never asked reads as eating anything: with no row the diet changes nothing about the order. */
  test("ranks by ownership alone for a cook with no stored diet", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(undefined, { title: "Chickpea curry", search: "chickpea", isVegan: true });
    await seedRecipe(undefined, { title: "Chicken curry", search: "chicken" });
    await seedRecipe(userId, { title: "Egg curry", search: "egg" });

    const titles = await titlesOf(userId, "curry");

    expect(titles[0]).toBe("Egg curry");
    expect(titles.slice(1).sort()).toEqual(["Chicken curry", "Chickpea curry"]);
  });

  test("cuts the answer to the limit, keeping the best-ranked", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(undefined, { title: "Tomato soup", search: "tomato" });
    await seedRecipe(undefined, { title: "Tomato tart", search: "tomato" });
    await seedRecipe(userId, { title: "Tomato salad", search: "tomato" });

    const titles = await titlesOf(userId, "tomato", 2);

    expect(titles).toHaveLength(2);
    expect(titles[0]).toBe("Tomato salad");
  });

  /**
   * A box under a list that is already drawn: typing nothing has narrowed nothing, and answering
   * with the first page of everything would make clearing the field look like a different screen.
   */
  test("answers an empty query with nothing rather than with everything", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, { title: "Tomato soup", search: "tomato" });

    expect(await search(userId, "")).toEqual([]);
    expect(await search(userId, "   ")).toEqual([]);
  });

  /**
   * Stated as the absence of the document's fields rather than as the card's exact key set, because
   * `minutes` is dropped on the way out when a recipe declares no timings. The card's full shape is
   * pinned in `router/recipes/__tests__/getAll.test.ts`, against a recipe that has some.
   */
  test("hands back cards rather than documents", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, { title: "Tomato soup", search: "tomato" });

    const [card] = await search(userId, "tomato");

    expect(card).toBeDefined();
    ["search", "description", "instructions", "_id", "_creationTime", "userId"].forEach((field) => {
      expect(card).not.toHaveProperty(field);
    });
  });
});
