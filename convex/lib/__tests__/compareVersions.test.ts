import { describe, expect, test } from "vitest";

import { compareVersions } from "../compareVersions";

describe("lib/compareVersions", () => {
  test("compares numerically, not as strings: 0.10.0 is newer than 0.9.0", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
  });

  test("the most significant part decides", () => {
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.2.3", "1.3.0")).toBe(-1);
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
  });

  test("equal versions are 0, and a missing trailing part counts as 0", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1", "1.0.0")).toBe(0);
  });

  test("anything that is not a version is null, never equal and never older", () => {
    expect(compareVersions("abc", "1.0.0")).toBeNull();
    expect(compareVersions("1.0.0", "")).toBeNull();
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBeNull();
    expect(compareVersions("1.0.0.0", "1.0.0")).toBeNull();
    expect(compareVersions("1..0", "1.0.0")).toBeNull();
  });
});
