import { describe, expect, it } from "vitest";

import { isOldDevice, MIN_ANIMATED_ANDROID_API, MIN_ANIMATED_IOS_MAJOR } from "../device";

describe("isOldDevice", () => {
  it("counts an Android below API 33 as old, and 33 onwards as current", () => {
    expect(isOldDevice("android", MIN_ANIMATED_ANDROID_API - 1)).toBe(true);
    expect(isOldDevice("android", MIN_ANIMATED_ANDROID_API)).toBe(false);
    expect(isOldDevice("android", 35)).toBe(false);
  });

  it("reads only the major part of an iOS version", () => {
    expect(isOldDevice("ios", "18.2")).toBe(true);
    expect(isOldDevice("ios", "25.9.1")).toBe(true);
    expect(isOldDevice("ios", `${MIN_ANIMATED_IOS_MAJOR}.0`)).toBe(false);
    expect(isOldDevice("ios", "26")).toBe(false);
  });

  it("counts the web, and a version it cannot read, as current", () => {
    expect(isOldDevice("web", "")).toBe(false);
    expect(isOldDevice("ios", "unknown")).toBe(false);
    expect(isOldDevice("android", "unknown")).toBe(false);
  });
});
