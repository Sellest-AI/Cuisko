import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../_generated/api";
import schema from "../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/** @convex-dev/auth encodes identity as `<userId>|<sessionId>`; getAuthUserId reads the first half. */
const asUser = (userId: string) => ({ subject: `${userId}|test-session` });

/**
 * The two halves of `importOneNode` that leave the process, replaced wholesale — no `importOriginal`,
 * so `recipe-scrapers` and its Node-only dependency graph are never loaded into this runtime. What
 * this lets the last test see is the boundary above them: the address `_extract` hands down for the
 * fetch, and the draft it hands back up.
 */
const fetchPage = vi.hoisted(() => vi.fn());
const scrapePage = vi.hoisted(() => vi.fn());

vi.mock("@convex/lib/scraping/fetchPage", () => ({ fetchPage }));
vi.mock("@convex/lib/scraping/scrapePage", () => ({ scrapePage }));

let t: ReturnType<typeof convexTest>;

/**
 * Deliberately narrow — see resolve.test.ts for the measurement. `importOneNode` is left out of the
 * warm set on purpose: it is a `"use node"` module and the refusal tests must never reach it, which
 * is half of what they prove. Only the last test crosses into it, over the mocks above.
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
  fetchPage.mockReset();
  fetchPage.mockResolvedValue("<html></html>");
  scrapePage.mockReset();
  scrapePage.mockResolvedValue({
    title: "Tarte",
    description: "",
    yields: "4 servings",
    ingredients: [{ name: null, items: [{ value: "1 pâte" }] }],
    instructions: [{ name: null, items: [{ value: "Cuire." }] }],
  });
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

  /**
   * The seam this slice adds. The draft is what the editor seeds itself from and later hands to
   * `createOne`, so the address it carries is the one that reaches the row — and it is the CANONICAL
   * one, trackers and fragment gone, because that spelling is what a later dedupe will key on. The
   * fetch is made with the same spelling: a share button's params are not part of the page.
   */
  test("hands back the draft carrying the canonical form of the requested url", async () => {
    const user = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "Cook" });
      await ctx.db.insert("usersExtended", { userId, role: "USER", updatedAt: Date.now() });

      return userId;
    });

    const draft = await t
      .withIdentity(asUser(user))
      .action(api.router.recipes.importOne.authed, {
        url: "https://example.com/tarte?id=7&utm_source=fb&fbclid=x#comments",
      });

    expect(draft.sourceUrl).toBe("https://example.com/tarte?id=7");
    expect(draft.title).toBe("Tarte");
    expect(fetchPage).toHaveBeenCalledWith("https://example.com/tarte?id=7");
  });
});
