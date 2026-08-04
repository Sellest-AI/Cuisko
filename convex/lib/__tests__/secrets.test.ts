import { describe, expect, test } from "vitest";

import { timingSafeEqual } from "../secrets";

describe("timingSafeEqual", () => {
  test("accepts identical strings", () => {
    expect(timingSafeEqual("s3cret-value", "s3cret-value")).toBe(true);
  });

  test("rejects a different value of the same length", () => {
    expect(timingSafeEqual("s3cret-value", "s3cret-valuf")).toBe(false);
  });

  test("rejects a prefix — the case a naive early return would leak", () => {
    expect(timingSafeEqual("s3cret", "s3cret-value")).toBe(false);
    expect(timingSafeEqual("s3cret-value", "s3cret")).toBe(false);
  });

  test("rejects the empty string against a real secret", () => {
    expect(timingSafeEqual("", "s3cret-value")).toBe(false);
  });

  test("treats two empty strings as equal", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  test("compares bytes, not code units", () => {
    expect(timingSafeEqual("café", "café")).toBe(true);
    expect(timingSafeEqual("café", "cafe")).toBe(false);
  });
});
