/**
 * usage.json ranks the index, and the index decides which memories a session sees at start
 * (spec §4.4, §10.8). A read counted twice pushes a memory up for nothing; a read missed lets a
 * useful one sink out of the first 200 lines.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as transcripts from "../_lib/transcripts.mjs";
import * as lib from "../_lib/usage.mjs";

/** The modules are plain JavaScript; the contract is restated here so a drift stops compiling. */
type Line = {
  uuid: string;
  sessionId: string;
  timestamp: string;
  cwd: string;
  branch: string;
  role: "user" | "assistant";
  isToolResult: boolean;
  text: string;
  toolCalls: { name: string; input: Record<string, unknown> }[];
  transcript: string;
};
type Entry = { created: string; reads: number; lastRead: string | null; sessionsSinceRead?: number };
type Usage = { version: 1; files: Record<string, Entry> };
type Counts = Map<string, { reads: number; lastRead: string | null }>;
const { applyReads, applySessions, countReads, readUsage, sessionStarts, syncFiles, writeUsage } = lib as unknown as {
  applyReads: (usage: Usage, counts: Counts) => Usage;
  applySessions: (usage: Usage, counts: Counts, starts: string[]) => Usage;
  sessionStarts: (input: { lines: Line[]; repoRoot: string; since: string; until: string }) => string[];
  countReads: (input: { lines: Line[]; repoRoot: string; memoryFiles: string[]; since: string; until: string }) => Counts;
  readUsage: (dir: string) => Usage;
  syncFiles: (usage: Usage, memoryFiles: string[], today: string) => Usage;
  writeUsage: (dir: string, usage: Usage) => void;
};
const { readLines } = transcripts as unknown as { readLines: (file: string) => Line[] };

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});
const tempDir = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "memory-usage-"));
  created.push(dir);
  return dir;
};

const ROOT = "C:/work/cuisko";
const AUTH = "memories/api-auth.md";
const TESTS = "memories/test-conventions.md";
const FILES = [AUTH, TESTS];
const WINDOW = { since: "2026-11-01T00:00:00.000Z", until: "2026-11-08T00:00:00.000Z" };

let uuid = 0;
const call = (name: string, input: Record<string, unknown>, extra: Partial<Line> = {}): Line => ({
  uuid: `u${(uuid += 1)}`,
  sessionId: "s1",
  timestamp: "2026-11-05T10:00:00.000Z",
  cwd: String.raw`C:\work\cuisko`,
  branch: "dev",
  role: "assistant",
  isToolResult: false,
  text: "",
  toolCalls: [{ name, input }],
  transcript: "s1.jsonl",
  ...extra,
});

const count = (lines: Line[]) => countReads({ lines, repoRoot: ROOT, memoryFiles: FILES, ...WINDOW });

describe("countReads", () => {
  it.each([
    ["Read", call("Read", { file_path: String.raw`C:\work\cuisko\.claude\memory\memories\api-auth.md` })],
    ["cat in Bash", call("Bash", { command: "cat .claude/memory/memories/api-auth.md | head -20" })],
    ["Get-Content in PowerShell", call("PowerShell", { command: String.raw`Get-Content .claude\memory\memories\api-auth.md` })],
    ["Grep", call("Grep", { pattern: "token", path: ".claude/memory/memories/api-auth.md" })],
    [
      "ctx_execute_file",
      call("mcp__plugin_context-mode_context-mode__ctx_execute_file", {
        path: String.raw`C:\work\cuisko\.claude\memory\memories\api-auth.md`,
        language: "javascript",
        code: "",
      }),
    ],
  ])("counts a %s once", (_name, line) => {
    expect(count([line])).toEqual(new Map([[AUTH, { reads: 1, lastRead: "2026-11-05T10:00:00.000Z" }]]));
  });

  it("counts one call naming the same file twice once, and two files once each", () => {
    const line = call("Bash", {
      command: "cat .claude/memory/memories/api-auth.md .claude/memory/memories/api-auth.md .claude/memory/memories/test-conventions.md",
    });
    expect([...count([line]).entries()].map(([file, { reads }]) => [file, reads])).toEqual([
      [AUTH, 1],
      [TESTS, 1],
    ]);
  });

  it("keeps the newest read as lastRead", () => {
    const lines = [
      call("Read", { file_path: AUTH }, { timestamp: "2026-11-06T09:00:00.000Z" }),
      call("Read", { file_path: AUTH }, { timestamp: "2026-11-02T09:00:00.000Z" }),
    ];
    expect(count(lines).get(AUTH)).toEqual({ reads: 2, lastRead: "2026-11-06T09:00:00.000Z" });
  });

  it.each([
    ["a dream session", call("Read", { file_path: AUTH }, { cwd: String.raw`C:\work\cuisko\.tmp\memory\dream-x` })],
    ["another repo", call("Read", { file_path: AUTH }, { cwd: String.raw`C:\work\cuisko-web` })],
    ["a read before the window", call("Read", { file_path: AUTH }, { timestamp: "2026-11-01T00:00:00.000Z" })],
    ["a read after the window", call("Read", { file_path: AUTH }, { timestamp: "2026-11-08T00:00:01.000Z" })],
    ["an Edit", call("Edit", { file_path: AUTH, old_string: "a", new_string: "b" })],
    ["a longer name ending the same", call("Read", { file_path: ".claude/memory/oldmemories/api-auth.md" })],
  ])("does not count %s", (_name, line) => {
    expect(count([line]).size).toBe(0);
  });

  it("counts a read on an open branch: reads are counted on every branch", () => {
    expect(count([call("Read", { file_path: AUTH }, { branch: "feat/unmerged" })]).get(AUTH)?.reads).toBe(1);
  });

  it("does not count the api-request-blob copy of a call", () => {
    const file = path.join(tempDir(), "s1.jsonl");
    const assistant = {
      type: "assistant",
      uuid: "a1",
      sessionId: "s1",
      timestamp: "2026-11-05T10:00:00.000Z",
      cwd: String.raw`C:\work\cuisko`,
      gitBranch: "dev",
      message: { role: "assistant", content: [{ type: "tool_use", name: "Read", input: { file_path: AUTH } }] },
    };
    const blob = { type: "api-request-blob", timestamp: assistant.timestamp, messages: [assistant.message] };
    writeFileSync(file, `${JSON.stringify(assistant)}\n${JSON.stringify(blob)}\n`);
    expect(count(readLines(file)).get(AUTH)?.reads).toBe(1);
  });
});

describe("applyReads and syncFiles", () => {
  const usage: Usage = {
    version: 1,
    files: {
      [AUTH]: { created: "2026-10-01", reads: 4, lastRead: "2026-11-03T00:00:00.000Z" },
      [TESTS]: { created: "2026-10-02", reads: 1, lastRead: null },
    },
  };

  it("adds the reads to the files read only, and keeps the newest lastRead", () => {
    const counts: Counts = new Map([
      [AUTH, { reads: 2, lastRead: "2026-11-02T00:00:00.000Z" }],
      ["memories/gone.md", { reads: 9, lastRead: "2026-11-05T00:00:00.000Z" }],
    ]);
    expect(applyReads(usage, counts).files).toEqual({
      [AUTH]: { created: "2026-10-01", reads: 6, lastRead: "2026-11-03T00:00:00.000Z" },
      [TESTS]: usage.files[TESTS],
    });
  });

  it("adds a created file with no reads, and drops a deleted one", () => {
    expect(syncFiles(usage, [AUTH, "memories/upload.md"], "2026-11-08").files).toEqual({
      [AUTH]: usage.files[AUTH],
      "memories/upload.md": { created: "2026-11-08", reads: 0, lastRead: null },
    });
  });
});

describe("sessionStarts", () => {
  const at = (sessionId: string, timestamp: string, cwd = String.raw`C:\work\cuisko`) => call("Read", { file_path: "x" }, { sessionId, timestamp, cwd, role: "user" });

  it("dates each session by its first line, and keeps those that started in the window", () => {
    const lines = [
      at("old", "2026-10-30T09:00:00.000Z"),
      at("old", "2026-11-02T09:00:00.000Z"),
      at("b", "2026-11-04T09:00:00.000Z"),
      at("a", "2026-11-03T09:00:00.000Z"),
      at("a", "2026-11-06T09:00:00.000Z"),
      at("later", "2026-11-09T09:00:00.000Z"),
    ];

    expect(sessionStarts({ lines, repoRoot: ROOT, ...WINDOW })).toEqual(["2026-11-03T09:00:00.000Z", "2026-11-04T09:00:00.000Z"]);
  });

  it("does not count a dream's own session, nor another repo's", () => {
    const lines = [at("dream", "2026-11-03T09:00:00.000Z", String.raw`C:\work\cuisko\.tmp\memory\dream-1`), at("other", "2026-11-03T09:00:00.000Z", String.raw`C:\work\cuisko-web`)];

    expect(sessionStarts({ lines, repoRoot: ROOT, ...WINDOW })).toEqual([]);
  });
});

describe("applySessions", () => {
  const usage: Usage = {
    version: 1,
    files: {
      [AUTH]: { created: "2026-10-01", reads: 4, lastRead: "2026-10-20T00:00:00.000Z", sessionsSinceRead: 7 },
      [TESTS]: { created: "2026-10-02", reads: 0, lastRead: null },
    },
  };
  const starts = ["2026-11-02T00:00:00.000Z", "2026-11-04T00:00:00.000Z", "2026-11-06T00:00:00.000Z"];

  it("adds the window's sessions to a file nobody read, starting from 0 when the field is absent", () => {
    const files = applySessions(usage, new Map(), starts).files;

    expect(files[AUTH]?.sessionsSinceRead).toBe(10);
    expect(files[TESTS]?.sessionsSinceRead).toBe(3);
  });

  it("counts only the sessions that started after the newest read of a file read in the window", () => {
    const counts: Counts = new Map([[AUTH, { reads: 1, lastRead: "2026-11-05T00:00:00.000Z" }]]);

    expect(applySessions(usage, counts, starts).files[AUTH]).toEqual({ ...usage.files[AUTH], sessionsSinceRead: 1 });
  });

  it("ages nothing when no session ran, however long ago the last read was", () => {
    expect(applySessions(usage, new Map(), []).files[AUTH]?.sessionsSinceRead).toBe(7);
  });
});

describe("readUsage and writeUsage", () => {
  it("writes sorted keys in the format the repo's usage.json has, and reads them back", () => {
    const dir = tempDir();
    writeUsage(dir, { version: 1, files: {} });
    expect(readFileSync(path.join(dir, "usage.json"), "utf8")).toBe('{\n  "version": 1,\n  "files": {}\n}\n');

    writeUsage(dir, { version: 1, files: { [TESTS]: { created: "2026-11-08", reads: 0, lastRead: null }, [AUTH]: { created: "2026-11-01", reads: 2, lastRead: null } } });
    expect(Object.keys(readUsage(dir).files)).toEqual([AUTH, TESTS]);
  });

  it("refuses an invalid file, naming the field", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "usage.json"), JSON.stringify({ version: 1, files: { [AUTH]: { created: "2026-11-01", reads: -1, lastRead: null } } }));
    expect(() => readUsage(dir)).toThrow(/files\.memories\/api-auth\.md\.reads/);
  });
});
