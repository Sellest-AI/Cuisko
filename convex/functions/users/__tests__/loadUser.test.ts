import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import schema from "../../../schema";
import { loadUser } from "../loadUser";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

describe("functions/users/loadUser", () => {
  test("merges the auth row and the extended row", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });
      await ctx.db.insert("usersExtended", { userId: id, role: "USER", updatedAt: Date.now() });
      return id;
    });

    const user = await t.run((ctx) => loadUser(ctx, userId));

    expect(user).toMatchObject({ _id: userId, email: "f@example.com", role: "USER" });
  });

  /**
   * An anonymized account keeps both rows, so its recipes and kitchen stay attributable. Reading it
   * back as an identity would let a session that outlived the purge act as the tombstone.
   */
  test("returns null for an anonymized account, though both rows still exist", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {});
      await ctx.db.insert("usersExtended", {
        userId: id,
        role: "USER",
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return id;
    });

    expect(await t.run((ctx) => loadUser(ctx, userId))).toBeNull();
  });

  test("a deletion that is only pending does not stop the account from acting", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { name: "Franck" });
      await ctx.db.insert("usersExtended", {
        userId: id,
        role: "USER",
        deletionDueAt: Date.now() + 1000,
        updatedAt: Date.now(),
      });
      return id;
    });

    expect(await t.run((ctx) => loadUser(ctx, userId))).not.toBeNull();
  });

  test("returns null for a half-created account", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Franck" }));

    expect(await t.run((ctx) => loadUser(ctx, userId))).toBeNull();
  });
});
