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
      .filter(([path]) => path.startsWith("/convex/router/media/images/getOne."))
      .map(([, load]) => load()),
  ),
);

const seedImage = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) =>
    ctx.db.insert("images", {
      hasAlpha: false,
      key: "public/a.webp",
      url: "https://cdn.test/a.webp",
      width: 1024,
      height: 1024,
      size: 500_000,
      mimeType: "image/webp",
      tags: ["IMAGE"],
      updatedAt: Date.now(),
    }),
  );

describe("router/media/images/getOne", () => {
  describe("access", () => {
    /** An image is public content — the anonymous reader is the grocery grid before sign-in. */
    test("`anon` needs no identity at all", async () => {
      const t = convexTest(schema, modules);
      const id = await seedImage(t);

      const image = await t.query(api.router.media.images.getOne.anon, { id });

      expect(image?.url).toBe("https://cdn.test/a.webp");
    });
  });

  test("returns null for an image that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const id = await seedImage(t);
    await t.run((ctx) => ctx.db.delete(id));

    expect(await t.query(api.router.media.images.getOne.anon, { id })).toBeNull();
  });
});
