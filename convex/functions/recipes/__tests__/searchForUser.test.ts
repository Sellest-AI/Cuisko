import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { searchForUser } from "../searchForUser";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const seedUser = (name: string) => t.run((ctx) => ctx.db.insert("users", { name }));

/**
 * `search` is written as a literal rather than through `searchTextOf`.
 *
 * That is what C11 excludes `__tests__` for: a fixture stating what is in the blob is stating an
 * input, and pushing it through the serializer would make these tests assert how the blob is built
 * instead of what a cook can find with it. `recipeSearchText` has its own test for the building.
 */
const seedRecipe = (
  userId: Id<"users">,
  { title, search = "" }: { title: string; search?: string },
) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
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
      isVegan: false,
      isVegetarian: false,
      isPescatarian: false,
      isGlutenFree: false,
      isDairyFree: false,
      isNutFree: false,
      updatedAt: Date.now(),
    }),
  );

const search = (userId: Id<"users">, query: string) =>
  t.run((ctx) => searchForUser(ctx, { userId, locale: "en", query }));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/recipes/searchForUser", () => {
  test("finds a recipe by a word of its own name", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, { title: "Aubergine lasagna" });

    expect((await search(userId, "lasagna")).map((r) => r.title)).toEqual(["Aubergine lasagna"]);
  });

  /**
   * The blob carries each ingredient's catalog aliases, so a recipe is reachable under a name its
   * author never typed. Nothing in the recipe below says "aubergine" outside the blob.
   */
  test("finds a recipe by an ingredient in it, under an alias of that ingredient", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, { title: "Summer bake", search: "eggplant aubergine tomato" });

    expect((await search(userId, "aubergine")).map((r) => r.title)).toEqual(["Summer bake"]);
  });

  /**
   * The ranking rule, and the reason both reads happen in one function: someone typing "tomato"
   * wants the recipe called that, not the four that merely contain tomatoes.
   */
  test("ranks a name match ahead of an ingredient match", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, { title: "Bean stew", search: "tomato beans" });
    await seedRecipe(userId, { title: "Tomato soup", search: "onion" });

    expect((await search(userId, "tomato")).map((r) => r.title)).toEqual([
      "Tomato soup",
      "Bean stew",
    ]);
  });

  /** Matching both indexes is the common case, not the odd one — "Tomato soup" contains tomatoes. */
  test("returns a recipe matching both indexes once, in the name band", async () => {
    const userId = await seedUser("Franck");
    await seedRecipe(userId, { title: "Tomato soup", search: "tomato onion" });
    await seedRecipe(userId, { title: "Bean stew", search: "tomato beans" });

    const titles = (await search(userId, "tomato")).map((r) => r.title);

    expect(titles).toEqual(["Tomato soup", "Bean stew"]);
    expect(titles.filter((title) => title === "Tomato soup")).toHaveLength(1);
  });

  test("never reaches another cook's recipes, by either index", async () => {
    const userId = await seedUser("Franck");
    const strangerId = await seedUser("Stranger");
    await seedRecipe(strangerId, { title: "Tomato soup", search: "tomato" });

    expect(await search(userId, "tomato")).toEqual([]);
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
