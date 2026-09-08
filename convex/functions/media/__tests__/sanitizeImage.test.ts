import { describe, expect, test } from "vitest";

import { sanitizeImage } from "../sanitizeImage";

/**
 * `sanitizeImage` turns a variable-length list of renditions into exactly five named slots, which
 * is what every screen draws from. The interesting part is not the mapping but the FALLBACK: the
 * buckets cascade downward (`thumbnail ?? small ?? medium ?? large ?? original`), so a gap in the
 * middle of the list must resolve to something bigger rather than to nothing. A slot that came
 * back `undefined` would be a broken `<Image>` on a grid tile, not an exception anyone would see.
 */

const size = (px: number, bytes: number, url = `${px}.webp`) => ({
  url,
  width: px,
  height: px,
  size: bytes,
});

const original = { url: "original.webp", width: 2048, height: 2048, size: 900_000 };

describe("functions/media/sanitizeImage", () => {
  test("fills every slot from the bucket it belongs in", () => {
    const result = sanitizeImage({
      ...original,
      sizes: [size(150, 5_000), size(336, 20_000), size(600, 60_000), size(1024, 200_000)],
    });

    expect(result.sizes.thumbnail.url).toBe("150.webp");
    expect(result.sizes.small.url).toBe("336.webp");
    expect(result.sizes.medium.url).toBe("600.webp");
    expect(result.sizes.large.url).toBe("1024.webp");
    expect(result.sizes.original.url).toBe("original.webp");
  });

  test("with no renditions at all, every slot is the original", () => {
    const result = sanitizeImage({ ...original, sizes: [] });

    for (const slot of ["thumbnail", "small", "medium", "large", "original"] as const) {
      expect(result.sizes[slot].url).toBe("original.webp");
    }
  });

  test("treats an absent `sizes` the same as an empty one", () => {
    const result = sanitizeImage(original);

    expect(result.sizes.thumbnail.url).toBe("original.webp");
    expect(result._sizes).toBeUndefined();
  });

  /**
   * The cascade, which is the reason this function is not a `.map`. Only a 1024 exists, so the
   * three smaller slots must climb to it rather than come back empty — a phone asking for a
   * thumbnail gets a large image, which is wasteful but renders.
   */
  test("a missing bucket climbs to the next size up, never to undefined", () => {
    const result = sanitizeImage({ ...original, sizes: [size(1024, 200_000)] });

    expect(result.sizes.large.url).toBe("1024.webp");
    expect(result.sizes.medium.url).toBe("1024.webp");
    expect(result.sizes.small.url).toBe("1024.webp");
    expect(result.sizes.thumbnail.url).toBe("1024.webp");
  });

  test("a gap in the middle is bridged by the size above it", () => {
    // No 200–400 rendition, so `small` must resolve to the 600 that `medium` found.
    const result = sanitizeImage({
      ...original,
      sizes: [size(150, 5_000), size(600, 60_000)],
    });

    expect(result.sizes.thumbnail.url).toBe("150.webp");
    expect(result.sizes.small.url).toBe("600.webp");
    expect(result.sizes.medium.url).toBe("600.webp");
  });

  /**
   * The bucket edges are `<=` on the top and `>` on the bottom, so each boundary value belongs to
   * the SMALLER bucket. Off by one here silently promotes every rendition a tier, which nothing
   * downstream would flag.
   */
  describe("bucket boundaries", () => {
    test("1024 is large, not beyond it", () => {
      const result = sanitizeImage({ ...original, sizes: [size(1024, 100)] });
      expect(result.sizes.large.url).toBe("1024.webp");
    });

    test("600 is medium, not large", () => {
      const result = sanitizeImage({ ...original, sizes: [size(600, 100)] });

      expect(result.sizes.medium.url).toBe("600.webp");
      expect(result.sizes.large.url).toBe("original.webp");
    });

    test("400 is small, not medium", () => {
      const result = sanitizeImage({ ...original, sizes: [size(400, 100)] });

      expect(result.sizes.small.url).toBe("400.webp");
      expect(result.sizes.medium.url).toBe("original.webp");
    });

    test("200 is thumbnail, not small", () => {
      const result = sanitizeImage({ ...original, sizes: [size(200, 100)] });

      expect(result.sizes.thumbnail.url).toBe("200.webp");
      expect(result.sizes.small.url).toBe("original.webp");
    });

    /**
     * 1025 is above every bucket's ceiling, so no slot claims it and all five fall through to the
     * original — the rendition is simply unreachable. Worth pinning: `uploadSizes` caps at 1440,
     * so a rendition this function cannot address is a shape the pipeline can really produce.
     */
    test("a rendition larger than every bucket is unreachable", () => {
      const result = sanitizeImage({ ...original, sizes: [size(1025, 100)] });

      expect(result.sizes.large.url).toBe("original.webp");
      expect(result.sizes.thumbnail.url).toBe("original.webp");
      // Still reported verbatim, so a caller that wants it can find it.
      expect(result._sizes).toHaveLength(1);
    });
  });

  /**
   * A bucket is chosen by the LONGEST side, so a tall thumbnail is filed by its height. Using
   * width alone would put a 120×200 portrait rendition in the same bucket as a 120×120 square.
   */
  test("buckets a portrait rendition by its longest side", () => {
    const result = sanitizeImage({
      ...original,
      sizes: [{ url: "portrait.webp", width: 120, height: 640, size: 30_000 }],
    });

    // 640 is in the large band (600 < 640 <= 1024), not the thumbnail band its width suggests.
    expect(result.sizes.large.url).toBe("portrait.webp");
    expect(result.sizes.thumbnail.url).toBe("portrait.webp"); // cascaded up
  });

  /**
   * Two renditions land in one bucket; the list is sorted by BYTE size descending before `find`,
   * so the heavier one wins. That is the higher-quality render of the same pixel dimensions.
   */
  test("when two renditions share a bucket, the heavier file wins", () => {
    const result = sanitizeImage({
      ...original,
      sizes: [size(300, 10_000, "low.webp"), size(300, 40_000, "high.webp")],
    });

    expect(result.sizes.small.url).toBe("high.webp");
  });

  test("each slot carries only the four fields a renderer needs", () => {
    const result = sanitizeImage({
      ...original,
      sizes: [{ ...size(150, 5_000), quality: 40, key: "secret/key.webp" }],
    });

    expect(Object.keys(result.sizes.thumbnail).sort()).toEqual(["height", "size", "url", "width"]);
    expect(result.sizes.thumbnail).not.toHaveProperty("key");
    expect(result.sizes.thumbnail).not.toHaveProperty("quality");
  });

  test("keeps the raw renditions on `_sizes` and the source fields on the root", () => {
    const raw = [{ ...size(150, 5_000), quality: 40, key: "a/b.webp" }];
    const result = sanitizeImage({ ...original, hasAlpha: true, sizes: raw });

    expect(result._sizes).toEqual(raw); // untouched, keys and all
    expect(result.hasAlpha).toBe(true);
    expect(result.width).toBe(2048);
  });

  test("derives the aspect ratio from the original, not from a rendition", () => {
    const result = sanitizeImage({
      url: "wide.webp",
      width: 1920,
      height: 1080,
      size: 500_000,
      sizes: [size(150, 5_000)], // square, and must not win
    });

    expect(result.aspectRatio.closest).toBe("16:9");
  });
});
