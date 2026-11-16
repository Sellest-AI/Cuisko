/**
 * Moving the memory between the repo and the dream's copy (spec §9.1 U4, U6). The mirror is the
 * step that touches the repo's memory, so what it must not touch is as much the test as what it
 * writes: the owner's README and template, the usage files already there, and the built folder.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/memoryDir.mjs";

type Snapshot = Map<string, string>;
const { changedPaths, compareMemories, copyMemory, mirrorMemory, snapshotMemory } = lib as unknown as {
  changedPaths: (before: Snapshot, after: Snapshot) => string[];
  compareMemories: (from: string, to: string) => { created: string[]; modified: string[]; deleted: string[] };
  copyMemory: (from: string, to: string) => void;
  mirrorMemory: (from: string, to: string) => void;
  snapshotMemory: (dir: string) => Snapshot;
};

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A memory folder: the owner's two files, the given facts (`<topic>/<name>` -> text), the given
 * usage files (`<name>` -> text) and a built folder.
 */
const folder = (facts: Record<string, string> = {}, usage: Record<string, string> = {}) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "memory-dir-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "README.md"), "# Rules\n");
  writeFileSync(path.join(dir, "_template.md"), "# Template\n");
  mkdirSync(path.join(dir, ".built"));
  writeFileSync(path.join(dir, ".built", "index.md"), "built index\n");
  mkdirSync(path.join(dir, "memories"));
  for (const [name, text] of Object.entries(facts)) {
    mkdirSync(path.dirname(path.join(dir, "memories", name)), { recursive: true });
    writeFileSync(path.join(dir, "memories", name), text);
  }
  mkdirSync(path.join(dir, "usage"));
  for (const [name, text] of Object.entries(usage)) writeFileSync(path.join(dir, "usage", name), text);
  return dir;
};
const emptyDir = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "memory-dir-"));
  dirs.push(dir);
  return dir;
};

describe("compareMemories", () => {
  it("lists the facts the second folder created, modified and lacks, sorted", () => {
    const from = folder({ "api/a-aaaa.md": "A", "api/b-bbbb.md": "B", "git/c-cccc.md": "C" });
    const to = folder({ "api/a-aaaa.md": "A", "api/b-bbbb.md": "B2", "git/z-zzzz.md": "Z", "api/d-dddd.md": "D" });

    expect(compareMemories(from, to)).toEqual({
      created: ["memories/api/d-dddd.md", "memories/git/z-zzzz.md"],
      modified: ["memories/api/b-bbbb.md"],
      deleted: ["memories/git/c-cccc.md"],
    });
  });

  it("sees no difference when only the usage files or the built folder differ", () => {
    const from = folder({ "api/a-aaaa.md": "A" });
    const to = folder({ "api/a-aaaa.md": "A" }, { "2026-11-12-x1y2.json": "{}" });
    writeFileSync(path.join(to, ".built", "index.md"), "a different ranking\n");

    expect(compareMemories(from, to)).toEqual({ created: [], modified: [], deleted: [] });
  });

  it("sees a file put directly under memories/, outside any topic", () => {
    expect(compareMemories(folder(), folder({ "stray.md": "S" })).created).toEqual(["memories/stray.md"]);
  });

  it("reads a folder with no memories/ as empty", () => {
    expect(compareMemories(emptyDir(), folder({ "api/a-aaaa.md": "A" })).created).toEqual(["memories/api/a-aaaa.md"]);
  });
});

describe("copyMemory", () => {
  it("copies every file but the built folder, and makes memories/ and usage/ even when the source had none", () => {
    const from = emptyDir();
    writeFileSync(path.join(from, "README.md"), "# Rules\n");
    mkdirSync(path.join(from, ".built"));
    writeFileSync(path.join(from, ".built", "index.md"), "built\n");
    const to = path.join(emptyDir(), "copy");

    copyMemory(from, to);

    expect(readFileSync(path.join(to, "README.md"), "utf8")).toBe("# Rules\n");
    expect(existsSync(path.join(to, ".built"))).toBe(false);
    expect(existsSync(path.join(to, "memories"))).toBe(true);
    expect(existsSync(path.join(to, "usage"))).toBe(true);
    expect([...snapshotMemory(to).keys()]).toEqual(["README.md"]);
  });
});

describe("mirrorMemory", () => {
  it("makes the facts equal, deletions included, and removes a topic folder left empty", () => {
    const from = folder({ "api/a-aaaa.md": "A new", "api/b-bbbb.md": "B", "hooks/n-nnnn.md": "N" });
    const to = folder({ "api/a-aaaa.md": "A old", "gone/g-gggg.md": "G" });

    mirrorMemory(from, to);

    expect([...snapshotMemory(to).keys()].filter((name) => name.startsWith("memories/"))).toEqual(["memories/api/a-aaaa.md", "memories/api/b-bbbb.md", "memories/hooks/n-nnnn.md"]);
    expect(readFileSync(path.join(to, "memories", "api", "a-aaaa.md"), "utf8")).toBe("A new");
    expect(existsSync(path.join(to, "memories", "gone"))).toBe(false);
  });

  it("adds the usage files the target lacks, and never changes or deletes one it has", () => {
    const from = folder({}, { "2026-11-12-new1.json": "new", "2026-11-01-both.json": "changed in the copy" });
    const to = folder({}, { "2026-11-01-both.json": "repo", "2026-10-folded.json": "folded" });

    mirrorMemory(from, to);

    expect(readFileSync(path.join(to, "usage", "2026-11-12-new1.json"), "utf8")).toBe("new");
    expect(readFileSync(path.join(to, "usage", "2026-11-01-both.json"), "utf8")).toBe("repo");
    expect(readFileSync(path.join(to, "usage", "2026-10-folded.json"), "utf8")).toBe("folded");
  });

  it("never touches README.md, _template.md or the built folder", () => {
    const from = folder();
    writeFileSync(path.join(from, "README.md"), "# Rewritten by an agent\n");
    writeFileSync(path.join(from, "_template.md"), "# Rewritten\n");
    writeFileSync(path.join(from, ".built", "index.md"), "copy's index\n");
    const to = folder();

    mirrorMemory(from, to);

    expect(readFileSync(path.join(to, "README.md"), "utf8")).toBe("# Rules\n");
    expect(readFileSync(path.join(to, "_template.md"), "utf8")).toBe("# Template\n");
    expect(readFileSync(path.join(to, ".built", "index.md"), "utf8")).toBe("built index\n");
  });

  it("creates memories/ and usage/ in a target that has none", () => {
    const from = folder({ "api/a-aaaa.md": "A" }, { "2026-11-12-u1u1.json": "u" });
    const to = emptyDir();

    mirrorMemory(from, to);

    expect(readFileSync(path.join(to, "memories", "api", "a-aaaa.md"), "utf8")).toBe("A");
    expect(readFileSync(path.join(to, "usage", "2026-11-12-u1u1.json"), "utf8")).toBe("u");
  });
});

describe("snapshotMemory and changedPaths", () => {
  it("holds the owner's files, the facts and the usage files, never the built folder", () => {
    const dir = folder({ "api/a-aaaa.md": "A" }, { "2026-11-12-u1u1.json": "u" });

    expect([...snapshotMemory(dir).keys()]).toEqual(["README.md", "_template.md", "memories/api/a-aaaa.md", "usage/2026-11-12-u1u1.json"]);
  });

  it("names what changed, appeared or vanished between two snapshots", () => {
    const dir = folder({ "api/a-aaaa.md": "A", "api/b-bbbb.md": "B" });
    const before = snapshotMemory(dir);
    writeFileSync(path.join(dir, "memories", "api", "a-aaaa.md"), "A2");
    rmSync(path.join(dir, "memories", "api", "b-bbbb.md"));
    writeFileSync(path.join(dir, "README.md"), "tampered");
    writeFileSync(path.join(dir, "usage", "2026-11-12-u1u1.json"), "u");

    expect(changedPaths(before, snapshotMemory(dir))).toEqual(["README.md", "memories/api/a-aaaa.md", "memories/api/b-bbbb.md", "usage/2026-11-12-u1u1.json"]);
  });
});
