/**
 * The selection decides what the pre-push blocks on and what a dream reads (spec §6). A line
 * wrongly dropped is a lesson never learned; a line wrongly kept blocks every push until a dream
 * runs. Each fixture under fixtures/ is one situation of spec §14, on a fake repo at
 * `C:\work\cuisko`; the git half (open branches, reference date) runs on a throwaway repo.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/transcripts.mjs";

/** `transcripts.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
type Line = {
  uuid: string;
  sessionId: string;
  timestamp: string;
  cwd: string;
  branch: string;
  role: "user" | "assistant";
  isToolResult: boolean;
  isSynthetic: boolean;
  text: string;
  toolCalls: { name: string; input: unknown }[];
  transcript: string;
};
type Stamps = {
  version: 1;
  initializedAt: string;
  sessions: Record<string, { transcript: string; branches: Record<string, { reviewedUntil: string | null }> }>;
};
const { countSessions, findTranscripts, isDreamCwd, openBranches, readLines, referenceDate, select } = lib as unknown as {
  countSessions: (lines: Line[]) => number;
  findTranscripts: (input: { projectsDir: string; repoRoot: string }) => string[];
  isDreamCwd: (cwd: string, root: string) => boolean;
  openBranches: (input: { pushedSha: string; pushedRef: string; cwd?: string }) => Set<string>;
  readLines: (transcript: string) => Line[];
  referenceDate: (pushedSha: string, cwd?: string) => string | null;
  select: (input: {
    lines: Line[];
    repoRoot: string;
    openBranches: Set<string>;
    stamps: Stamps;
    referenceDate: string | null;
  }) => Line[];
};

// The pre-commit hook runs verify with GIT_* set for the real repo; the throwaway repos must not see them.
for (const name of Object.keys(process.env)) if (/^GIT_/i.test(name)) delete process.env[name];

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const ROOT = "C:/work/cuisko";

const fixture = (name: string) => readLines(path.join(FIXTURES, `${name}.jsonl`));
const allFixtures = () =>
  ["merged-branch", "open-branch", "deleted-branch", "renamed-branch", "branch-switch", "after-reference", "outside-repo"].flatMap(
    fixture,
  );
const stampsFrom = (initializedAt = "2026-10-01T00:00:00.000Z", sessions: Stamps["sessions"] = {}): Stamps => ({
  version: 1,
  initializedAt,
  sessions,
});
const pick = (lines: Line[], over: Partial<Parameters<typeof select>[0]> = {}) =>
  select({
    lines,
    repoRoot: ROOT,
    openBranches: new Set(["feat/open"]),
    stamps: stampsFrom(),
    referenceDate: "2026-11-04T00:00:00.000Z",
    ...over,
  });
const ids = (lines: Line[]) => lines.map((line) => line.uuid);

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), `memory-transcripts-${prefix}-`));
  created.push(dir);
  return dir;
};

describe("readLines", () => {
  it("keeps user and assistant lines only, and marks tool results", () => {
    const lines = fixture("noise");
    expect(ids(lines)).toEqual(["noise-1", "noise-2", "noise-3"]);
    expect(lines[0]).toMatchObject({ role: "user", text: "Kept: a plain user line.", isToolResult: false, branch: "dev" });
    expect(lines[1]).toMatchObject({
      role: "assistant",
      text: "Reading it.",
      toolCalls: [{ name: "Read", input: { file_path: String.raw`C:\work\cuisko\AGENTS.md` } }],
    });
    expect(lines[2]).toMatchObject({ role: "user", isToolResult: true, text: "" });
  });

  it("drops the api-request-blob copy, a line missing a field, a side chain and a cut-off line", () => {
    const texts = fixture("noise").map((line) => line.text);
    expect(texts).not.toContain("Repeated message text.");
    expect(texts).not.toContain("No gitBranch field.");
    expect(texts).not.toContain("A subagent turn.");
  });

  it("flags the user lines that are not the owner's words: hook caveats and compaction summaries", () => {
    expect(fixture("synthetic").map((line) => line.isSynthetic)).toEqual([false, true, true]);
  });

  it("records the transcript each line came from", () => {
    expect(fixture("merged-branch")[0]!.transcript).toBe(path.join(FIXTURES, "merged-branch.jsonl"));
  });
});

describe("select: the four conditions", () => {
  it("keeps a merged, a deleted and a renamed branch; drops an open one", () => {
    const kept = new Set(pick(allFixtures()).map((line) => line.sessionId));
    expect(kept).toContain("merged");
    expect(kept).toContain("deleted");
    expect(kept).toContain("renamed");
    expect(kept).not.toContain("open");
  });

  it("judges a session that switched branches line by line", () => {
    expect(ids(pick(fixture("branch-switch")))).toEqual(["switch-3", "switch-4"]);
  });

  it("drops a line newer than the reference date", () => {
    expect(ids(pick(fixture("after-reference")))).toEqual(["late-1"]);
  });

  it("selects nothing when no pushed commit is a code commit", () => {
    expect(pick(allFixtures(), { referenceDate: null })).toEqual([]);
  });

  it("keeps the repo, its subfolders and worktrees; drops siblings and anything under .tmp/", () => {
    expect(pick(fixture("outside-repo")).map((line) => line.sessionId)).toEqual(["windows", "worktree"]);
  });

  it("accepts a root spelled with backslashes", () => {
    const lines = fixture("outside-repo");
    expect(ids(pick(lines, { repoRoot: String.raw`C:\work\cuisko` }))).toEqual(ids(pick(lines)));
  });

  it("drops every line older than initializedAt", () => {
    expect(pick(allFixtures(), { stamps: stampsFrom("2026-11-02T09:15:00.000Z") }).map((line) => line.uuid)).toEqual([
      "switch-3",
      "switch-4",
      "late-1",
    ]);
  });

  it("drops what a pair's stamp already covers, and only for that pair", () => {
    const stamps = stampsFrom(undefined, {
      switch: { transcript: "x", branches: { dev: { reviewedUntil: "2026-11-02T09:30:00.000Z" } } },
      merged: { transcript: "x", branches: { "feat/other": { reviewedUntil: "2026-12-01T00:00:00.000Z" } } },
    });
    const kept = ids(pick([...fixture("branch-switch"), ...fixture("merged-branch")], { stamps }));
    expect(kept).toEqual(["switch-4", "merged-1", "merged-2"]);
  });

  it("treats a null stamp as unread", () => {
    const stamps = stampsFrom(undefined, { merged: { transcript: "x", branches: { "feat/merged": { reviewedUntil: null } } } });
    expect(ids(pick(fixture("merged-branch"), { stamps }))).toEqual(["merged-1", "merged-2"]);
  });

  it("does not trip on a branch named like an object property", () => {
    const [line] = fixture("merged-branch");
    expect(pick([{ ...line!, branch: "constructor" }])).toHaveLength(1);
  });

  it("counts sessions, not lines", () => {
    // merged, deleted, renamed, switch, late, windows, worktree: 9 lines from 7 sessions.
    const selected = pick(allFixtures());
    expect(selected).toHaveLength(9);
    expect(countSessions(selected)).toBe(7);
  });
});

describe("isDreamCwd", () => {
  it("matches a dream folder, whatever the slashes and the drive-letter case", () => {
    expect(isDreamCwd(String.raw`c:\work\cuisko\.tmp\memory\dream-x`, "C:/work/cuisko")).toBe(true);
    expect(isDreamCwd("C:/work/cuisko/.tmp/memory/dream-x", String.raw`C:\work\cuisko`)).toBe(true);
  });

  it("refuses a sibling repo and a .tmp folder below the root", () => {
    expect(isDreamCwd(String.raw`C:\work\cuisko-web\.tmp\memory\dream-x`, "C:/work/cuisko")).toBe(false);
    expect(isDreamCwd(String.raw`C:\work\cuisko\src\.tmp\memory`, "C:/work/cuisko")).toBe(false);
  });
});

describe("findTranscripts", () => {
  it("finds the main folder and the worktree folders, without case, and no subagent transcript", () => {
    const projects = tempDir("projects");
    const folders = ["c--work-cuisko", "C--work-cuisko--claude-worktrees-a-1f2e3d", "C--work-cuisko-web", "C--other"];
    for (const folder of folders) {
      mkdirSync(path.join(projects, folder));
      writeFileSync(path.join(projects, folder, "s1.jsonl"), "");
      writeFileSync(path.join(projects, folder, "notes.txt"), "");
    }
    mkdirSync(path.join(projects, "c--work-cuisko", "s1", "subagents"), { recursive: true });
    writeFileSync(path.join(projects, "c--work-cuisko", "s1", "subagents", "agent-1.jsonl"), "");

    const found = findTranscripts({ projectsDir: projects, repoRoot: String.raw`C:\work\cuisko` });
    expect(found.map((file) => path.relative(projects, file).split(path.sep).join("/"))).toEqual([
      "C--work-cuisko--claude-worktrees-a-1f2e3d/s1.jsonl",
      "C--work-cuisko-web/s1.jsonl",
      "c--work-cuisko/s1.jsonl",
    ]);
  });

  it("returns nothing when Claude Code never ran here", () => {
    expect(findTranscripts({ projectsDir: path.join(tempDir("none"), "projects"), repoRoot: ROOT })).toEqual([]);
  });
});

describe("the git half: open branches and the reference date", () => {
  /** A repo whose dev holds a merged feature, beside a feature still open and a memory commit. */
  const makeHistory = () => {
    const repo = tempDir("repo");
    const run = (date: string, ...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
      }).trim();
    const commit = (date: string, message: string) =>
      run(date, "commit", "-q", "--no-verify", "--allow-empty", "-m", message);

    run("2026-11-01T08:00:00Z", "init", "-q", "-b", "dev");
    commit("2026-11-01T08:00:00Z", "chore: init");
    run("2026-11-01T08:00:00Z", "checkout", "-q", "-b", "feat/merged");
    commit("2026-11-01T09:00:00Z", "feat(planning): count the eggs");
    run("2026-11-01T09:00:00Z", "checkout", "-q", "dev");
    run("2026-11-01T09:00:00Z", "merge", "-q", "--ff-only", "feat/merged");
    run("2026-11-01T09:00:00Z", "checkout", "-q", "-b", "feat/open");
    commit("2026-11-02T09:00:00Z", "feat(cellar): add a filter");
    run("2026-11-02T09:00:00Z", "checkout", "-q", "dev");
    commit("2026-11-03T10:00:00Z", "fix(planning): round the eggs");
    commit("2026-11-03T12:00:00Z", "chore(memory): dream of 2026-11-03\n\nMemory-Update: yes");
    return { repo, dev: run("2026-11-03T12:00:00Z", "rev-parse", "HEAD") };
  };

  it("lists the unmerged branches, never the pushed one", () => {
    const { repo, dev } = makeHistory();
    expect(openBranches({ pushedSha: dev, pushedRef: "refs/heads/dev", cwd: repo })).toEqual(new Set(["feat/open"]));
  });

  it("dates the push by its newest code commit, skipping memory commits", () => {
    const { repo, dev } = makeHistory();
    expect(referenceDate(dev, repo)).toBe("2026-11-03T10:00:00.000Z");
  });
});
