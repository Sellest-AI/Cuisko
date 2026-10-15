/**
 * `nextVersion` decides how far a release moves, from the commits it contains; `releaseVersion`
 * decides where it moves from, so the answer is the same however many times it is asked.
 *
 * A wrong answer here is visible to every store reviewer and cannot be taken back: a version once
 * uploaded to a store is spent.
 */
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/nextVersion.mjs";

/** `nextVersion.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
type Bump = "patch" | "minor" | "major";
const { nextVersion, releaseVersion } = lib as unknown as {
  nextVersion: (current: string, messages: string[], forced?: Bump) => string;
  releaseVersion: (input: { files: string; released: string | null; messages: string[]; forced?: Bump }) => string;
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

describe("releaseVersion counts from the highest release, never from the files", () => {
  const feat = ["feat(cellar): scan a barcode"];

  it("bumps from the last release", () => {
    expect(releaseVersion({ files: "0.1.0", released: "0.1.0", messages: feat })).toBe("0.2.0");
  });

  it("gives the same answer on a second run, once the files already carry it", () => {
    expect(releaseVersion({ files: "0.2.0", released: "0.1.0", messages: feat })).toBe("0.2.0");
  });

  it("does not bump again when later commits ask for no more than the bump already made", () => {
    const later = [...feat, "fix(cellar): barcode with leading zero", "fix(planning): 2 eggs needed, 1 owned"];

    expect(releaseVersion({ files: "0.2.0", released: "0.1.0", messages: later })).toBe("0.2.0");
  });

  it("moves further when later commits ask for more than the bump already made", () => {
    const fixFirst = ["fix(cellar): barcode with leading zero"];

    expect(releaseVersion({ files: "0.1.1", released: "0.1.0", messages: [...fixFirst, ...feat] })).toBe("0.2.0");
  });

  it("keeps the files when they are already ahead, a major forced by hand", () => {
    expect(releaseVersion({ files: "1.0.0", released: "0.1.0", messages: feat })).toBe("1.0.0");
  });

  it("lands above a release this branch has never seen, rather than reusing its number", () => {
    // The branch was cut before v0.2.0: its files and its own history still say 0.1.0.
    expect(releaseVersion({ files: "0.1.0", released: "0.2.0", messages: feat })).toBe("0.3.0");
  });

  it("lets a forced bump win over the commits, from the last release", () => {
    expect(releaseVersion({ files: "0.1.0", released: "0.1.0", messages: feat, forced: "major" })).toBe("1.0.0");
  });

  it("releases the files' own version first, when nothing has been released yet", () => {
    expect(releaseVersion({ files: "0.1.0", released: null, messages: feat })).toBe("0.1.0");
    expect(releaseVersion({ files: "0.1.0", released: null, messages: ["fix(planning): 2 eggs needed, 1 owned"] })).toBe(
      "0.1.0",
    );
  });

  it("rejects a malformed version in the files", () => {
    expect(() => releaseVersion({ files: "v0.1.0", released: "0.1.0", messages: feat })).toThrow(/v0.1.0/);
  });
});
