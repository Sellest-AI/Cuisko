import { convexTest } from "convex-test";
import { getFunctionName } from "convex/server";
import { describe, expect, test } from "vitest";

import { internal } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored on purpose. A relative pattern (`../../../**`) makes Vite emit shortest-relative
// keys — `../getAccount.ts` for a near file but `../../../_generated/api.js` for a far one — and
// convex-test resolves functions by gluing one prefix onto the function path, so the near files
// silently go missing. A leading `/` is resolved against the Vite root, giving every key the same
// `/convex/` prefix. `*.*s` (not `*.ts`) so the generated `.js` modules come along too.
const modules = import.meta.glob("/convex/**/*.*s");

describe("router/users/getAccount", () => {
  /**
   * `procedures.ts` reaches this function through `makeFunctionReference("router/users/
   * getAccount:_internal")` — a string, so the compiler cannot check it. Moving or renaming
   * the file would break authentication for every action, silently. This is the check.
   */
  test("resolves at the path procedures.ts hard-codes", () => {
    expect(getFunctionName(internal.router.users.getAccount._internal)).toBe(
      "router/users/getAccount:_internal",
    );
  });

  test("merges the auth-owned user row with our extended row", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });
      await ctx.db.insert("usersExtended", { userId: id, role: "USER", updatedAt: Date.now() });
      return id;
    });

    const user = await t.query(internal.router.users.getAccount._internal, { userId });

    expect(user).not.toBeNull();
    expect(user?._id).toBe(userId);
    expect(user?.name).toBe("Franck");
    expect(user?.role).toBe("USER");
    expect(user?._idExtended).toBeDefined();
  });

  test("returns null for a user with no extended row — a half-created account is not an identity", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Orphan" }));

    expect(await t.query(internal.router.users.getAccount._internal, { userId })).toBeNull();
  });
});
