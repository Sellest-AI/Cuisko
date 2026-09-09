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
    expect(output).toContain("sanctioned builder");
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
    expect(output).toContain("sanctioned builder");
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
    expect(output).toContain("sanctioned builder");
  });

  /**
   * The shape `saveRecipe` and the backfill both use: a wrapper reads the rows, the serializer
   * formats the blob, and the value reaches the insert through a local `const`. Trusting it means
   * tracing the identifier back to the call that made it.
   *
   * Note there is no allowlist entry for `recipeSearchText` anywhere — it is trusted because the
   * module it comes from imports the serializer, which is what lets a new wrapper be written
   * without editing this check.
   */
  it("accepts a shorthand assignment traced back to a wrapper module", () => {
    const { code } = runCheck("c11-derived-search-fields.mjs", {
      "convex/schema/recipes.ts": SCHEMA,
      "convex/functions/recipes/recipeSearchText.ts": `
        import { searchTextOf } from "@shared/search";
        export const recipeSearchText = async (ctx, args) => ({ en: searchTextOf(args.names) });
      `,
      "convex/functions/recipes/writeIt.ts": `
        import { recipeSearchText } from "./recipeSearchText";
        export const write = async (ctx) => {
          const search = await recipeSearchText(ctx, {});
          await ctx.db.insert("recipes", { search });
        };
      `,
    });

    expect(code).toBe(0);
  });
});

describe("where the value came from, not what the file imports", () => {
  /**
   * The hole that motivated tracing the value. Trust used to be decided per FILE: this one imports
   * the serializer, so everything in it was waved through — including a blob a local helper joined
   * one call away, where the assignment-site check for inline assembly cannot see it. That is
   * exactly the writer the rule exists to reject, passing green.
   */
  it("rejects a blob built by a local helper in a file that imports the serializer", () => {
    const { code, output } = runC11(`
      import { searchTextOf } from "@shared/search";

      const myOwnBlob = (terms) => terms.join(" ");

      export const write = async (ctx, terms, other) => {
        await ctx.db.insert("ingredients", { search: { en: searchTextOf(other) } });
        await ctx.db.insert("recipes", { search: { en: myOwnBlob(terms) } });
      };
    `);

    expect(code).toBe(1);
    expect(output).toContain("sanctioned builder");
  });

  /** A name that resolves to no module in the repo is a package, and no package is a builder. */
  it("rejects a wrapper imported from a module that never composes the serializer", () => {
    const { code } = runCheck("c11-derived-search-fields.mjs", {
      "convex/schema/recipes.ts": SCHEMA,
      "convex/functions/recipes/blobbery.ts": `
        export const blobbery = (terms) => terms.join(" ");
      `,
      "convex/functions/recipes/writeIt.ts": `
        import { blobbery } from "./blobbery";
        export const write = async (ctx, terms) => {
          await ctx.db.insert("recipes", { search: { en: blobbery(terms) } });
        };
      `,
    });

    expect(code).toBe(1);
  });

  /** Half a blob is still a blob nobody can search: every locale has to come from the builder. */
  it("rejects an object literal where only one locale went through the serializer", () => {
    const { code } = runC11(`
      import { searchTextOf } from "@shared/search";
      export const write = async (ctx, terms, raw) => {
        await ctx.db.insert("recipes", { search: { en: searchTextOf(terms), fr: raw } });
      };
    `);

    expect(code).toBe(1);
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
      import { searchTextOf } from "@shared/search";
      export const write = async (ctx, terms) => {
        await ctx.db.insert("recipes", {
          title: { values: { en: "Soupe" }, meta: {} },
          search: { en: searchTextOf(terms) },
        });
      };
    `);

    expect(code).toBe(0);
  });

  /** A fixture states a literal input; forcing it through the serializer tests the serializer. */
  it("ignores a test fixture writing the blob literally", () => {
    const { code } = runCheck("c11-derived-search-fields.mjs", {
      "convex/schema/recipes.ts": SCHEMA,
      "convex/functions/recipes/writeIt.ts": `
        import { searchTextOf } from "@shared/search";
        export const write = async (ctx, terms) => {
          await ctx.db.insert("recipes", { search: { en: searchTextOf(terms) } });
        };
      `,
      "convex/functions/recipes/__tests__/fixture.ts": `
        export const fixture = { search: { en: "x" } };
      `,
    });

    expect(code).toBe(0);
  });
});

/**
 * One source of truth per table. The writer is discovered as the module that inserts the table, not
 * dictated by a filename — what is asserted is that exactly one exists, which is the property a
 * naming convention was only ever a proxy for.
 */
describe("one writer per governed table", () => {
  const WRITER = `
    import { searchTextOf } from "@shared/search";
    export const write = async (ctx, terms) => {
      await ctx.db.insert("recipes", { search: { en: searchTextOf(terms) } });
    };
  `;

  it("accepts a single module inserting the table", () => {
    const { code } = runC11(WRITER);

    expect(code).toBe(0);
  });

  it("rejects a second module inserting the same governed table", () => {
    const { code, output } = runCheck("c11-derived-search-fields.mjs", {
      "convex/schema/recipes.ts": SCHEMA,
      "convex/functions/recipes/writeIt.ts": WRITER,
      "convex/functions/recipes/writeItAgain.ts": WRITER,
    });

    expect(code).toBe(1);
    expect(output).toContain("inserted from 2 modules");
  });

  /**
   * The fail-open case, and the reason this rule is worth more than the ones above it: a table can
   * satisfy every other assertion in C11 by having no writer at all, and the ✅ then means nothing.
   */
  it("rejects a governed table that nothing inserts", () => {
    const { code, output } = runCheck("c11-derived-search-fields.mjs", {
      "convex/schema/recipes.ts": SCHEMA,
      "convex/functions/recipes/readIt.ts": `
        export const read = async (ctx, id) => ctx.db.get(id);
      `,
    });

    expect(code).toBe(1);
    expect(output).toContain("no module inserts the table");
  });

  /**
   * `search` is optional on `ingredients`, so an insert that simply omits it type-checks clean and
   * writes a row no search can reach. This is the only rule here that catches that.
   */
  it("rejects an insert that omits the derived field entirely", () => {
    const { code, output } = runC11(`
      export const write = async (ctx, title) => {
        await ctx.db.insert("recipes", { title });
      };
    `);

    expect(code).toBe(1);
    expect(output).toContain("without its derived field");
  });

  /** A payload assembled elsewhere is UNKNOWN, not empty — reporting it would be a false finding. */
  it("does not claim a spread payload is missing the field", () => {
    const { code } = runC11(`
      import { searchTextOf } from "@shared/search";
      export const write = async (ctx, rest, terms) => {
        await ctx.db.insert("recipes", { ...rest, search: { en: searchTextOf(terms) } });
      };
    `);

    expect(code).toBe(0);
  });

  /** The `seedIngredients` shape: the payload is built into a const and inserted a few lines down. */
  it("follows a payload held in a local constant", () => {
    const { code } = runC11(`
      import { searchTextOf } from "@shared/search";
      export const write = async (ctx, terms) => {
        const row = { search: { en: searchTextOf(terms) } };
        await ctx.db.insert("recipes", row);
      };
    `);

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
