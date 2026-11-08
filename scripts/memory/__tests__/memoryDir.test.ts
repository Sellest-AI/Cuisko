/**
 * Moving the memory between the repo and the dream's copy (spec §9.1 U4, U6). The mirror is the
 * step that touches the repo's memory, so what it must not touch is as much the test as what it
 * writes: the owner's README and template, and any file outside the memory.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/memoryDir.mjs";

type Snapshot = Map<string, string>;
const { changedPaths, compareMemories, copyMemory, mirrorMemory, refreshIndex, snapshotMemory } = lib as unknown as {
  changedPaths: (before: Snapshot, after: Snapshot) => string[];
  compareMemories: (from: string, to: string) => { created: string[]; modified: string[]; deleted: string[] };
  copyMemory: (from: string, to: string) => void;
  mirrorMemory: (from: string, to: string) => void;
  refreshIndex: (dir: string, now: Date, change?: (usage: Usage) => Usage) => { path: string }[];
  snapshotMemory: (dir: string) => Snapshot;
};
type Usage = { version: 1; files: Record<string, { created: string; reads: number; lastRead: string | null }> };

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const FILE = (title: string, summary: string) => `---\nsummary: ${summary}\nstatus: stable\nlast_verified: 2026-11-08\n---\n\n# ${title}\n\n## Facts\n\n- A fact. (source: 2026-11-02)\n`;

/** A memory folder: the four fixed files plus the given memories. */
const folder = (memories: Record<string, string> = {}, usage: Usage["files"] = {}) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "memory-dir-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "README.md"), "# Rules\n");
  writeFileSync(path.join(dir, "_template.md"), "# Template\n");
  writeFileSync(path.join(dir, "index.md"), "index\n");
  writeFileSync(path.join(dir, "usage.json"), JSON.stringify({ version: 1, files: usage }));
  mkdirSync(path.join(dir, "memories"));
  for (const [name, text] of Object.entries(memories)) writeFileSync(path.join(dir, "memories", name), text);
  return dir;
};
const emptyDir = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "memory-dir-"));
  dirs.push(dir);
  return dir;
};

describe("compareMemories", () => {
  it("lists what the second folder created, modified and lacks, sorted", () => {
    const from = folder({ "a.md": "A", "b.md": "B", "c.md": "C" });
    const to = folder({ "a.md": "A", "b.md": "B2", "z.md": "Z", "d.md": "D" });

    expect(compareMemories(from, to)).toEqual({ created: ["memories/d.md", "memories/z.md"], modified: ["memories/b.md"], deleted: ["memories/c.md"] });
  });

  it("sees no difference when only the generated files differ", () => {
    const from = folder({ "a.md": "A" });
    const to = folder({ "a.md": "A" });
    writeFileSync(path.join(to, "index.md"), "a different ranking\n");
    writeFileSync(path.join(to, "usage.json"), '{"version":1,"files":{"x":1}}');

    expect(compareMemories(from, to)).toEqual({ created: [], modified: [], deleted: [] });
  });

  it("reads a folder with no memories/ as empty", () => {
    expect(compareMemories(emptyDir(), folder({ "a.md": "A" })).created).toEqual(["memories/a.md"]);
  });
});

describe("copyMemory", () => {
  it("copies every file, and makes memories/ even when the source had none", () => {
    const from = emptyDir();
    writeFileSync(path.join(from, "README.md"), "# Rules\n");
    const to = path.join(emptyDir(), "copy");

    copyMemory(from, to);

    expect(readFileSync(path.join(to, "README.md"), "utf8")).toBe("# Rules\n");
    expect([...snapshotMemory(to).keys()]).toEqual(["README.md"]);
    expect(compareMemories(to, to)).toEqual({ created: [], modified: [], deleted: [] });
  });
});

describe("mirrorMemory", () => {
  it("makes the generated files and memories/ equal, deletions included", () => {
    const from = folder({ "a.md": "A new", "b.md": "B" });
    writeFileSync(path.join(from, "index.md"), "new index\n");
    writeFileSync(path.join(from, "usage.json"), '{"version":1,"files":{}}');
    const to = folder({ "a.md": "A old", "gone.md": "G" });

    mirrorMemory(from, to);

    expect(readFileSync(path.join(to, "index.md"), "utf8")).toBe("new index\n");
    expect(readFileSync(path.join(to, "usage.json"), "utf8")).toBe('{"version":1,"files":{}}');
    expect([...snapshotMemory(to).keys()]).toEqual(["index.md", "usage.json", "README.md", "_template.md", "memories/a.md", "memories/b.md"]);
    expect(readFileSync(path.join(to, "memories", "a.md"), "utf8")).toBe("A new");
  });

  it("never touches README.md or _template.md, even when the source's differ", () => {
    const from = folder({});
    writeFileSync(path.join(from, "README.md"), "# Rewritten by an agent\n");
    writeFileSync(path.join(from, "_template.md"), "# Rewritten\n");
    const to = folder({});

    mirrorMemory(from, to);

    expect(readFileSync(path.join(to, "README.md"), "utf8")).toBe("# Rules\n");
    expect(readFileSync(path.join(to, "_template.md"), "utf8")).toBe("# Template\n");
  });

  it("creates memories/ in a target that has none", () => {
    const from = folder({ "a.md": "A" });
    const to = emptyDir();

    mirrorMemory(from, to);

    expect(readFileSync(path.join(to, "memories", "a.md"), "utf8")).toBe("A");
  });
});

describe("snapshotMemory and changedPaths", () => {
  it("names what changed, appeared or vanished between two snapshots", () => {
    const dir = folder({ "a.md": "A", "b.md": "B" });
    const before = snapshotMemory(dir);
    writeFileSync(path.join(dir, "memories", "a.md"), "A2");
    rmSync(path.join(dir, "memories", "b.md"));
    writeFileSync(path.join(dir, "README.md"), "tampered");
    writeFileSync(path.join(dir, "memories", "c.md"), "C");

    expect(changedPaths(before, snapshotMemory(dir))).toEqual(["README.md", "memories/a.md", "memories/b.md", "memories/c.md"]);
  });
});

describe("refreshIndex", () => {
  const NOW = new Date("2026-11-08T12:00:00Z");

  it("adds an entry for a new file, drops one for a deleted file, and renders the index", () => {
    const dir = folder({ "a.md": FILE("Alpha", "About alpha."), "new.md": FILE("New one", "About new.") }, { "memories/a.md": { created: "2026-09-01", reads: 5, lastRead: "2026-11-01T00:00:00.000Z" }, "memories/gone.md": { created: "2026-09-01", reads: 1, lastRead: null } });

    refreshIndex(dir, NOW);

    const usage = JSON.parse(readFileSync(path.join(dir, "usage.json"), "utf8")) as Usage;
    expect(usage.files).toEqual({
      "memories/a.md": { created: "2026-09-01", reads: 5, lastRead: "2026-11-01T00:00:00.000Z" },
      "memories/new.md": { created: "2026-11-08", reads: 0, lastRead: null },
    });
    const index = readFileSync(path.join(dir, "index.md"), "utf8");
    expect(index.indexOf("New one")).toBeLessThan(index.indexOf("Alpha"));
    expect(index).toContain("- [Alpha](memories/a.md): About alpha.");
  });

  it("lets the caller adjust the usage after the sync: the reads counted", () => {
    const dir = folder({ "a.md": FILE("Alpha", "About alpha.") }, { "memories/a.md": { created: "2026-09-01", reads: 5, lastRead: null } });

    refreshIndex(dir, NOW, (usage) => ({ ...usage, files: { "memories/a.md": { ...usage.files["memories/a.md"]!, reads: 6 } } }));

    expect((JSON.parse(readFileSync(path.join(dir, "usage.json"), "utf8")) as Usage).files["memories/a.md"]?.reads).toBe(6);
  });

  it("keeps a file with no summary out of the index, leaving C20 to report it", () => {
    const dir = folder({ "bad.md": "no header here\n# Bad\n", "ok.md": FILE("Fine", "About fine.") });

    refreshIndex(dir, NOW);

    const index = readFileSync(path.join(dir, "index.md"), "utf8");
    expect(index).toContain("memories/ok.md");
    expect(index).not.toContain("bad.md");
  });
});
