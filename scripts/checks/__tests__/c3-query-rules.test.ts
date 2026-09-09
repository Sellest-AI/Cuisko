/**
 * C3's own tests.
 *
 * S3 is the rule this project keeps calling the one people get wrong, and it is worth being precise
 * about why: Convex paginates the INDEX READ and applies `.filter()` to the resulting page, so a
 * page asked for 24 documents can come back with 3 while still reporting `isDone: false`. Infinite
 * scroll stops early and silently hides rows. Nothing throws. The predecessor had the right index
 * defined and used `.filter()` anyway.
 *
 * That shape is only ever caught by a check, which makes C3 going quiet the same kind of invisible
 * as the bug it hunts.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

const runC3 = (files: Record<string, string>) => runCheck("c3-query-rules.mjs", files);

/** S1 and S3 are checked across all of convex/, so a handler is the natural fixture. */
const handler = (body: string) =>
  runC3({ "convex/functions/recipes/list.ts": `export const run = async (ctx) => { ${body} };` });

const schema = (body: string) => runC3({ "convex/schema/fixture.ts": body });

afterEach(cleanupTrees);

describe("S1 — every query goes through an index", () => {
  it("rejects a bare ctx.db.query()", () => {
    const { code, output } = handler('return ctx.db.query("recipes").collect();');

    expect(code).toBe(1);
    expect(output).toContain("S1 — ctx.db.query() is not immediately followed by .withIndex()");
  });

  it("accepts withIndex and withSearchIndex", () => {
    expect(handler('return ctx.db.query("r").withIndex("by_user").collect();').code).toBe(0);
    expect(handler('return ctx.db.query("r").withSearchIndex("search_en").collect();').code).toBe(0);
  });

  it("rejects an index applied after another operator rather than immediately", () => {
    // `.filter().withIndex()` reads as indexed and is not: the scan happens first.
    const { code, output } = handler('return ctx.db.query("r").filter(q => q).withIndex("by_user");');

    expect(code).toBe(1);
    expect(output).toContain("S1");
  });

  it("ignores test files, which query freely against a seeded fixture", () => {
    const { code } = runC3({
      "convex/router/__tests__/list.test.ts": 'ctx.db.query("recipes").collect();',
    });

    expect(code).toBe(0);
  });
});

describe("S3 — filter never combines with paginate", () => {
  it("rejects filter and paginate in one chain", () => {
    const { code, output } = handler(
      'return ctx.db.query("r").withIndex("by_user").filter(q => q).paginate(opts);',
    );

    expect(code).toBe(1);
    expect(output).toContain("S3 — .filter() combined with .paginate()");
  });

  it("accepts filter without paginate, and paginate without filter", () => {
    expect(handler('return ctx.db.query("r").withIndex("by_user").filter(q => q).collect();').code)
      .toBe(0);
    expect(handler('return ctx.db.query("r").withIndex("by_user").paginate(opts);').code).toBe(0);
  });
});

describe("S2 — index names describe their fields", () => {
  it("rejects a name that does not match its fields", () => {
    const { code, output } = schema(
      'export const t = defineTable({}).index("by_owner", ["userId"]);',
    );

    expect(code).toBe(1);
    expect(output).toContain('S2 — index "by_owner" does not match its fields [userId]');
  });

  it("accepts both the bare and the _id spelling of a foreign key", () => {
    expect(schema('export const t = defineTable({}).index("by_user", ["userId"]);').code).toBe(0);
    expect(schema('export const t = defineTable({}).index("by_user_id", ["userId"]);').code).toBe(0);
  });

  it("accepts a compound name in field order, and rejects it reversed", () => {
    const fields = '["householdId", "ingredientId"]';

    expect(schema(`export const t = defineTable({}).index("by_household_and_ingredient", ${fields});`).code)
      .toBe(0);
    const reversed = schema(
      `export const t = defineTable({}).index("by_ingredient_and_household", ${fields});`,
    );

    expect(reversed.code).toBe(1);
    expect(reversed.output).toContain('S2 — index "by_ingredient_and_household" does not match');
  });

  it("accepts dropping the is prefix on a boolean", () => {
    expect(schema('export const t = defineTable({}).index("by_public", ["isPublic"]);').code).toBe(0);
  });

  it("requires a search index to be named search_<field>", () => {
    const { code, output } = schema(
      'export const t = defineTable({}).searchIndex("by_name", { searchField: "name" });',
    );

    expect(code).toBe(1);
    expect(output).toContain('S2 — search index "by_name" is not named search_<field>');
  });
});
