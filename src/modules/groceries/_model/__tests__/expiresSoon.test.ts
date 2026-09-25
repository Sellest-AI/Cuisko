import { describe, expect, test } from "vitest";

import { expiresSoon, expiresSoonAt } from "../expiresSoon";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

describe("expiresSoon", () => {
  test("shows the clock with four days left", () => {
    expect(expiresSoon(NOW + 4 * DAY, NOW)).toBe(true);
  });

  test("hides it with five days left", () => {
    expect(expiresSoon(NOW + 5 * DAY, NOW)).toBe(false);
  });

  test("shows it on a row already gone off", () => {
    expect(expiresSoon(NOW - 2 * DAY, NOW)).toBe(true);
  });

  test("never shows it on an undated row", () => {
    expect(expiresSoon(undefined, NOW)).toBe(false);
  });

  /** A timer woken at the deadline must find the clock showing, or it is never woken again. */
  test("turns true at exactly the moment `expiresSoonAt` names, and not before", () => {
    const date = NOW + 30 * DAY;

    expect(expiresSoon(date, expiresSoonAt(date) - 1)).toBe(false);
    expect(expiresSoon(date, expiresSoonAt(date))).toBe(true);
  });
});
