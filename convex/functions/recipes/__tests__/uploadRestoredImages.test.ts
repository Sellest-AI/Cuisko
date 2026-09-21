import { describe, expect, it, vi } from "vitest";

import type { Id } from "@convex/_generated/dataModel";

import { type ImageUpload, uploadRestoredImages } from "../uploadRestoredImages";

const RECIPE = {
  images: {
    cover: { url: "cover.webp" },
    plate: { url: "plate.png", base: { url: "plate-base.webp" }, x: 3, y: 4 },
  },
};
const PHOTOS = { cover: "COVER", plate: "PLATE", plateBase: "BASE" };

/** An upload that hands out `id-<base64>` and fails for every payload named in `failing`. */
const uploader = (...failing: string[]) =>
  vi.fn(async ({ base64 }: ImageUpload) => {
    if (failing.includes(base64)) throw new Error("bucket down");

    return `id-${base64}` as Id<"images">;
  });

describe("uploadRestoredImages", () => {
  it("uploads the cover, the base, then the cut-out on that base at the exported offset", async () => {
    const upload = uploader();

    const result = await uploadRestoredImages(RECIPE, PHOTOS, upload);

    expect(upload.mock.calls.map(([image]) => image)).toEqual([
      { base64: "COVER" },
      { base64: "BASE" },
      { base64: "PLATE", object: { baseImageId: "id-BASE", x: 3, y: 4 } },
    ]);
    expect(result).toEqual({
      uploaded: { coverImageId: "id-COVER", plateImageId: "id-PLATE" },
      kept: ["id-COVER", "id-PLATE"],
      stranded: [],
    });
  });

  it("drops a cover that fails and keeps the plate", async () => {
    const result = await uploadRestoredImages(RECIPE, PHOTOS, uploader("COVER"));

    expect(result.uploaded).toEqual({ coverImageId: undefined, plateImageId: "id-PLATE" });
    expect(result.kept).toEqual(["id-PLATE"]);
  });

  it("drops the plate without trying the cut-out when its base fails", async () => {
    const upload = uploader("BASE");

    const result = await uploadRestoredImages(RECIPE, PHOTOS, upload);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ uploaded: { coverImageId: "id-COVER" }, kept: ["id-COVER"], stranded: [] });
  });

  it("drops the plate and strands its base when the cut-out fails", async () => {
    const result = await uploadRestoredImages(RECIPE, PHOTOS, uploader("PLATE"));

    expect(result.uploaded.plateImageId).toBeUndefined();
    expect(result.kept).toEqual(["id-COVER"]);
    expect(result.stranded).toEqual(["id-BASE"]);
  });

  it("uploads no plate when a half of it was not sent", async () => {
    const upload = uploader();

    const result = await uploadRestoredImages(RECIPE, { cover: "COVER", plate: "PLATE" }, upload);

    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.kept).toEqual(["id-COVER"]);
  });

  it("uploads nothing when no photo was sent", async () => {
    const upload = uploader();

    expect(await uploadRestoredImages(RECIPE, {}, upload)).toEqual({ uploaded: {}, kept: [], stranded: [] });
    expect(upload).not.toHaveBeenCalled();
  });
});
