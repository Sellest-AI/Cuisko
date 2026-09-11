import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";

import { api } from "../../../../_generated/api";
import schema from "../../../../schema";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

/**
 * Imports the module under test before any test is timed, so the first one is not billed for the
 * backend graph beneath it against Vitest's 5s timeout. See router/ingredients/__tests__/resolve.test.ts
 * for the measurement. Stops at the `.` so a `"use node"` sibling stays out.
 */
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/media/images/uploadMany."))
      .map(([, load]) => load()),
  ),
);

/**
 * The gate, and only the gate. Everything past it — `sharp`, the S3 client, an outbound fetch —
 * is real I/O this project does not stub, so what is assertable here is that an unauthenticated
 * caller never reaches any of it. That is also the check that matters: `uploadMany.authed` is the
 * one public door into the upload pipeline, and `_internal` beside it is exempt because Convex
 * refuses client calls to internal functions at the platform level.
 */
describe("router/media/images/uploadMany", () => {
  test("`authed` rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.router.media.images.uploadMany.authed, {
        images: [{ url: "https://cdn.test/a.webp" }],
      }),
    ).rejects.toThrow();
  });

  test("`authed` rejects an identity that resolves to no user", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t
        .withIdentity({ subject: "k1000000000000000000000000000000|test-session" })
        .action(api.router.media.images.uploadMany.authed, {
          images: [{ url: "https://cdn.test/a.webp" }],
        }),
    ).rejects.toThrow();
  });

  test("rejects an empty batch from an unauthenticated caller too", async () => {
    const t = convexTest(schema, modules);

    // Nothing to upload is still not permission to call it.
    await expect(
      t.action(api.router.media.images.uploadMany.authed, { images: [] }),
    ).rejects.toThrow();
  });

  test("rejects before doing any work, leaving no rows behind", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.router.media.images.uploadMany.authed, { images: [{ base64: "AAAA" }] }),
    ).rejects.toThrow();

    await t.run(async (ctx) => {
      expect(await ctx.db.query("images").collect()).toEqual([]);
    });
  });
});
