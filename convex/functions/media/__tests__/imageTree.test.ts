import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import schema from "../../../schema";
import { scheduleImageTreeDeletion } from "../imageTree";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

const imageRow = (url: string) => ({
  hasAlpha: false,
  key: `public/${url}`,
  url,
  width: 1024,
  height: 1024,
  size: 500_000,
  mimeType: "image/webp",
  tags: ["IMAGE" as const],
  updatedAt: Date.now(),
});

const scheduled = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

describe("scheduleImageTreeDeletion", () => {
  /**
   * Aimed at the base render, not at the cut-out handed in: deleting the base cascades to the
   * cut-out, while aiming at the cut-out would strand the render in the bucket forever.
   */
  test("schedules the base of the image it is given", async () => {
    const t = convexTest(schema, modules);

    const { cutout, base } = await t.run(async (ctx) => {
      const base = await ctx.db.insert("images", imageRow("base.webp"));
      const cutout = await ctx.db.insert("images", imageRow("cutout.webp"));
      await ctx.db.insert("imageObjects", {
        imageId: cutout, baseImageId: base, x: 0, y: 0, updatedAt: Date.now(),
      });
      return { cutout, base };
    });

    await t.run((ctx) => scheduleImageTreeDeletion(ctx, cutout));

    const jobs = await scheduled(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.name).toContain("deleteOne");
    expect(jobs[0]?.args[0]).toEqual({ imageId: base });
  });

  /**
   * An image that was never a generated pair — a recipe cover — has no `imageObjects` row, so it
   * is its own root. Scheduling nothing here would leak every cover a new one replaces.
   */
  test("schedules the image itself when it has no base", async () => {
    const t = convexTest(schema, modules);

    const cover = await t.run((ctx) => ctx.db.insert("images", imageRow("cover.webp")));

    await t.run((ctx) => scheduleImageTreeDeletion(ctx, cover));

    const jobs = await scheduled(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.args[0]).toEqual({ imageId: cover });
  });
});
