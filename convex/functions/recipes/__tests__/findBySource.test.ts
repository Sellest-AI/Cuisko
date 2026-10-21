import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import { facetsOf } from "@shared/tags";

import schema from "../../../schema";
import { findCatalogBySource } from "../findBySource";

const modules = import.meta.glob("/convex/**/*.*s");

let t: ReturnType<typeof convexTest>;

const insertRecipe = (sourceUrl: string, userId?: Id<"users">) =>
  t.run((ctx) =>
    ctx.db.insert("recipes", {
      status: "generated",
      isArchived: false,
      userId,
      title: { values: { fr: "Tarte" }, meta: {} },
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

const find = (url: string) => t.run((ctx) => findCatalogBySource(ctx, { url }));

beforeEach(() => {
  t = convexTest(schema, modules);
});

describe("functions/recipes/findBySource › findCatalogBySource", () => {
  test("returns the catalog recipe imported from the url", async () => {
    const recipeId = await insertRecipe("https://example.com/tarte");

    expect(await find("https://example.com/tarte")).toBe(recipeId);
  });

  test("returns null when no recipe came from the url", async () => {
    await insertRecipe("https://example.com/tarte");

    expect(await find("https://example.com/quiche")).toBeNull();
  });

  /**
   * A cook's own import of the page is their row, not the catalog's. Matching it would hand the
   * catalog a recipe its owner can edit or delete, and the catalog would never get its own copy.
   */
  test("ignores a recipe a cook owns, even from the same url", async () => {
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Cook" }));
    await insertRecipe("https://example.com/tarte", userId);

    expect(await find("https://example.com/tarte")).toBeNull();
  });

  /** The row stores the canonical spelling, so the lookup has to reach it from any other. */
  test("finds the recipe from a spelling with trackers and a fragment", async () => {
    const recipeId = await insertRecipe("https://example.com/tarte");

    expect(await find("https://example.com/tarte?utm_source=fb&fbclid=x#comments")).toBe(recipeId);
  });

  /** Not found and not a page are different answers: only the first lets the import go ahead. */
  test("refuses text that is not a web address, rather than reporting it absent", async () => {
    await expect(find("javascript:alert(1)")).rejects.toThrow(/INVALID_INPUT/);
  });
});
