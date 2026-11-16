/**
 * The index order decides which topics a session sees at start (spec §4.3, §10.8): a new topic
 * must not sink before anyone reads it, an old favourite must not stay on top forever, and the
 * same memory must always give the same bytes, or every dream shows a ranking change for nothing.
 */
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/memoryIndex.mjs";

/** `memoryIndex.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
type Fact = {
  path: string;
  title: string | null;
  status: string | null;
  created: string | null;
  lastVerified: string | null;
  body: string;
  fact: string;
};
type Total = { reads: number; lastRead: string | null };
const { FIXED_HEADER, HALF_LIFE_DAYS, headOfIndex, renderTopic, renderTopicIndex, score, topicTitle } = lib as unknown as {
  FIXED_HEADER: string;
  HALF_LIFE_DAYS: number;
  headOfIndex: (text: string, maxLines?: number) => string;
  renderTopic: (topic: string, facts: Fact[]) => string;
  renderTopicIndex: (topics: Map<string, Fact[]>, totals: Map<string, Total>, options: { now: Date }) => string;
  score: (total: Total, now: Date) => number;
  topicTitle: (topic: string) => string;
};

const NOW = new Date("2026-11-08T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const dateDaysAgo = (days: number) => daysAgo(days).slice(0, 10);

const fact = (topic: string, name: string, title: string, created = dateDaysAgo(90), source = created): Fact => ({
  path: `memories/${topic}/${name}.md`,
  title,
  status: "stable",
  created,
  lastVerified: created,
  body: `\n${title} is true. (source: ${source})\n`,
  fact: `${title} is true. (source: ${source})`,
});
const read = (reads: number, lastReadDaysAgo: number | null): Total => ({ reads, lastRead: lastReadDaysAgo === null ? null : daysAgo(lastReadDaysAgo) });

/** The topic titles, in index order. */
const order = (topics: Map<string, Fact[]>, totals: Map<string, Total>) =>
  renderTopicIndex(topics, totals, { now: NOW })
    .split("\n")
    .filter((line) => line.startsWith("- ["))
    .map((line) => line.slice(3, line.indexOf("]")));

describe("score", () => {
  it("halves every HALF_LIFE_DAYS without a read", () => {
    expect(score(read(8, 0), NOW)).toBe(8);
    expect(score(read(8, HALF_LIFE_DAYS), NOW)).toBeCloseTo(4);
    expect(score(read(8, 2 * HALF_LIFE_DAYS), NOW)).toBeCloseTo(2);
  });

  it("is 0 for a topic never read", () => {
    expect(score(read(0, null), NOW)).toBe(0);
  });
});

describe("renderTopicIndex", () => {
  const auth: [string, Fact[]] = ["api-auth", [fact("api-auth", "tokens-k3f9", "Tokens expire")]];
  const tests: [string, Fact[]] = ["test-conventions", [fact("test-conventions", "one-file-a1b2", "One file per module")]];
  const upload: [string, Fact[]] = ["upload", [fact("upload", "limit-b2c3", "Limit is 5 MB", dateDaysAgo(2))]];
  const planner: [string, Fact[]] = ["planner", [fact("planner", "week-c3d4", "Week starts Monday", dateDaysAgo(20))]];

  it("puts topics in grace first, newest first, then the rest by score", () => {
    const totals = new Map([
      ["api-auth", read(10, 1)],
      ["test-conventions", read(2, 1)],
    ]);
    expect(order(new Map([tests, auth, planner, upload]), totals)).toEqual(["Upload", "Planner", "Api auth", "Test conventions"]);
  });

  it("dates a topic by its oldest fact", () => {
    const planned: [string, Fact[]] = ["planner", [fact("planner", "new-d4e5", "New", dateDaysAgo(1)), fact("planner", "old-e5f6", "Old", dateDaysAgo(90))]];
    expect(order(new Map([planned, auth]), new Map([["api-auth", read(1, 1)]]))).toEqual(["Api auth", "Planner"]);
  });

  it("lets an old favourite fall below a topic read recently", () => {
    const totals = new Map([
      ["api-auth", read(10, 120)],
      ["test-conventions", read(2, 1)],
    ]);
    expect(order(new Map([auth, tests]), totals)).toEqual(["Test conventions", "Api auth"]);
  });

  it("breaks a tie by topic name", () => {
    expect(order(new Map([tests, auth]), new Map())).toEqual(["Api auth", "Test conventions"]);
  });

  it("links each topic from the repo root, with its 6 newest titles then the count of the rest", () => {
    const facts = Array.from({ length: 8 }, (_, i) => fact("windows-shell-traps", `f${i}-a1b${i}`, `Trap ${i}`, dateDaysAgo(90 - i)));
    const text = renderTopicIndex(new Map([["windows-shell-traps", facts]]), new Map(), { now: NOW });
    expect(text).toBe(
      `${FIXED_HEADER}\n- [Windows shell traps](.claude/memory/.built/windows-shell-traps.md): Trap 7 · Trap 6 · Trap 5 · Trap 4 · Trap 3 · Trap 2 · … +2 more\n`,
    );
  });

  it("writes a title on one line, names a fact with a malformed header by its file, and gives the same bytes every time", () => {
    const facts = [fact("api-auth", "two-k3f9", "Two\nlines"), { ...fact("api-auth", "no-header-q9d2", "x"), title: null, created: null }];
    const topics = new Map([["api-auth", facts]]);
    const text = renderTopicIndex(topics, new Map(), { now: NOW });
    expect(text).toContain("): Two lines · no-header-q9d2\n");
    expect(renderTopicIndex(topics, new Map(), { now: NOW })).toBe(text);
  });

  it("is the header alone for an empty memory", () => {
    expect(renderTopicIndex(new Map(), new Map(), { now: NOW })).toBe(FIXED_HEADER);
  });
});

describe("renderTopic", () => {
  it("lists the facts oldest learnt first, each under its title with the file it lives in", () => {
    const later = fact("api-auth", "a-later-k3f9", "Later", "2026-10-01", "2026-10-05");
    const earlier = fact("api-auth", "z-earlier-p2a7", "Earlier", "2026-10-01", "2026-10-02");
    expect(renderTopic("api-auth", [later, earlier])).toBe(
      [
        "# Api auth",
        "",
        "## Earlier",
        "",
        "`.claude/memory/memories/api-auth/z-earlier-p2a7.md` · stable · verified 2026-10-01",
        "",
        "Earlier is true. (source: 2026-10-02)",
        "",
        "## Later",
        "",
        "`.claude/memory/memories/api-auth/a-later-k3f9.md` · stable · verified 2026-10-01",
        "",
        "Later is true. (source: 2026-10-05)",
        "",
      ].join("\n"),
    );
  });

  it("breaks a tie on the source date by file name", () => {
    const text = renderTopic("api-auth", [fact("api-auth", "b-k3f9", "B"), fact("api-auth", "a-p2a7", "A")]);
    expect(text.indexOf("## A")).toBeLessThan(text.indexOf("## B"));
  });
});

describe("topicTitle", () => {
  it("is the folder name with spaces, the first letter capitalised", () => {
    expect(topicTitle("windows-shell-traps")).toBe("Windows shell traps");
  });
});

describe("headOfIndex", () => {
  const index = (topics: number) =>
    `${FIXED_HEADER}\n${Array.from({ length: topics }, (_, i) => `- [M${i}](.claude/memory/.built/m${i}.md): s`).join("\n")}\n`;
  const headerLines = FIXED_HEADER.split("\n").length; // the header's lines and the blank one after it

  it("returns an index of up to the limit whole", () => {
    const text = index(200 - headerLines);
    expect(text.split("\n").length - 1).toBe(200);
    expect(headOfIndex(text)).toBe(text);
  });

  it("past the limit, shows limit lines, the last one naming how many topics are left out", () => {
    const text = index(200 - headerLines + 5);
    const head = headOfIndex(text).replace(/\n$/, "").split("\n");
    expect(head).toHaveLength(200);
    expect(head[199]).toBe("… 6 more topics, less used, are listed in .claude/memory/.built/index.md.");
    expect(head[198]).toMatch(/^- \[M/);
  });

  it("says one topic in the singular", () => {
    expect(headOfIndex("a\nb\n- [M](m.md): s\n", 2)).toBe("a\n… 1 more topic, less used, is listed in .claude/memory/.built/index.md.\n");
  });
});
