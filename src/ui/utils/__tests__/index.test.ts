import { describe, expect, it } from "vitest";

import { formatCompact, formatRating } from "../index";

describe("formatCompact", () => {
  it("leaves counts below a thousand alone", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(999)).toBe("999");
  });

  it("shortens thousands, millions and billions", () => {
    expect(formatCompact(1_300)).toBe("1.3K");
    expect(formatCompact(1_800_000)).toBe("1.8M");
    expect(formatCompact(2_400_000_000)).toBe("2.4B");
  });

  it("drops a decimal that would read as zero", () => {
    expect(formatCompact(1_000)).toBe("1K");
    expect(formatCompact(5_000_000)).toBe("5M");
  });

  it("truncates rather than rounding up, so the badge never overstates", () => {
    expect(formatCompact(1_999)).toBe("1.9K");
    expect(formatCompact(999_999)).toBe("999.9K");
  });

  it("keeps the sign on a negative count", () => {
    expect(formatCompact(-1_300)).toBe("-1.3K");
  });
});

describe("formatRating", () => {
  it("always shows exactly one decimal", () => {
    expect(formatRating(4)).toBe("4.0");
    expect(formatRating(4.25)).toBe("4.3");
    expect(formatRating(4.34)).toBe("4.3");
  });
});
