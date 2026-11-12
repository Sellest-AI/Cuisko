/**
 * usage/ ranks the index, and the index decides which topics a session sees at start (spec §4.4,
 * §10.8). A read counted twice pushes a topic up for nothing; a read missed lets a useful one sink
 * out of the first 200 lines. Each dream writes its own file, so the totals must come out the same
 * however many files hold them.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
type Usage = { version: 2; sessions: string[]; reads: Record<string, { count: number; last: string }> };
type Counts = Map<string, { count: number; last: string }>;
type Totals = Map<string, { reads: number; lastRead: string | null; sessionsSinceRead: number }>;
const { countReads, dreamUsage, formatUsage, newUsageFile, readUsageFiles, sessionStarts, totals } = lib as unknown as {
  countReads: (input: { lines: Line[]; repoRoot: string; topics: string[]; since: string; until: string }) => Counts;
  dreamUsage: (counts: Counts, starts: string[]) => Usage;
  formatUsage: (usage: Usage) => string;
  newUsageFile: (usage: Usage, options: { today: string; taken: Set<string> }) => { name: string; text: string };
  readUsageFiles: (dir: string) => { name: string; usage: Usage | null; error: string | null }[];
  sessionStarts: (input: { lines: Line[]; repoRoot: string; since: string; until: string }) => string[];
  totals: (usages: Usage[], topics: Map<string, { created: string }>) => Totals;
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
const AUTH = "api-auth";
const TESTS = "test-conventions";
const TOPICS = [AUTH, TESTS, "git-hook", "git-hook-scripts"];
const AUTH_FACT = ".claude/memory/memories/api-auth/dates-are-timestamps-k3f9.md";
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

const count = (lines: Line[]) => countReads({ lines, repoRoot: ROOT, topics: TOPICS, ...WINDOW });
const ONE = { count: 1, last: "2026-11-05T10:00:00.000Z" };

describe("countReads", () => {
  it.each([
    ["Read of the built topic file", call("Read", { file_path: String.raw`C:\work\cuisko\.claude\memory\.built\api-auth.md` })],
    ["Read of a fact", call("Read", { file_path: AUTH_FACT })],
    ["cat in Bash", call("Bash", { command: "cat .claude/memory/.built/api-auth.md | head -20" })],
    ["Get-Content in PowerShell, with backslashes", call("PowerShell", { command: String.raw`Get-Content .claude\memory\memories\api-auth\dates-are-timestamps-k3f9.md` })],
    ["Grep whose path is the topic folder", call("Grep", { pattern: "token", path: ".claude/memory/memories/api-auth" })],
    ["Read of the file before facts", call("Read", { file_path: ".claude/memory/memories/api-auth.md" })],
    [
      "ctx_execute_file",
      call("mcp__plugin_context-mode_context-mode__ctx_execute_file", {
        path: String.raw`C:\work\cuisko\.claude\memory\.built\api-auth.md`,
        language: "javascript",
        code: "",
      }),
    ],
  ])("counts a %s once", (_name, line) => {
    expect(count([line])).toEqual(new Map([[AUTH, ONE]]));
  });

  it("counts one call naming the same topic twice once, and two topics once each", () => {
    const line = call("Bash", {
      command: "cat .claude/memory/.built/api-auth.md .claude/memory/.built/api-auth.md .claude/memory/.built/test-conventions.md",
    });
    expect([...count([line]).entries()].map(([topic, { count: reads }]) => [topic, reads])).toEqual([
      [AUTH, 1],
      [TESTS, 1],
    ]);
  });

  it("counts only its own reads for a topic whose name is a prefix of another", () => {
    const line = call("Read", { file_path: ".claude/memory/memories/git-hook-scripts/quoted-names-k3f9.md" });
    expect([...count([line]).keys()]).toEqual(["git-hook-scripts"]);
  });

  it("keeps the newest read as last", () => {
    const lines = [
      call("Read", { file_path: AUTH_FACT }, { timestamp: "2026-11-06T09:00:00.000Z" }),
      call("Read", { file_path: AUTH_FACT }, { timestamp: "2026-11-02T09:00:00.000Z" }),
    ];
    expect(count(lines).get(AUTH)).toEqual({ count: 2, last: "2026-11-06T09:00:00.000Z" });
  });

  it.each([
    ["a dream session", call("Read", { file_path: AUTH_FACT }, { cwd: String.raw`C:\work\cuisko\.tmp\memory\dream-x` })],
    ["another repo", call("Read", { file_path: AUTH_FACT }, { cwd: String.raw`C:\work\cuisko-web` })],
    ["a read before the window", call("Read", { file_path: AUTH_FACT }, { timestamp: "2026-11-01T00:00:00.000Z" })],
    ["a read after the window", call("Read", { file_path: AUTH_FACT }, { timestamp: "2026-11-08T00:00:01.000Z" })],
    ["an Edit", call("Edit", { file_path: AUTH_FACT, old_string: "a", new_string: "b" })],
    ["a longer name ending the same", call("Read", { file_path: ".claude/memory/oldmemories/api-auth.md" })],
    ["the built index", call("Read", { file_path: ".claude/memory/.built/index.md" })],
  ])("does not count %s", (_name, line) => {
    expect(count([line]).size).toBe(0);
  });

  it("counts a read on an open branch: reads are counted on every branch", () => {
    expect(count([call("Read", { file_path: AUTH_FACT }, { branch: "feat/unmerged" })]).get(AUTH)?.count).toBe(1);
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
      message: { role: "assistant", content: [{ type: "tool_use", name: "Read", input: { file_path: AUTH_FACT } }] },
    };
    const blob = { type: "api-request-blob", timestamp: assistant.timestamp, messages: [assistant.message] };
    writeFileSync(file, `${JSON.stringify(assistant)}\n${JSON.stringify(blob)}\n`);
    expect(count(readLines(file)).get(AUTH)?.count).toBe(1);
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

const usage = (sessions: string[], reads: Usage["reads"] = {}): Usage => ({ version: 2, sessions, reads });
const TOPIC_DATES = new Map([
  [AUTH, { created: "2026-10-01" }],
  [TESTS, { created: "2026-11-04" }],
]);

describe("totals", () => {
  it("sums the counts of every file and keeps the latest last", () => {
    const files = [
      usage([], { [AUTH]: { count: 2, last: "2026-11-03T00:00:00.000Z" } }),
      usage([], { [AUTH]: { count: 3, last: "2026-11-02T00:00:00.000Z" } }),
    ];
    expect(totals(files, TOPIC_DATES).get(AUTH)).toEqual({ reads: 5, lastRead: "2026-11-03T00:00:00.000Z", sessionsSinceRead: 0 });
  });

  it("counts the distinct session starts after the last read", () => {
    const files = [
      usage(["2026-11-02T09:00:00.000Z", "2026-11-05T09:00:00.000Z"], { [AUTH]: { count: 1, last: "2026-11-03T00:00:00.000Z" } }),
      usage(["2026-11-05T09:00:00.000Z", "2026-11-06T09:00:00.000Z"]),
    ];
    expect(totals(files, TOPIC_DATES).get(AUTH)?.sessionsSinceRead).toBe(2);
  });

  it("counts a topic never read from its created date, and gives it no reads", () => {
    const files = [usage(["2026-11-03T09:00:00.000Z", "2026-11-05T09:00:00.000Z"])];
    expect(totals(files, TOPIC_DATES).get(TESTS)).toEqual({ reads: 0, lastRead: null, sessionsSinceRead: 1 });
  });

  it("ignores a topic since deleted", () => {
    const files = [usage([], { gone: { count: 9, last: "2026-11-03T00:00:00.000Z" } })];
    expect([...totals(files, TOPIC_DATES).keys()]).toEqual([AUTH, TESTS]);
  });
});

describe("formatUsage and newUsageFile", () => {
  it("writes sessions sorted and distinct and topics sorted, so the same usage gives the same bytes", () => {
    const text = formatUsage(
      usage(["2026-11-05T09:00:00.000Z", "2026-11-02T09:00:00.000Z", "2026-11-05T09:00:00.000Z"], {
        [TESTS]: { count: 1, last: "2026-11-05T10:00:00.000Z" },
        [AUTH]: { count: 2, last: "2026-11-05T11:00:00.000Z" },
      }),
    );
    expect(JSON.parse(text)).toEqual({
      version: 2,
      sessions: ["2026-11-02T09:00:00.000Z", "2026-11-05T09:00:00.000Z"],
      reads: { [AUTH]: { count: 2, last: "2026-11-05T11:00:00.000Z" }, [TESTS]: { count: 1, last: "2026-11-05T10:00:00.000Z" } },
    });
    expect(Object.keys(JSON.parse(text).reads)).toEqual([AUTH, TESTS]);
  });

  it("names a dream's file by today and an id not taken", () => {
    const taken = new Set<string>();
    for (let draw = 0; draw < 50; draw++) {
      const { name } = newUsageFile(usage([]), { today: "2026-11-14", taken });
      expect(name).toMatch(/^2026-11-14-[a-z0-9]{4}\.json$/);
      expect(taken.has(name)).toBe(false);
      taken.add(name);
    }
  });

  it("builds a dream's usage from its counts and starts", () => {
    const counts: Counts = new Map([[AUTH, ONE]]);
    expect(dreamUsage(counts, ["2026-11-05T09:00:00.000Z"])).toEqual(usage(["2026-11-05T09:00:00.000Z"], { [AUTH]: ONE }));
  });
});

describe("readUsageFiles", () => {
  const folderWith = (files: Record<string, string>) => {
    const dir = tempDir();
    mkdirSync(path.join(dir, "usage"));
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, "usage", name), text);
    return dir;
  };

  it("reads every file, sorted by name, and nothing for a missing folder", () => {
    const dir = folderWith({ "2026-11-14-a1b2.json": formatUsage(usage([])), "2026-10.json": formatUsage(usage([])) });
    expect(readUsageFiles(dir).map(({ name, error }) => [name, error])).toEqual([
      ["2026-10.json", null],
      ["2026-11-14-a1b2.json", null],
    ]);
    expect(readUsageFiles(tempDir())).toEqual([]);
  });

  it("returns a malformed file with its error, never throws", () => {
    const dir = folderWith({
      "2026-11-14-a1b2.json": "{ not json",
      "2026-11-14-c3d4.json": JSON.stringify({ version: 2, sessions: [], reads: { [AUTH]: { count: -1, last: "2026-11-05T10:00:00.000Z" } } }),
      "notes.json": formatUsage(usage([])),
    });
    const [bad, negative, misnamed] = readUsageFiles(dir);
    expect(bad).toMatchObject({ usage: null, error: expect.stringMatching(/not JSON/) });
    expect(negative).toMatchObject({ usage: null, error: expect.stringMatching(/reads\.api-auth\.count/) });
    expect(misnamed).toMatchObject({ usage: null, error: expect.stringMatching(/not "<YYYY-MM-DD>-<id>\.json"/) });
  });

  it("returns a folder inside usage/ as malformed, never throws", () => {
    const dir = folderWith({});
    mkdirSync(path.join(dir, "usage", "2026-10.json"));
    expect(readUsageFiles(dir)).toEqual([{ name: "2026-10.json", text: "", usage: null, error: "2026-10.json: not a file" }]);
  });
});
