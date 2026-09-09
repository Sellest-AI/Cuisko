/**
 * C4's own tests.
 *
 * A check script fails OPEN: if `isJoinTable` stopped matching anything, or the S5 branch stopped
 * pushing a finding, C4 would print ✅ against every schema forever and the rule would quietly
 * cease to exist. Nothing about the repo going green would look different. So the thing worth
 * pinning is not "C4 passes on our schema" — it is "C4 still fails on the shapes it exists to
 * reject".
 *
 * Each case runs the real script the way `pnpm verify` runs it, against a throwaway tree aimed at
 * by CHECK_ROOT (see `scripts/checks/_lib.mjs`). The scripts end in `process.exit`, so there is no
 * importable surface to assert on — the exit code and the printed finding *are* the contract.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

/** Every fixture needs one, because C4 parses the cascade registry before it reads any table. */
const NO_CASCADE = "export const CASCADE = {};";

afterEach(cleanupTrees);

/** Runs C4 against a one-off tree holding `schema` and `cascade`. */
const runC4 = (schema: string, cascade: string = NO_CASCADE) =>
  runCheck("c4-schema-invariants.mjs", {
    "convex/schema/fixture.ts": schema,
    "convex/functions/cascade.ts": cascade,
  });

const table = (name: string, fields: string, indexes = '.index("by_a", ["a"])') =>
  `import { defineTable } from "convex/server";
   import { v } from "convex/values";
   export const ${name} = defineTable({ ${fields} })${indexes};`;

describe("S5 — updatedAt on a join table", () => {
  it("rejects a join table that declares updatedAt", () => {
    const { code, output } = runC4(
      table(
        "householdUsers",
        'householdId: v.id("households"), userId: v.id("users"), updatedAt: v.number(),',
        '.index("by_household", ["householdId"]).index("by_user", ["userId"])',
      ),
      `export const CASCADE = {
         households: [{ table: "householdUsers", index: "by_household", field: "householdId" }],
         users: [{ table: "householdUsers", index: "by_user", field: "userId" }],
       };`,
    );

    expect(code).toBe(1);
    expect(output).toContain('S5 — join table "householdUsers" declares "updatedAt"');
  });

  it("accepts a join table with no updatedAt and no @immutable marker", () => {
    const { code, output } = runC4(
      table(
        "householdUsers",
        'householdId: v.id("households"), userId: v.id("users"),',
        '.index("by_household", ["householdId"]).index("by_user", ["userId"])',
      ),
      `export const CASCADE = {
         households: [{ table: "householdUsers", index: "by_household", field: "householdId" }],
         users: [{ table: "householdUsers", index: "by_user", field: "userId" }],
       };`,
    );

    expect(code).toBe(0);
    expect(output).toContain("✅");
  });

  it("still allows a join table to carry a position, which is not a mutation", () => {
    const { code } = runC4(
      table(
        "recipeIngredients",
        'recipeId: v.id("recipes"), ingredientId: v.id("ingredients"), position: v.number(),',
        '.index("by_recipe", ["recipeId"]).index("by_ingredient", ["ingredientId"])',
      ),
      `export const CASCADE = {
         recipes: [{ table: "recipeIngredients", index: "by_recipe", field: "recipeId" }],
         ingredients: [{ table: "recipeIngredients", index: "by_ingredient", field: "ingredientId" }],
       };`,
    );

    expect(code).toBe(0);
  });

  it("does not read a table carrying its own data as a join table", () => {
    // Two foreign keys, but `quantity` is state that changes — cellarItems is the shape the
    // join-table branch must NOT swallow, or S5 would stop demanding updatedAt on half the schema.
    const { code, output } = runC4(
      table(
        "cellarItems",
        'householdId: v.id("households"), ingredientId: v.id("ingredients"), quantity: v.number(),',
        '.index("by_household", ["householdId"]).index("by_ingredient", ["ingredientId"])',
      ),
      `export const CASCADE = {
         households: [{ table: "cellarItems", index: "by_household", field: "householdId" }],
         ingredients: [{ table: "cellarItems", index: "by_ingredient", field: "ingredientId" }],
       };`,
    );

    expect(code).toBe(1);
    expect(output).toContain('S5 — table "cellarItems" has no "updatedAt"');
  });
});

describe("S5 — updatedAt elsewhere", () => {
  it("rejects a mutable table with neither updatedAt nor a marker", () => {
    const { code, output } = runC4(table("households", "name: v.string(), a: v.string(),"));

    expect(code).toBe(1);
    expect(output).toContain('S5 — table "households" has no "updatedAt"');
  });

  it("accepts a table exempted by @immutable", () => {
    const { code } = runC4(
      `import { defineTable } from "convex/server";
       import { v } from "convex/values";
       /** @immutable an audit row is written once and never edited. */
       export const auditLog = defineTable({ a: v.string() }).index("by_a", ["a"]);`,
    );

    expect(code).toBe(0);
  });
});

describe("S7 and S10 still bite", () => {
  it("rejects a table with no index at all", () => {
    const { code, output } = runC4(
      table("households", "name: v.string(), updatedAt: v.number(),", ""),
    );

    expect(code).toBe(1);
    expect(output).toContain('S7 — table "households" declares no index');
  });

  it("rejects a foreign key with no CASCADE entry", () => {
    const { code, output } = runC4(
      table(
        "cellarItems",
        'householdId: v.id("households"), quantity: v.number(), updatedAt: v.number(),',
        '.index("by_household", ["householdId"])',
      ),
    );

    expect(code).toBe(1);
    expect(output).toContain('S10 — "cellarItems.householdId" has no CASCADE entry');
  });
});
