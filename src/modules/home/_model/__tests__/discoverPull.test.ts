import { describe, expect, test } from "vitest";

import { DISCOVER_PULL, DISCOVER_STRIP, isAtBottomOf, pullProgressOf } from "../discoverPull";

/** Home on a large phone: 915 pt of screen over 2,000 pt of sections, so the bottom is at offset 1,085. */
const VIEWPORT = 915;
const CONTENT = 2000;
const BOTTOM = CONTENT - VIEWPORT;

describe("pullProgressOf", () => {
  test("is 0 anywhere above the bottom", () => {
    expect(pullProgressOf({ offset: 0, viewport: VIEWPORT, content: CONTENT })).toBe(0);
    expect(pullProgressOf({ offset: BOTTOM, viewport: VIEWPORT, content: CONTENT })).toBe(0);
  });

  test("is halfway at half the pull past the bottom", () => {
    expect(pullProgressOf({ offset: BOTTOM + DISCOVER_PULL / 2, viewport: VIEWPORT, content: CONTENT })).toBe(0.5);
  });

  test("stops at 1 however far the finger goes", () => {
    expect(pullProgressOf({ offset: BOTTOM + DISCOVER_PULL * 3, viewport: VIEWPORT, content: CONTENT })).toBe(1);
  });

  test("is 0 on a page shorter than its screen, which has no bottom to pull past", () => {
    expect(pullProgressOf({ offset: 40, viewport: VIEWPORT, content: 600 })).toBe(0);
  });

  test("reaches 1 before the end of the Android strip, even with the last offset rounded short", () => {
    // Android stops the scroll at the strip's end, and reports it in pixels turned to points: a
    // finger at the very end can read a point short of it. That point must not leave the ring at 99 %.
    const end = BOTTOM + DISCOVER_STRIP;
    expect(pullProgressOf({ offset: end - 1, viewport: VIEWPORT, content: CONTENT })).toBe(1);
  });
});

describe("isAtBottomOf", () => {
  test("is true at the bottom, and a point short of it, as Android rounds", () => {
    expect(isAtBottomOf({ offset: BOTTOM, viewport: VIEWPORT, content: CONTENT })).toBe(true);
    expect(isAtBottomOf({ offset: BOTTOM - 1, viewport: VIEWPORT, content: CONTENT })).toBe(true);
  });

  test("is false a row above the bottom: a drag from there scrolls, it does not pull", () => {
    expect(isAtBottomOf({ offset: BOTTOM - 50, viewport: VIEWPORT, content: CONTENT })).toBe(false);
  });

  test("is false on a page shorter than its screen", () => {
    expect(isAtBottomOf({ offset: 0, viewport: VIEWPORT, content: 600 })).toBe(false);
  });
});
