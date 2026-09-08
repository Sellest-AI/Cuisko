/**
 * Which renditions an image should have, decided without touching sharp, S3 or `ctx`.
 *
 * The decision is the part worth pinning: a wrong threshold silently upscales a 150px thumbnail
 * into a 1440px file, and a wrong "already exists" match re-renders every size on every call. The
 * work of actually producing them lives in `uploadImageSizes.ts`, which is `"use node"` and
 * therefore cannot be imported by a test in the edge-runtime Vitest project — splitting the
 * decision out is what makes it assertable at all (ADR 0008).
 */

/**
 * The rendition ladder. `px` is the longest side; `quality` climbs with it because compression
 * artefacts that vanish on a 150px tile are visible at 1440px.
 */
export const IMAGE_SIZE_STEPS = [
  { px: 150, quality: 40 },
  { px: 336, quality: 40 },
  { px: 600, quality: 70 },
  { px: 1440, quality: 90 },
] as const;

export type ImageSizeStep = (typeof IMAGE_SIZE_STEPS)[number];

type ExistingSize = { width: number; height: number; quality: number };

type PlanArgs = {
  width: number;
  height: number;
  existing: readonly ExistingSize[];
};

/**
 * The steps still worth rendering for an image of this size.
 *
 * Two reasons a step is dropped:
 *
 * - **It already exists.** Matched on longest side *and* quality, because the same width at a
 *   different quality is a different rendition, not a duplicate.
 * - **The source is too small.** Rendering a 600px "thumbnail" of a 500px original produces a
 *   bigger file than the original for no added detail. Below 1000px the source must simply beat
 *   the target; above it, it must beat the target by 30% — a 1440px step is not worth a separate
 *   file for a 1500px original, but is for a 1900px one.
 */
export const plannedImageSizes = ({ width, height, existing }: PlanArgs): ImageSizeStep[] => {
  const longestSide = Math.max(width, height);

  return IMAGE_SIZE_STEPS.filter((step) => {
    const alreadyExists = existing.some(
      (size) => Math.max(size.width, size.height) === step.px && size.quality === step.quality,
    );
    if (alreadyExists) return false;

    const threshold = step.px < 1000 ? step.px : step.px * 1.3;
    return longestSide > threshold;
  });
};
