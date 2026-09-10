import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

let t: ReturnType<typeof convexTest>;

/**
 * Deliberately narrow — see resolve.test.ts for the measurement. `importOneNode` is left out of the
 * warm set on purpose: it is a `"use node"` module and nothing in this file should reach it, which
 * is half of what the second test below proves.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/recipes/importOne."))
      .map(([, load]) => load()),
  ),
);

beforeEach(() => {
  t = convexTest(schema, modules);
  /**
   * The whole point of this endpoint is that it makes our servers fetch a URL a caller chose, so a
   * test suite that runs on every commit must not be able to make one. Every fetch here is a
   * failure, which means a test that passes has proven the refusal happened BEFORE the fetch — not
   * that the fetch happened to fail.
   */
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network in tests"))));
});

describe("router/recipes/importOne", () => {
  /**
   * The gate (C5). `authed` is `authed` rather than `anon` precisely because it spends our
   * bandwidth on a host the caller named, so the rejection has to land in the procedure wrapper,
   * before any of that is spent.
   */
  test("rejects an unauthenticated caller", async () => {
    await expect(
      t.action(api.router.recipes.importOne.authed, { url: "https://example.com/tarte" }),
    ).rejects.toThrow();
  });

  test("rejects an authenticated caller who is not a known user", async () => {
    const ghost = await t.run((ctx) => ctx.db.insert("users", { name: "Ghost" }));
    await t.run((ctx) => ctx.db.delete(ghost));

    await expect(
      t
        .withIdentity(asUser(ghost))
        .action(api.router.recipes.importOne.authed, { url: "https://example.com/tarte" }),
    ).rejects.toThrow();
  });

  /**
   * The screen validates too, and that is not what this covers: this export is callable without the
   * screen. A refusal here costs nothing, which is the reason it is stated twice.
   */
  describe("a url that is not one", () => {
    const refuses = async (url: string) => {
      const user = await t.run((ctx) => ctx.db.insert("users", { name: "Cook" }));

      await expect(
        t.withIdentity(asUser(user)).action(api.router.recipes.importOne.authed, { url }),
      ).rejects.toThrow();
    };

    test("refuses a scheme that is not http, before any fetch", () => refuses("ftp://example.com/x"));

    test("refuses javascript, before any fetch", () => refuses("javascript:alert(1)"));

    test("refuses empty text, before any fetch", () => refuses("   "));
  });
});
