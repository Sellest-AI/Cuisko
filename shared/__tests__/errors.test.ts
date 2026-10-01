import { describe, expect, test } from "vitest";

import { isRateLimited } from "../errors";

describe("shared/errors isRateLimited", () => {
  test("recognises the refusal enforceRateLimit throws", () => {
    expect(isRateLimited({ data: { code: "RATE_LIMITED" } })).toBe(true);
  });

  test("refuses every other code, and a value that is not one of our errors", () => {
    expect(isRateLimited({ data: { code: "FORBIDDEN" } })).toBe(false);
    expect(isRateLimited(new Error("RATE_LIMITED"))).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
  });
});
