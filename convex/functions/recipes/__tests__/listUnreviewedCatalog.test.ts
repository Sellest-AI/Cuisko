import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { RecipeStatus } from "@convex/schema/recipes";
import { facetsOf } from "@shared/tags";

import schema from "../../../schema";
import { listUnreviewedCatalog } from "../listUnreviewedCatalog";

const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

type Seed = { status?: RecipeStatus; sourceUrl?: string; userId?: Id<"users">; isArchived?: boolean };

const insertRecipe = ({ status = "generated", sourceUrl = "https://example.com/tarte", userId, isArchived = false }: Seed) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status,
      isArchived,
      userId,
      title: { values: { fr: "Tarte aux pommes" }, meta: {} },
      description: { values: { fr: "" }, meta: {} },
      instructions: { values: { fr: "- Cuire." }, meta: {} },
      servings: 4,
      equipments: [],
      difficulty: 1,
      tags: [],
      cuisine: "french",
      timings: {},
      search: { fr: "", en: "" },
      ...facetsOf([]),
      sourceUrl,
      updatedAt: 1,
    }),
  );

const list = () => t.run((ctx) => listUnreviewedCatalog(ctx));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("listUnreviewedCatalog", () => {
  test("lists a live generated catalog recipe with its page and title", async () => {
    const recipeId = await insertRecipe({});

    expect(await list()).toEqual([{ recipeId, sourceUrl: "https://example.com/tarte", title: "Tarte aux pommes" }]);
  });

  /** An `edited` recipe carries a person's correction made after a review; a verify would undo it. */
  test("leaves out a recipe already reviewed or edited", async () => {
    await insertRecipe({ status: "reviewed" });
    await insertRecipe({ status: "edited" });

    expect(await list()).toEqual([]);
  });

  test("leaves out a cook's own recipe", async () => {
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Cook" }));
    await insertRecipe({ userId });

    expect(await list()).toEqual([]);
  });

  test("leaves out an archived recipe, and one with no page to verify against", async () => {
    await insertRecipe({ isArchived: true });
    await insertRecipe({ sourceUrl: "" });

    expect(await list()).toEqual([]);
  });
});
