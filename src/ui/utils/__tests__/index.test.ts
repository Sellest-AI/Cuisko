import { describe, expect, it } from "vitest";

import { curvedStepDuration, formatCompact, formatRating, inverseLogCurve, logCurve } from "../index";

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

describe("logCurve", () => {
  it("is pinned at both ends, so a full bar is exactly full", () => {
    expect(logCurve(0)).toBe(0);
    expect(logCurve(1)).toBeCloseTo(1, 10);
  });

  it("front-loads progress: the first fifth fills more than a fifth", () => {
    expect(logCurve(0.2)).toBeGreaterThan(0.2);
  });

  it("is undone by inverseLogCurve", () => {
    [0, 0.25, 0.5, 0.8, 1].forEach((ratio) => {
      expect(inverseLogCurve(logCurve(ratio))).toBeCloseTo(ratio, 10);
    });
  });
});

describe("curvedStepDuration", () => {
  const COUNT = 4;
  const DURATION_MS = 12_000;
  const durations = Array.from({ length: COUNT }, (_, position) => curvedStepDuration(position, COUNT, DURATION_MS));

  it("adds up to exactly one pass, so a looping sequence restarts on the beat", () => {
    expect(durations.reduce((sum, duration) => sum + duration, 0)).toBeCloseTo(DURATION_MS, 6);
  });

  it("gives each step longer than the one before", () => {
    durations.slice(1).forEach((duration, index) => {
      expect(duration).toBeGreaterThan(durations[index]!);
    });
  });
});
