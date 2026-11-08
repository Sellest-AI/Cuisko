/**
 * The index order decides which memories a session sees at start (spec §4.3, §10.8): a new file
 * must not sink before anyone reads it, an old favourite must not stay on top forever, and the
 * same memory must always give the same bytes, or every dream shows a diff for nothing.
 */
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/memoryIndex.mjs";

/** `memoryIndex.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
type Entry = { created: string; reads: number; lastRead: string | null };
type Usage = { version: 1; files: Record<string, Entry> };
type File = { path: string; title: string; summary: string };
const { FIXED_HEADER, HALF_LIFE_DAYS, headOfIndex, renderIndex, score } = lib as unknown as {
  FIXED_HEADER: string;
  HALF_LIFE_DAYS: number;
  headOfIndex: (text: string, maxLines?: number) => string;
  renderIndex: (input: { files: File[]; usage: Usage; now: Date }) => string;
  score: (entry: Entry, now: Date) => number;
};

const NOW = new Date("2026-11-08T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const dateDaysAgo = (days: number) => daysAgo(days).slice(0, 10);

const file = (name: string, title: string): File => ({ path: `memories/${name}.md`, title, summary: `About ${title.toLowerCase()}.` });

/** The titles, in index order. */
const order = (files: File[], entries: Record<string, Entry>) =>
  renderIndex({ files, usage: { version: 1, files: entries }, now: NOW })
    .split("\n")
    .filter((line) => line.startsWith("- ["))
    .map((line) => line.slice(3, line.indexOf("]")));

const old = (reads: number, lastReadDaysAgo: number | null): Entry => ({
  created: dateDaysAgo(90),
  reads,
  lastRead: lastReadDaysAgo === null ? null : daysAgo(lastReadDaysAgo),
});

describe("score", () => {
  it("halves every HALF_LIFE_DAYS without a read", () => {
    expect(score(old(8, 0), NOW)).toBe(8);
    expect(score(old(8, HALF_LIFE_DAYS), NOW)).toBeCloseTo(4);
    expect(score(old(8, 2 * HALF_LIFE_DAYS), NOW)).toBeCloseTo(2);
  });

  it("is 0 for a file never read", () => {
    expect(score(old(0, null), NOW)).toBe(0);
  });
});

describe("renderIndex", () => {
  const auth = file("api-auth", "API authentication");
  const tests = file("test-conventions", "Test conventions");
  const upload = file("upload", "Upload limits");
  const planner = file("planner", "Planner");

  it("puts files in grace first, newest first, then the rest by score", () => {
    const entries = {
      [auth.path]: old(10, 1),
      [tests.path]: old(2, 1),
      [upload.path]: { created: dateDaysAgo(2), reads: 0, lastRead: null },
      [planner.path]: { created: dateDaysAgo(20), reads: 0, lastRead: null },
    };
    expect(order([tests, auth, planner, upload], entries)).toEqual(["Upload limits", "Planner", "API authentication", "Test conventions"]);
  });

  it("lets an old favourite fall below a file read recently", () => {
    const entries = { [auth.path]: old(10, 120), [tests.path]: old(2, 1) };
    expect(order([auth, tests], entries)).toEqual(["Test conventions", "API authentication"]);
  });

  it("breaks a tie by title", () => {
    expect(order([tests, auth], { [auth.path]: old(0, null), [tests.path]: old(0, null) })).toEqual([
      "API authentication",
      "Test conventions",
    ]);
  });

  it("treats a file usage.json does not list yet as new", () => {
    expect(order([auth, upload], { [auth.path]: old(50, 0) })).toEqual(["Upload limits", "API authentication"]);
  });

  it("writes one line per file, title and summary on one line, and the same bytes every time", () => {
    const messy = { path: "memories/x.md", title: "Two\nlines", summary: "  spread\n  out  " };
    const input = { files: [messy, auth], usage: { version: 1 as const, files: { [auth.path]: old(1, 1) } }, now: NOW };
    const text = renderIndex(input);
    expect(text).toBe(
      `${FIXED_HEADER}\n- [Two lines](memories/x.md): spread out\n- [API authentication](memories/api-auth.md): About api authentication.\n`,
    );
    expect(renderIndex(input)).toBe(text);
  });
});

describe("headOfIndex", () => {
  const index = (memories: number) =>
    `${FIXED_HEADER}\n${Array.from({ length: memories }, (_, i) => `- [M${i}](memories/m${i}.md): s`).join("\n")}\n`;
  const headerLines = FIXED_HEADER.split("\n").length; // the header's lines and the blank one after it

  it("returns an index of up to the limit whole", () => {
    const text = index(200 - headerLines);
    expect(text.split("\n").length - 1).toBe(200);
    expect(headOfIndex(text)).toBe(text);
  });

  it("past the limit, shows limit lines, the last one naming how many memories are left out", () => {
    const text = index(200 - headerLines + 5);
    const head = headOfIndex(text).replace(/\n$/, "").split("\n");
    expect(head).toHaveLength(200);
    expect(head[199]).toBe("… 6 more memories, less used, are listed in .claude/memory/index.md.");
    expect(head[198]).toMatch(/^- \[M/);
  });

  it("says one memory in the singular", () => {
    expect(headOfIndex("a\nb\n- [M](memories/m.md): s\n", 2)).toBe("a\n… 1 more memory, less used, is listed in .claude/memory/index.md.\n");
  });
});
