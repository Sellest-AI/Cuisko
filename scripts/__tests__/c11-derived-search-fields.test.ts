/**
 * C11's own tests.
 *
 * A check script fails OPEN. If the `vLocalizedText` marker stopped matching, or the governed set
 * came back empty, C11 would print ✅ against every schema forever and ADR 0011 would quietly cease
 * to exist — with nothing about the repo going green looking any different. So what is pinned here
 * is not "C11 passes on our schema", it is "C11 still fails on the shapes it exists to reject", and
 * above all that it still governs anything at all.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

afterEach(cleanupTrees);

/** A schema with one derived blob (`search`) and one authored indexed field (`title`). */
const SCHEMA = `
  import { defineTable } from "convex/server";
  import { v } from "convex/values";
  import { vLocalized, vLocalizedText } from "./i18n";

  export const recipes = defineTable({
    title: vLocalized,
    search: v.optional(vLocalizedText),
  })
    .searchIndex("search_en", { searchField: "search.en" })
    .searchIndex("search_title_en", { searchField: "title.values.en" });
`;

const runC11 = (writer: string, file = "convex/functions/recipes/writeIt.ts") =>
  runCheck("c11-derived-search-fields.mjs", {
    "convex/schema/recipes.ts": SCHEMA,
    [file]: writer,
  });

describe("a derived blob built at the call site", () => {
  it("rejects a writer that never imports the serializer", () => {
    const { code, output } = runC11(`
      export const write = async (ctx, title) => {
        await ctx.db.insert("recipes", { title, search: { en: title } });
      };
    `);

    expect(code).toBe(1);
    expect(output).toContain("no sanctioned builder");
  });

  it.each([
    ["a .join()", 'search: { en: terms.join(" ") }'],
    ["a template literal", "search: { en: `${a} ${b}` }"],
    ["a concatenation", 'search: { en: a + " " + b }'],
  ])("rejects %s even when the file imports the serializer", (_, assignment) => {
    const { code, output } = runC11(`
      import { searchTextOf } from "@shared/search";
      export const write = async (ctx, a, b, terms) => {
        await ctx.db.insert("recipes", { ${assignment} });
      };
    `);

    expect(code).toBe(1);
    expect(output).toContain("assembled inline");
  });

  /**
   * The second hole this shipped with, and the same shape as the shorthand one below: trust was
   * decided by scanning the file's TEXT for a builder's name, so a comment naming one was enough.
   * The mention that would do it is the likeliest comment such a file could carry — an author
   * explaining why they are not using the serializer.
   */
  it("rejects a writer that only mentions a builder in a comment", () => {
    const { code, output } = runC11(`
      export const write = async (ctx, title) => {
        // Not going through recipeSearchText or @shared/search here, because reasons.
        await ctx.db.insert("recipes", { title, search: { en: title } });
      };
    `);

    expect(code).toBe(1);
    expect(output).toContain("no sanctioned builder");
  });

  it("accepts a writer that goes through the serializer", () => {
    const { code, output } = runC11(`
      import { searchTextOf } from "@shared/search";
      export const write = async (ctx, terms) => {
        await ctx.db.insert("recipes", { search: { en: searchTextOf(terms) } });
      };
    `);

    expect(code).toBe(0);
    expect(output).toContain("✅");
  });
});

describe("shorthand assignment", () => {
  /**
   * The hole the first version shipped with. `{ search }` is a ShorthandPropertyAssignment — a
   * different AST node with no initializer — so a check that inspects only PropertyAssignment
   * passes it silently. A hole in a check is worse than no check: the green tick is read as
   * evidence that the rule held.
   */
  it("rejects a shorthand assignment from a file with no sanctioned builder", () => {
    const { code, output } = runC11(`
      export const write = async (ctx, search) => {
        await ctx.db.insert("recipes", { search });
      };
    `);

    expect(code).toBe(1);
    expect(output).toContain("no sanctioned builder");
  });

  it("accepts a shorthand assignment from a file that delegates to a wrapper", () => {
    const { code } = runC11(`
      import { recipeSearchText } from "./recipeSearchText";
      export const write = async (ctx) => {
        const search = await recipeSearchText(ctx, {});
        await ctx.db.insert("recipes", { search });
      };
    `);

    expect(code).toBe(0);
  });
});

describe("what it deliberately does not govern", () => {
  /**
   * The over-reach this check had on its first run. `title` is indexed directly and is nobody's
   * denormalization — there is no serializer for a title, because a title is not derived. Governing
   * it would make the rule unfollowable and it would be turned off.
   */
  it("ignores an authored field that a search index reads directly", () => {
    const { code } = runC11(`
      export const write = async (ctx) => {
        await ctx.db.insert("recipes", { title: { values: { en: "Soupe" }, meta: {} } });
      };
    `);

    expect(code).toBe(0);
  });

  /** A fixture states a literal input; forcing it through the serializer tests the serializer. */
  it("ignores a test fixture writing the blob literally", () => {
    const { code } = runC11(
      `export const fixture = { search: { en: "x" } };`,
      "convex/functions/recipes/__tests__/fixture.ts",
    );

    expect(code).toBe(0);
  });
});

describe("the guard against governing nothing", () => {
  /**
   * The failure mode that would make every other test here pass vacuously: if the schema declares
   * a derived blob and C11 does not connect it to its index, the governed set is empty and the
   * check green-lights every writer in the repo. This asserts the wiring, not a rule.
   */
  it("still governs a blob declared with v.optional(vLocalizedText)", () => {
    const { code, output } = runC11(`
      export const write = async (ctx) => {
        await ctx.db.insert("recipes", { search: { en: "hand written" } });
      };
    `);

    expect(code).toBe(1);
    expect(output).toContain("search");
  });

  it("governs a blob declared with a bare vLocalizedText too", () => {
    const { code } = runCheck("c11-derived-search-fields.mjs", {
      "convex/schema/recipes.ts": SCHEMA.replace("v.optional(vLocalizedText)", "vLocalizedText"),
      "convex/functions/recipes/writeIt.ts": `
        export const write = async (ctx) => {
          await ctx.db.insert("recipes", { search: { en: "hand written" } });
        };
      `,
    });

    expect(code).toBe(1);
  });
});
