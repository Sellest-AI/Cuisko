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
 * by CHECK_ROOT (see `scripts/_lib.mjs`). The scripts end in `process.exit`, so there is no
 * importable surface to assert on — the exit code and the printed finding *are* the contract.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../c4-schema-invariants.mjs", import.meta.url));

/** Every fixture needs one, because C4 parses the cascade registry before it reads any table. */
const NO_CASCADE = "export const CASCADE = {};";

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
  }
});

/**
 * Runs C4 against a one-off tree containing `schema` and `cascade`.
 *
 * Returns the exit code and the combined output rather than throwing, so a case can assert on a
 * failure as easily as on a pass — a non-zero exit is the expected result in most of them.
 */
const runC4 = (schema: string, cascade: string = NO_CASCADE) => {
  const root = mkdtempSync(path.join(tmpdir(), "cuisko-c4-"));
  temporaryRoots.push(root);

  mkdirSync(path.join(root, "convex", "schema"), { recursive: true });
  mkdirSync(path.join(root, "convex", "functions"), { recursive: true });
  writeFileSync(path.join(root, "convex", "schema", "fixture.ts"), schema);
  writeFileSync(path.join(root, "convex", "functions", "cascade.ts"), cascade);

  try {
    const stdout = execFileSync(process.execPath, [SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, CHECK_ROOT: root },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { code: failure.status, output: `${failure.stdout}${failure.stderr}` };
  }
};

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
