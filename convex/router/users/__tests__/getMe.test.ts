import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

const seedUser = async (t: ReturnType<typeof convexTest>, withExtended = true) =>
  t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { name: "Franck", email: "f@example.com" });
    if (withExtended) {
      await ctx.db.insert("usersExtended", { userId: id, role: "USER", updatedAt: Date.now() });
    }
    return id;
  });

describe("router/users/getMe", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.router.users.getMe.authed, {})).rejects.toThrow();
  });

  test("returns the caller's own identity", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    expect(await t.withIdentity(asUser(userId)).query(api.router.users.getMe.authed, {})).toEqual({
      id: userId,
      email: "f@example.com",
      role: "USER",
    });
  });

  /**
   * A user row with no `usersExtended` sibling is a half-created account. `loadUser` returns null
   * for it and `requireUser` turns that into UNAUTHENTICATED — so a sign-in that raced the
   * afterUserCreatedOrUpdated callback fails closed rather than handing back a partial identity.
   */
  test("rejects a signed-in user whose extended row is missing", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, false);

    await expect(
      t.withIdentity(asUser(userId)).query(api.router.users.getMe.authed, {}),
    ).rejects.toThrow();
  });
});
