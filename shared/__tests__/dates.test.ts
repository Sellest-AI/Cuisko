import { describe, expect, test } from "vitest";

import { compareDateTimes, compareDates, mondayOf, seedOfWeekKey, weekKeyOf } from "../dates";

/**
 * Fixed local dates rather than `Date.now()`-derived ones: 2026-09-14 is a Monday, so the
 * expectations below are arithmetic on the calendar, not on the machine's clock. All dates are
 * built with the local constructor on purpose — these are local-week answers, not UTC ones.
 */
describe("weekKeyOf", () => {
  test("a Wednesday lands on its Monday", () => {
    expect(weekKeyOf(new Date(2026, 8, 16))).toBe("2026-09-14");
  });

  test("a Sunday lands on the Monday six days back — weeks start on Monday", () => {
    expect(weekKeyOf(new Date(2026, 8, 13))).toBe("2026-09-07");
  });

  test("a Monday is its own key", () => {
    expect(weekKeyOf(new Date(2026, 8, 14))).toBe("2026-09-14");
  });

  test("a Monday in January reaches back into the previous year", () => {
    // 2026-01-01 is a Thursday; its week began on 2025-12-29.
    expect(weekKeyOf(new Date(2026, 0, 1))).toBe("2025-12-29");
  });

  test("the key is zero-padded and reads YYYY-MM-DD", () => {
    expect(weekKeyOf(new Date(2026, 2, 4))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 2026-03-04 is a Wednesday; its Monday is March 2 — month `3`, padded to `03`.
    expect(weekKeyOf(new Date(2026, 2, 4))).toBe("2026-03-02");
  });

  /**
   * The local-parts rule, stated as behaviour: the hour of the day never moves the key. An
   * implementation on `toISOString()` would answer the UTC date, which disagrees with the local
   * one for a small hour on any offset east of UTC.
   */
  test("the hour of the day does not move the key", () => {
    const early = new Date(2026, 8, 16, 0, 30);
    const late = new Date(2026, 8, 16, 23, 30);
    expect(weekKeyOf(early)).toBe(weekKeyOf(late));
  });
});

describe("seedOfWeekKey", () => {
  test("FNV-1a's empty-string vector — the anchor that pins the exact hash", () => {
    expect(seedOfWeekKey("")).toBe(2166136261 / 2 ** 32);
  });

  test("the same key always draws the same seed", () => {
    expect(seedOfWeekKey("2026-09-14")).toBe(seedOfWeekKey("2026-09-14"));
  });

  test("the seed is a fraction in [0, 1)", () => {
    for (const key of ["2026-09-14", "2025-12-29", "2026-03-02", ""]) {
      const seed = seedOfWeekKey(key);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(1);
    }
  });

  test("distinct keys give distinct seeds", () => {
    const seeds = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"].map(seedOfWeekKey);
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  /** `candidatePool` stretches the seed back onto the shuffle-key span, so the product must be a whole uint32. */
  test("the seed stretches back onto an exact unsigned 32-bit integer", () => {
    const seed = seedOfWeekKey("2026-09-14");
    const stretched = seed * 2 ** 32;
    expect(Number.isInteger(stretched)).toBe(true);
    expect(stretched).toBeGreaterThanOrEqual(0);
    expect(stretched).toBeLessThan(2 ** 32);
  });
});

describe("compareDates", () => {
  test("the same calendar day compares equal however the clock reads", () => {
    expect(compareDates(new Date(2026, 8, 14, 8, 0), new Date(2026, 8, 14, 22, 0))).toBe(0);
  });

  test("orders two days", () => {
    expect(compareDates(new Date(2026, 8, 13), new Date(2026, 8, 14))).toBeLessThan(0);
    expect(compareDates(new Date(2026, 8, 15), new Date(2026, 8, 14))).toBeGreaterThan(0);
  });
});

describe("compareDateTimes", () => {
  test("orders two instants", () => {
    const first = new Date(2026, 8, 14, 8, 0);
    const second = new Date(2026, 8, 14, 8, 0, 0, 1);
    expect(compareDateTimes(first, second)).toBeLessThan(0);
    expect(compareDateTimes(second, first)).toBeGreaterThan(0);
    expect(compareDateTimes(first, new Date(first))).toBe(0);
  });
});

describe("mondayOf", () => {
  test("is the key's Monday at UTC midnight, wherever the key was set", () => {
    expect(new Date(mondayOf("2026-09-14")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });

  test("settles the week the key names, so a recipe written that week is a latecomer", () => {
    const wednesday = Date.UTC(2026, 8, 16, 12);
    expect(mondayOf(weekKeyOf(new Date(2026, 8, 16)))).toBeLessThan(wednesday);
    expect(mondayOf(weekKeyOf(new Date(2026, 8, 21)))).toBeGreaterThan(wednesday);
  });
});
