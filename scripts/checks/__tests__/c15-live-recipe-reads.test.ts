/**
 * C15's own tests.
 *
 * A recipe its cook deleted stays in the table, and only each list read asking for live rows keeps
 * it off screen (ADR 0017). The first case is the reader this check exists for — `listForUser` as
 * it was written before archiving — and if C15 ever stops failing it, that test goes red.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, passed, runCheck } from "./_harness";

const SCRIPT = "c15-live-recipe-reads.mjs";

afterEach(cleanupTrees);

describe("a recipe query that can reach archived rows", () => {
  it("rejects a list read on an index without isArchived", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/functions/recipes/listForUser.ts": `
        export const listForUser = (ctx, { userId, paginationOpts }) =>
          ctx.db
            .query("recipes")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(paginationOpts);
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/functions/recipes/listForUser.ts:4");
    expect(output).toContain("a recipe its cook deleted would show up");
  });

  it("rejects a search that does not narrow to live rows", () => {
    const { code, output } = runCheck(SCRIPT, {
      "convex/agent/tools/findDish.ts": `
        export const findDish = (ctx, term) =>
          ctx.db
            .query("recipes")
            .withSearchIndex("search_en", (q) => q.search("search.en", term))
            .take(10);
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("convex/agent/tools/findDish.ts:4");
  });

  it("rejects a read that asks for the archived rows instead", () => {
    const { code } = runCheck(SCRIPT, {
      "convex/functions/recipes/listDeleted.ts": `
        export const listDeleted = (ctx, userId) =>
          ctx.db
            .query("recipes")
            .withIndex("by_user_and_is_archived", (q) => q.eq("userId", userId).eq("isArchived", true))
            .collect();
      `,
    });

    expect(code).toBe(1);
  });

  /** A helper can narrow on the caller's behalf, but nothing here can see into it. */
  it("rejects a narrowing hidden in a helper", () => {
    const { code } = runCheck(SCRIPT, {
      "convex/functions/recipes/searchHidden.ts": `
        const live = (filter) => filter.eq("isArchived", false);
        export const searchHidden = (ctx, term) =>
          ctx.db
            .query("recipes")
            .withSearchIndex("search_en", (q) => live(q.search("search.en", term)))
            .take(10);
      `,
    });

    expect(code).toBe(1);
  });

  it("rejects a query with no index read at all", () => {
    const { code } = runCheck(SCRIPT, {
      "convex/router/recipes/everything.ts": `
        export const everything = (ctx) => ctx.db.query("recipes").take(100);
      `,
    });

    expect(code).toBe(1);
  });
});

describe("what it lets through", () => {
  it("accepts an index read narrowed to live rows", () => {
    const result = runCheck(SCRIPT, {
      "convex/functions/recipes/listForUser.ts": `
        export const listForUser = (ctx, { userId, paginationOpts }) =>
          ctx.db
            .query("recipes")
            .withIndex("by_user_and_is_archived", (q) => q.eq("userId", userId).eq("isArchived", false))
            .order("desc")
            .paginate(paginationOpts);
      `,
    });

    expect(passed(result)).toBe(true);
  });

  it("accepts a search narrowed to live rows before the rest of its filters", () => {
    const result = runCheck(SCRIPT, {
      "convex/functions/recipes/searchForUser.ts": `
        export const titles = (ctx, term, scope) =>
          ctx.db
            .query("recipes")
            .withSearchIndex("search_title_en", (q) =>
              _narrow(q.search("title.values.en", term).eq("isArchived", false), scope),
            )
            .take(24);
      `,
    });

    expect(passed(result)).toBe(true);
  });

  it("accepts an allowlisted reader, which needs every row", () => {
    const result = runCheck(SCRIPT, {
      "convex/functions/recipes/findCatalogBySource.ts": `
        export const findCatalogBySource = (ctx, paginationOpts) =>
          ctx.db
            .query("recipes")
            .withIndex("by_user", (q) => q.eq("userId", undefined))
            .paginate(paginationOpts);
      `,
    });

    expect(passed(result)).toBe(true);
  });

  it("ignores other tables, point reads and tests", () => {
    const result = runCheck(SCRIPT, {
      "convex/functions/recipes/loadRecipe.ts": `
        export const load = async (ctx, id) => {
          const recipe = await ctx.db.get(id);
          const lines = await ctx.db
            .query("recipeIngredients")
            .withIndex("by_recipe", (q) => q.eq("recipeId", id))
            .collect();
          return { recipe, lines };
        };
      `,
      "convex/functions/recipes/__tests__/seed.test.ts": `
        const all = (t) => t.run((ctx) => ctx.db.query("recipes").collect());
      `,
    });

    expect(passed(result)).toBe(true);
  });
});
