/**
 * The built folder is what a session reads at start (spec §4.3). It is rebuilt every start, by
 * sessions that may start together, on Windows where a reader can hold a file: a half-written
 * index, or one that names a deleted topic, would mislead every session until the next start.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/built.mjs";

type Built = { encrypted: boolean; index: string | null; topics: number; warnings: string[] };
const { buildMemory } = lib as unknown as { buildMemory: (memoryDir: string, options: { now: Date }) => Built };

const NOW = new Date("2026-11-14T12:00:00.000Z");
const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

const FACT = (title: string, date: string) =>
  `---\ntitle: ${title}\nstatus: stable\ncreated: ${date}\nlast_verified: ${date}\n---\n\n${title} holds. (source: ${date})\n`;

/** A memory folder holding `facts` (path under memories/ → text) and `usage` (file name → JSON text). */
const memory = (facts: Record<string, string>, usage: Record<string, string> = {}) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "memory-built-"));
  created.push(dir);
  for (const [name, text] of Object.entries(facts)) {
    mkdirSync(path.dirname(path.join(dir, "memories", name)), { recursive: true });
    writeFileSync(path.join(dir, "memories", name), text);
  }
  mkdirSync(path.join(dir, "usage"));
  for (const [name, text] of Object.entries(usage)) writeFileSync(path.join(dir, "usage", name), text);
  return dir;
};
const built = (dir: string) => readdirSync(path.join(dir, ".built")).sort();
const readBuilt = (dir: string, name: string) => readFileSync(path.join(dir, ".built", name), "utf8");

const TWO_TOPICS = {
  "api-auth/tokens-expire-k3f9.md": FACT("Tokens expire", "2026-09-01"),
  "windows-shell-traps/halved-backslashes-p2a7.md": FACT("Halved backslashes", "2026-09-02"),
};
const READS = JSON.stringify({ version: 2, sessions: [], reads: { "windows-shell-traps": { count: 4, last: "2026-11-10T00:00:00.000Z" } } });

describe("buildMemory", () => {
  it("writes the index and one file per topic, ranked by the usage files, and leaves no temporary file", () => {
    const dir = memory(TWO_TOPICS, { "2026-11-10-a1b2.json": READS });
    const result = buildMemory(dir, { now: NOW });

    expect(result).toMatchObject({ encrypted: false, topics: 2, warnings: [] });
    expect(built(dir)).toEqual(["api-auth.md", "index.md", "windows-shell-traps.md"]);
    expect(readBuilt(dir, "index.md")).toBe(result.index);
    expect(
      readBuilt(dir, "index.md")
        .split("\n")
        .filter((line) => line.startsWith("- [")),
    ).toEqual([
      "- [Windows shell traps](.claude/memory/.built/windows-shell-traps.md): Halved backslashes",
      "- [Api auth](.claude/memory/.built/api-auth.md): Tokens expire",
    ]);
    expect(readBuilt(dir, "api-auth.md")).toContain("Tokens expire holds. (source: 2026-09-01)");
  });

  it("removes the file of a topic since deleted, and keeps what is not a topic file", () => {
    const dir = memory(TWO_TOPICS);
    buildMemory(dir, { now: NOW });
    rmSync(path.join(dir, "memories", "api-auth"), { recursive: true });
    writeFileSync(path.join(dir, ".built", "notes.txt"), "");

    buildMemory(dir, { now: NOW });

    expect(built(dir)).toEqual(["index.md", "notes.txt", "windows-shell-traps.md"]);
    expect(readBuilt(dir, "index.md")).not.toContain("api-auth");
  });

  it("removes a temporary file a killed build left, and keeps one a running build is writing", () => {
    const dir = memory(TWO_TOPICS);
    buildMemory(dir, { now: NOW });
    const orphan = path.join(dir, ".built", "api-auth.md.4242-dead.tmp");
    const live = path.join(dir, ".built", "api-auth.md.4343-live.tmp");
    writeFileSync(orphan, "half");
    writeFileSync(live, "half");
    utimesSync(orphan, new Date(NOW.getTime() - 5 * 60_000), new Date(NOW.getTime() - 5 * 60_000));
    utimesSync(live, new Date(NOW.getTime() - 10_000), new Date(NOW.getTime() - 10_000));

    buildMemory(dir, { now: NOW });

    expect(built(dir)).toEqual(["api-auth.md", "api-auth.md.4343-live.tmp", "index.md", "windows-shell-traps.md"]);
  });

  it("rebuilds a built folder deleted by hand", () => {
    const dir = memory(TWO_TOPICS);
    buildMemory(dir, { now: NOW });
    rmSync(path.join(dir, ".built"), { recursive: true });

    buildMemory(dir, { now: NOW });

    expect(built(dir)).toEqual(["api-auth.md", "index.md", "windows-shell-traps.md"]);
  });

  it("gives the same bytes when two starts build one after the other", () => {
    const dir = memory(TWO_TOPICS);
    const first = buildMemory(dir, { now: NOW });
    const second = buildMemory(dir, { now: NOW });
    expect(second.index).toBe(first.index);
    expect(readBuilt(dir, "index.md")).toBe(first.index);
  });

  it("keeps the old file when a rename fails, and says the memory may be stale", () => {
    const dir = memory(TWO_TOPICS);
    // A non-empty folder where the topic file goes: the rename over it fails on every system.
    mkdirSync(path.join(dir, ".built", "api-auth.md"), { recursive: true });
    writeFileSync(path.join(dir, ".built", "api-auth.md", "held"), "");

    const result = buildMemory(dir, { now: NOW });

    expect(result.warnings).toEqual([expect.stringMatching(/^the built memory may be stale, some files were kept: api-auth\.md: /)]);
    expect(existsSync(path.join(dir, ".built", "api-auth.md", "held"))).toBe(true);
    expect(built(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(readBuilt(dir, "index.md")).toContain("Api auth");
  });

  it("skips a malformed usage file and names it", () => {
    const dir = memory(TWO_TOPICS, { "2026-11-10-a1b2.json": "{ broken", "2026-11-11-c3d4.json": READS });
    const result = buildMemory(dir, { now: NOW });
    expect(result.warnings).toEqual([expect.stringMatching(/^usage file skipped: 2026-11-10-a1b2\.json: not JSON/)]);
    expect(result.index?.split("\n").find((line) => line.startsWith("- ["))).toMatch(/^- \[Windows shell traps\]/);
  });

  it("drops a topic every fact of which was removed", () => {
    const dir = memory(TWO_TOPICS);
    rmSync(path.join(dir, "memories", "api-auth", "tokens-expire-k3f9.md"));
    expect(buildMemory(dir, { now: NOW }).topics).toBe(1);
    expect(built(dir)).toEqual(["index.md", "windows-shell-traps.md"]);
  });

  it("writes nothing while the facts are still encrypted", () => {
    const dir = memory({ "api-auth/tokens-expire-k3f9.md": "U2FsdGVkX1+abcdefgh" });
    expect(buildMemory(dir, { now: NOW })).toEqual({ encrypted: true, index: null, topics: 0, warnings: [] });
    expect(existsSync(path.join(dir, ".built"))).toBe(false);
  });
});
