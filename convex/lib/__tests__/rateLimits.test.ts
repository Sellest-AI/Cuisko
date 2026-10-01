import { DAY, HOUR } from "@convex-dev/rate-limiter";
import { describe, expect, test } from "vitest";

import { ADMIN_MULTIPLIER, RATE_LIMITS, rateLimitFor } from "../rateLimits";

describe("lib/rateLimits rateLimitFor", () => {
  test("a member gets the table's entry untouched", () => {
    expect(rateLimitFor("assistant", false)).toEqual(RATE_LIMITS.assistant);
  });

  test("an admin gets rate and capacity multiplied, and the period unchanged", () => {
    expect(rateLimitFor("assistant", true)).toEqual({
      kind: "token bucket",
      rate: 50 * ADMIN_MULTIPLIER,
      capacity: 20 * ADMIN_MULTIPLIER,
      period: 6 * HOUR,
    });
  });

  test("a window with no capacity stays without one for an admin, so it still defaults to its rate", () => {
    expect(rateLimitFor("recipeImport", true)).toEqual({ kind: "fixed window", rate: 10 * ADMIN_MULTIPLIER, period: DAY });
  });
});
