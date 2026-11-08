/**
 * What the owner reads before choosing (spec §9.1 U7). The diff must show a file that is new on
 * one side, and the report must put the worst doubt first: a high flag buried under lows is read
 * as a clean dream.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/review.mjs";

type Flag = { path: string; fact: string; problem: string; evidence: string; severity: "low" | "medium" | "high"; fix?: string };
const { formatReport, memoryDiff, rankingChanges } = lib as unknown as {
  formatReport: (input: {
    flags: Flag[];
    alerts: { kind: string; message: string }[];
    docsIssues: { doc: string; issue: string }[];
    deletions: { path: string; reason?: string }[];
  }) => string;
  memoryDiff: (input: { cwd: string; from: string; to: string }) => string;
  rankingChanges: (before: string, after: string, limit?: number) => string[];
};

// The pre-commit hook runs verify with GIT_* set for the real repo; a throwaway diff must not see them.
for (const name of Object.keys(process.env)) if (/^GIT_/i.test(name)) delete process.env[name];

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const indexOf = (...titles: string[]) =>
  `# Header\n\n## Memories\n\n${titles.map((title) => `- [${title}](memories/${title.toLowerCase().replace(/ /g, "-")}.md): About ${title}.`).join("\n")}\n`;

describe("rankingChanges", () => {
  it("names a memory that moved, one that is new and one that left", () => {
    const changes = rankingChanges(indexOf("Alpha", "Beta", "Gamma"), indexOf("Beta", "Alpha", "Delta"));

    expect(changes).toEqual(["moved    2 → 1  Beta", "moved    1 → 2  Alpha", "new      3  Delta", "removed  3  Gamma"]);
  });

  it("is empty when the order did not change, and caps a long list", () => {
    expect(rankingChanges(indexOf("A1", "B1"), indexOf("A1", "B1"))).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => `File ${i}`);

    const changes = rankingChanges(indexOf(...many), indexOf(...[...many].reverse()), 5);

    expect(changes).toHaveLength(6);
    expect(changes.at(-1)).toBe("… and 25 more");
  });
});

describe("memoryDiff", () => {
  const sides = () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "memory-review-"));
    dirs.push(root);
    execFileSync("git", ["init", "-q", root]);
    for (const side of ["a", "b"]) mkdirSync(path.join(root, side));
    return root;
  };

  it("shows a changed file, a file new on one side and a file that is gone", () => {
    const root = sides();
    writeFileSync(path.join(root, "a", "same.md"), "same\n");
    writeFileSync(path.join(root, "b", "same.md"), "same\n");
    writeFileSync(path.join(root, "a", "edit.md"), "limit: 5 MB\n");
    writeFileSync(path.join(root, "b", "edit.md"), "limit: 10 MB\n");
    writeFileSync(path.join(root, "b", "new.md"), "brand new\n");
    writeFileSync(path.join(root, "a", "gone.md"), "old\n");

    const diff = memoryDiff({ cwd: root, from: "a", to: "b" });

    expect(diff).toContain("-limit: 5 MB");
    expect(diff).toContain("+limit: 10 MB");
    expect(diff).toContain("+brand new");
    expect(diff).toContain("-old");
    expect(diff).not.toContain("same.md");
  });

  it("is empty when the two sides are equal", () => {
    expect(memoryDiff({ cwd: sides(), from: "a", to: "b" })).toBe("");
  });

  it("throws when a side does not exist, instead of returning an empty diff", () => {
    expect(() => memoryDiff({ cwd: sides(), from: "a", to: "nowhere" })).toThrow("could not diff the memory");
  });
});

describe("formatReport", () => {
  const flag = (severity: Flag["severity"], problem: string): Flag => ({ path: "memories/api.md", fact: "A fact.", problem, evidence: "sA-01", severity });

  it("puts the worst flag first", () => {
    const text = formatReport({ flags: [flag("low", "Imprecise."), flag("high", "Wrong."), flag("medium", "Unsupported.")], alerts: [], docsIssues: [], deletions: [] });

    expect(text.indexOf("Wrong.")).toBeLessThan(text.indexOf("Unsupported."));
    expect(text.indexOf("Unsupported.")).toBeLessThan(text.indexOf("Imprecise."));
    expect(text).toContain('[high] memories/api.md: Wrong. — "A fact." (evidence: sA-01)');
  });

  it("lists alerts, docs issues and deletions, each under its heading, and omits empty headings", () => {
    const text = formatReport({
      flags: [],
      alerts: [{ kind: "flip-flop", message: "Went back." }],
      docsIssues: [{ doc: "docs/ARCHITECTURE.md", issue: "Stale." }],
      deletions: [{ path: "memories/old.md", reason: "Never read." }],
    });

    expect(text).toContain("Writer alerts\n  [flip-flop] Went back.");
    expect(text).toContain("Docs that look wrong\n  docs/ARCHITECTURE.md: Stale.");
    expect(text).toContain("Deletions proposed\n  memories/old.md: Never read.");
    expect(text).not.toContain("Reviewer flags");
  });

  it("lists the flags the reviewer fixed apart from the open ones, with what it changed", () => {
    const text = formatReport({ flags: [flag("high", "Wrong."), { ...flag("medium", "A name."), fix: "removed the name" }], alerts: [], docsIssues: [], deletions: [] });

    expect(text).toContain('Reviewer flags\n  [high] memories/api.md: Wrong. — "A fact." (evidence: sA-01)\n');
    expect(text).toContain('Fixed by the reviewer\n  [medium] memories/api.md: A name. — "A fact." (evidence: sA-01) → removed the name\n');
  });

  it("is empty when there is nothing to say", () => {
    expect(formatReport({ flags: [], alerts: [], docsIssues: [], deletions: [] })).toBe("");
  });
});
