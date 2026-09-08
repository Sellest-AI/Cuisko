import { describe, expect, test } from "vitest";

import { IMAGE_SIZE_STEPS, plannedImageSizes } from "../imageSizes";

const px = (steps: { px: number }[]) => steps.map((s) => s.px);

/**
 * The rendition ladder is the one part of the size pipeline that can be asserted without sharp or
 * a bucket, which is why it lives in its own module. Everything here is a decision that is silent
 * when wrong: a bad threshold upscales, a bad match re-renders every size on every call.
 */
describe("functions/media/imageSizes", () => {
  test("plans every step for a source larger than all of them", () => {
    const plan = plannedImageSizes({ width: 4000, height: 4000, existing: [] });

    expect(px(plan)).toEqual([150, 336, 600, 1440]);
  });

  test("plans nothing for a source smaller than the smallest step", () => {
    const plan = plannedImageSizes({ width: 120, height: 90, existing: [] });

    expect(plan).toEqual([]);
  });

  /**
   * Below 1000px the source only has to beat the target — a 601px original is worth a 600px
   * rendition, a 600px one is not, because the "rendition" would be a copy.
   */
  test("drops a step the source cannot beat", () => {
    expect(px(plannedImageSizes({ width: 600, height: 400, existing: [] }))).toEqual([150, 336]);
    expect(px(plannedImageSizes({ width: 601, height: 400, existing: [] }))).toEqual([150, 336, 600]);
  });

  /**
   * Above 1000px it must beat the target by 30%. A 1500px original gets no 1440px rendition — the
   * file would be within 4% of the original for a second round of compression artefacts.
   */
  test("requires 30% headroom above 1000px", () => {
    expect(px(plannedImageSizes({ width: 1500, height: 1000, existing: [] }))).not.toContain(1440);
    expect(px(plannedImageSizes({ width: 1900, height: 1000, existing: [] }))).toContain(1440);
  });

  test("uses the longest side, whichever way up the image is", () => {
    const landscape = plannedImageSizes({ width: 800, height: 200, existing: [] });
    const portrait = plannedImageSizes({ width: 200, height: 800, existing: [] });

    expect(px(portrait)).toEqual(px(landscape));
  });

  test("skips a rendition that already exists", () => {
    const plan = plannedImageSizes({
      width: 4000,
      height: 4000,
      existing: [{ width: 150, height: 150, quality: 40 }],
    });

    expect(px(plan)).toEqual([336, 600, 1440]);
  });

  /**
   * The same width at a different quality is a different rendition, not a duplicate — matching on
   * width alone would leave the ladder permanently missing a step after a quality change.
   */
  test("does not treat a different quality at the same width as existing", () => {
    const plan = plannedImageSizes({
      width: 4000,
      height: 4000,
      existing: [{ width: 150, height: 150, quality: 90 }],
    });

    expect(px(plan)).toContain(150);
  });

  test("matches an existing rendition on its longest side", () => {
    const plan = plannedImageSizes({
      width: 4000,
      height: 2000,
      existing: [{ width: 150, height: 75, quality: 40 }],
    });

    expect(px(plan)).not.toContain(150);
  });

  test("plans nothing when every step is already stored", () => {
    const existing = IMAGE_SIZE_STEPS.map((step) => ({
      width: step.px,
      height: step.px,
      quality: step.quality,
    }));

    expect(plannedImageSizes({ width: 4000, height: 4000, existing })).toEqual([]);
  });

  test("returns steps in ladder order", () => {
    const plan = plannedImageSizes({ width: 4000, height: 4000, existing: [] });

    expect(px(plan)).toEqual([...px([...IMAGE_SIZE_STEPS])]);
  });
});
