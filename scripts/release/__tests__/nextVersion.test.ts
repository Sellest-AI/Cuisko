/**
 * `nextVersion` decides the version a store build ships with, from the commits it contains.
 *
 * A wrong answer here is visible to every store reviewer and cannot be taken back: a version once
 * uploaded to a store is spent.
 */
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/nextVersion.mjs";

/** `nextVersion.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { nextVersion } = lib as unknown as {
  nextVersion: (current: string, messages: string[], forced?: "patch" | "minor" | "major") => string;
};

describe("derived from the commits", () => {
  it("bumps the patch when the release holds only fixes and chores", () => {
    expect(nextVersion("0.1.0", ["fix(planning): 2 eggs needed, 1 owned", "chore(deps): bump convex"])).toBe(
      "0.1.1",
    );
  });

  it("still bumps the patch when the release holds no conventional commit at all", () => {
    expect(nextVersion("0.1.1", [])).toBe("0.1.2");
    expect(nextVersion("0.1.1", ["Merge branch 'main' into feat/cellar"])).toBe("0.1.2");
  });

  it("bumps the minor when one commit is a feat", () => {
    expect(
      nextVersion("0.1.2", ["fix(cellar): barcode with leading zero", "feat(groceries): group the list by aisle"]),
    ).toBe("0.2.0");
  });

  it("bumps the major for a breaking change once past 1.0", () => {
    expect(nextVersion("1.4.2", ["feat(cellar)!: scan a barcode"])).toBe("2.0.0");
    expect(nextVersion("1.4.2", ["refactor(schema): drop pantries\n\nBREAKING CHANGE: pantries are gone"])).toBe(
      "2.0.0",
    );
  });

  it("bumps only the minor for a breaking change before 1.0", () => {
    expect(nextVersion("0.3.1", ["feat(cellar)!: scan a barcode"])).toBe("0.4.0");
  });

  it("does not read a footer that only mentions the phrase mid-line", () => {
    expect(nextVersion("1.0.0", ["fix(docs): explain what a BREAKING CHANGE: footer does"])).toBe("1.0.1");
  });
});

describe("forced by a human", () => {
  it("wins over the commits", () => {
    expect(nextVersion("0.1.0", ["feat(groceries): group the list by aisle"], "patch")).toBe("0.1.1");
  });

  it("crosses 1.0 when major is asked for explicitly", () => {
    expect(nextVersion("0.9.3", [], "major")).toBe("1.0.0");
  });

  it("rejects an unknown bump", () => {
    expect(() => nextVersion("0.1.0", [], "huge" as "major")).toThrow(/huge/);
  });
});

it("rejects a version that is not major.minor.patch", () => {
  expect(() => nextVersion("0.1", [])).toThrow(/0\.1/);
  expect(() => nextVersion("v0.1.0", [])).toThrow(/v0\.1\.0/);
});
