import { describe, expect, test } from "vitest";

import {
  dimensionsToResolution,
  getClosestAspectRatio,
  getClosestResolution,
} from "../dimensions";

/**
 * The geometry every image path leans on: `sanitizeImage` labels a stored image with it, and
 * `sanitizeImageForReplicate` uses it to decide whether a picture needs padding before a model
 * will accept it. Both read the LABEL, so an orientation flip here is a portrait photo sent as
 * landscape — silent, and only visible in the generated output.
 */

describe("shared/dimensions", () => {
  describe("getClosestAspectRatio", () => {
    test("names an exact landscape ratio", () => {
      expect(getClosestAspectRatio(1920, 1080).closest).toBe("16:9");
      expect(getClosestAspectRatio(1024, 768).closest).toBe("4:3");
      expect(getClosestAspectRatio(1200, 800).closest).toBe("3:2");
      expect(getClosestAspectRatio(1024, 1024).closest).toBe("1:1");
      expect(getClosestAspectRatio(2520, 1080).closest).toBe("21:9");
    });

    test("rounds an inexact ratio to the nearest candidate", () => {
      // 1.70 sits between 3:2 (1.50) and 16:9 (1.78); 16:9 is nearer.
      expect(getClosestAspectRatio(1700, 1000).closest).toBe("16:9");
      // 1.40 sits between 4:3 (1.33) and 3:2 (1.50); 4:3 is nearer.
      expect(getClosestAspectRatio(1400, 1000).closest).toBe("4:3");
    });

    /**
     * The half of this function that is easy to get wrong. Candidates are only listed in landscape,
     * so a portrait image is matched against their INVERSES and the winning label is then flipped.
     * Returning "16:9" for a 1080×1920 phone photo would be a plausible-looking answer.
     */
    test("inverts the label for a portrait image", () => {
      expect(getClosestAspectRatio(1080, 1920).closest).toBe("9:16");
      expect(getClosestAspectRatio(768, 1024).closest).toBe("3:4");
      expect(getClosestAspectRatio(1080, 2520).closest).toBe("9:21");
    });

    test("reports the orientation alongside the label", () => {
      expect(getClosestAspectRatio(1920, 1080).type).toBe("landscape");
      expect(getClosestAspectRatio(1080, 1920).type).toBe("portrait");
    });

    /** A square is not portrait: the test is `ratio < 1`, so 1.0 stays landscape and is not flipped. */
    test("treats a square as landscape, leaving 1:1 unflipped", () => {
      const square = getClosestAspectRatio(500, 500);

      expect(square.type).toBe("landscape");
      expect(square.closest).toBe("1:1");
    });

    test("reports the true ratio to four decimals", () => {
      expect(getClosestAspectRatio(1920, 1080).actual).toBe("1.7778");
      expect(getClosestAspectRatio(1000, 1000).actual).toBe("1.0000");
    });

    test("restricts itself to the allowed labels when given some", () => {
      // 1.78 is nearest 16:9, but 16:9 is not on offer — 4:3 is the nearest of what is.
      expect(getClosestAspectRatio(1920, 1080, ["1:1", "4:3"]).closest).toBe("4:3");
      expect(getClosestAspectRatio(1920, 1080, ["1:1"]).closest).toBe("1:1");
    });

    /**
     * `sharp` reports width and height as possibly-undefined, and callers here default them to 0.
     * A zero height makes the ratio Infinity, which must not become NaN or throw — the padding
     * path in `sanitizeImageForReplicate` would then produce a bad `sharp` create() call.
     */
    test("survives a zero height rather than throwing", () => {
      const result = getClosestAspectRatio(1024, 0);

      expect(result.type).toBe("landscape");
      expect(result.closest).toBeDefined();
    });
  });

  describe("dimensionsToResolution", () => {
    test("scales a 16:9 source to the requested height", () => {
      expect(dimensionsToResolution({ width: 1920, height: 1080 }, 720)).toEqual({
        aspectRatio: "16:9",
        width: 1280,
        height: 720,
      });
    });

    /** The orientation has to survive the scaling, or a portrait image comes back landscape. */
    test("keeps a portrait source portrait", () => {
      expect(dimensionsToResolution({ width: 1080, height: 1920 }, 720)).toEqual({
        aspectRatio: "9:16",
        width: 720,
        height: 1280,
      });
    });

    test("scales a square source to a square", () => {
      const result = dimensionsToResolution({ width: 4096, height: 4096 }, 512);

      expect(result.aspectRatio).toBe("1:1");
      expect(result.width).toBe(result.height);
    });

    test("snaps an off-ratio source onto its closest standard ratio", () => {
      // 1700×1000 is not 16:9, but it is filed as 16:9 — so the output is a true 16:9.
      const result = dimensionsToResolution({ width: 1700, height: 1000 }, 720);

      expect(result.aspectRatio).toBe("16:9");
      expect(result.width / result.height).toBeCloseTo(16 / 9, 2);
    });
  });

  describe("getClosestResolution", () => {
    test("picks the resolution whose pixel budget is nearest", () => {
      expect(getClosestResolution({ width: 1280, height: 720 }, ["480p", "720p", "1080p"])).toBe("720p");
      expect(getClosestResolution({ width: 1920, height: 1080 }, ["480p", "720p", "1080p"])).toBe("1080p");
      expect(getClosestResolution({ width: 854, height: 480 }, ["480p", "720p", "1080p"])).toBe("480p");
    });

    test("clamps to the largest offered rather than inventing one", () => {
      expect(getClosestResolution({ width: 7680, height: 4320 }, ["480p", "720p"])).toBe("720p");
    });

    test("clamps to the smallest offered for a tiny source", () => {
      expect(getClosestResolution({ width: 64, height: 64 }, ["480p", "720p", "1080p"])).toBe("480p");
    });

    test("returns the only option when there is one", () => {
      expect(getClosestResolution({ width: 1920, height: 1080 }, ["720p"])).toBe("720p");
    });

    /** Compared on total pixels, so orientation must not change the answer. */
    test("gives a portrait source the same answer as its landscape twin", () => {
      const landscape = getClosestResolution({ width: 1920, height: 1080 }, ["480p", "720p", "1080p"]);
      const portrait = getClosestResolution({ width: 1080, height: 1920 }, ["480p", "720p", "1080p"]);

      expect(portrait).toBe(landscape);
    });
  });
});
