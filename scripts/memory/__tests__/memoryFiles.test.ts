/**
 * The reader of a memory folder (spec §4.2, P5). C20, the dream and the built index all build on
 * what it returns, so a title read wrong lands in the index, and a fact read wrong hides one with
 * no source date.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import * as lib from "../_lib/memoryFiles.mjs";

type Fact = {
  path: string;
  topic: string;
  id: string | null;
  title: string | null;
  status: string | null;
  created: string | null;
  lastVerified: string | null;
  fact: string;
  errors: string[];
};
const { citedDocs, fileLinks, isEncrypted, isFactName, isTopicName, readFacts, topicOf, topicsOf } = lib as unknown as {
  citedDocs: (text: string) => string[];
  fileLinks: (text: string) => string[];
  isEncrypted: (text: string) => boolean;
  isFactName: (name: string) => boolean;
  isTopicName: (name: string) => boolean;
  readFacts: (dir: string) => { facts: Fact[]; strays: string[] };
  topicOf: (memoryPath: string) => string | null;
  topicsOf: (facts: Fact[]) => Map<string, Fact[]>;
};

const dirs: string[] = [];
const folderWith = (files: Record<string, string>) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cuisko-memfiles-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
};
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const header = (title = "Convex dates are timestamps") =>
  `---\ntitle: ${title}\nstatus: volatile\ncreated: 2026-11-02\nlast_verified: 2026-11-08\n---\n\n`;
const FACT = "The Convex API refuses ISO dates: it needs timestamps in milliseconds. (source: 2026-11-02)\n";

describe("readFacts", () => {
  it("reads a fact's header, topic, id and text", () => {
    const dir = folderWith({ "memories/convex-api/convex-dates-are-timestamps-k3f9.md": `${header()}${FACT}` });
    const [fact] = readFacts(dir).facts;
    expect(fact).toMatchObject({
      path: "memories/convex-api/convex-dates-are-timestamps-k3f9.md",
      topic: "convex-api",
      id: "k3f9",
      title: "Convex dates are timestamps",
      status: "volatile",
      created: "2026-11-02",
      lastVerified: "2026-11-08",
      fact: FACT.trim(),
      errors: [],
    });
  });

  it("joins a fact wrapped over several lines, and stops at the Links section", () => {
    const text = `${header()}The Convex API refuses ISO dates:\nit needs timestamps. (source: 2026-11-02)\n\n## Links\n\n- \`docs/ARCHITECTURE.md\`\n`;
    const [fact] = readFacts(folderWith({ "memories/convex-api/dates-k3f9.md": text })).facts;
    expect(fact?.fact).toBe("The Convex API refuses ISO dates: it needs timestamps. (source: 2026-11-02)");
    expect(fact?.errors).toEqual([]);
  });

  it("names a missing source date, a missing fact and a missing title as errors", () => {
    const dir = folderWith({
      "memories/a/no-source-k3f9.md": `${header()}The API refuses ISO dates.\n`,
      "memories/a/no-fact-p2a7.md": `${header()}## Links\n`,
      "memories/a/no-title-x8c1.md": `---\nstatus: stable\ncreated: 2026-11-02\nlast_verified: 2026-11-08\n---\n\n${FACT}`,
    });
    const errors = Object.fromEntries(readFacts(dir).facts.map((fact) => [fact.path.split("/")[2], fact.errors.join(" | ")]));
    expect(errors["no-source-k3f9.md"]).toMatch(/without a source date/);
    expect(errors["no-fact-p2a7.md"]).toMatch(/no fact/);
    expect(errors["no-title-x8c1.md"]).toMatch(/header title/);
  });

  it("names a bad file name and a bad topic folder", () => {
    const dir = folderWith({
      "memories/a/Dates.md": `${header()}${FACT}`,
      "memories/Bad_Topic/dates-k3f9.md": `${header()}${FACT}`,
      "memories/index/dates-k3f9.md": `${header()}${FACT}`,
    });
    const byPath = Object.fromEntries(readFacts(dir).facts.map((fact) => [fact.path, fact.errors.join(" | ")]));
    expect(byPath["memories/a/Dates.md"]).toMatch(/file name/);
    expect(byPath["memories/Bad_Topic/dates-k3f9.md"]).toMatch(/topic folder/);
    expect(byPath["memories/index/dates-k3f9.md"]).toMatch(/reserved/);
  });

  it("returns facts in path order, strays apart, and nothing for a missing folder", () => {
    const dir = folderWith({
      "memories/b/second-p2a7.md": `${header()}${FACT}`,
      "memories/a/first-k3f9.md": `${header()}${FACT}`,
      "memories/flat.md": `${header()}${FACT}`,
      "memories/a/notes.txt": "x",
      "memories/a/nested/deep-x8c1.md": `${header()}${FACT}`,
    });
    const { facts, strays } = readFacts(dir);
    expect(facts.map((fact) => fact.path)).toEqual(["memories/a/first-k3f9.md", "memories/b/second-p2a7.md"]);
    expect(strays).toEqual(["memories/a/nested", "memories/a/notes.txt", "memories/flat.md"]);
    expect(readFacts(folderWith({}))).toEqual({ facts: [], strays: [] });
  });
});

describe("topicsOf", () => {
  it("groups facts by topic, topics in name order", () => {
    const dir = folderWith({
      "memories/b/one-k3f9.md": `${header()}${FACT}`,
      "memories/a/two-p2a7.md": `${header()}${FACT}`,
      "memories/a/three-x8c1.md": `${header()}${FACT}`,
    });
    const topics = topicsOf(readFacts(dir).facts);
    expect([...topics.keys()]).toEqual(["a", "b"]);
    expect(topics.get("a")?.length).toBe(2);
  });
});

describe("the name rules", () => {
  it("accepts a slug of at most 50 characters and a 4-character id", () => {
    expect(isFactName("stand-in-hook-needs-mode-755-p2a7.md")).toBe(true);
    expect(isFactName(`${"a".repeat(50)}-p2a7.md`)).toBe(true);
    expect(isFactName(`${"a".repeat(51)}-p2a7.md`)).toBe(false);
    expect(isFactName("stand-in-hook-p2a.md")).toBe(false);
    expect(isFactName("Stand-in-p2a7.md")).toBe(false);
    expect(isFactName("p2a7.md")).toBe(false);
  });

  it("refuses a topic named index, and one that is not lowercase words", () => {
    expect(isTopicName("windows-shell-traps")).toBe(true);
    expect(isTopicName("index")).toBe(false);
    expect(isTopicName("Windows")).toBe(false);
    expect(isTopicName("a--b")).toBe(false);
  });
});

describe("topicOf", () => {
  it("finds the topic of a fact, a folder, a built topic file and a file of the old layout", () => {
    expect(topicOf(".claude/memory/memories/windows-shell-traps/stand-in-hook-p2a7.md")).toBe("windows-shell-traps");
    expect(topicOf(".claude/memory/memories/windows-shell-traps")).toBe("windows-shell-traps");
    expect(topicOf(".claude/memory/memories/windows-shell-traps/")).toBe("windows-shell-traps");
    expect(topicOf(".claude/memory/.built/windows-shell-traps.md")).toBe("windows-shell-traps");
    expect(topicOf(".claude/memory/memories/windows-shell-traps.md")).toBe("windows-shell-traps");
    expect(topicOf("C:\\repo\\.claude\\memory\\memories\\testing-on-web\\x-k3f9.md")).toBe("testing-on-web");
  });

  it("names no topic for the built index or a path outside the memory", () => {
    expect(topicOf(".claude/memory/.built/index.md")).toBeNull();
    expect(topicOf("docs/ARCHITECTURE.md")).toBeNull();
  });
});

describe("fileLinks and citedDocs", () => {
  it("keeps links to files, drops web links and anchors, strips a fragment", () => {
    expect(fileLinks("[a](a.md) [b](https://x.io) [c](#top) [d](d.md#part) [e](mailto:a@b.co)")).toEqual(["a.md", "d.md"]);
  });

  it("ignores an example link written as code, inline or fenced, and still finds a real one beside it", () => {
    const text = "An example is `[x](path.md)`.\n\n```md\n[y](other.md)\n```\n\nSee [real](real.md).";
    expect(fileLinks(text)).toEqual(["real.md"]);
  });

  it("finds docs/ paths in backticks only, without trailing punctuation or globs", () => {
    expect(citedDocs("See `docs/A.md`, and `docs/adr/*.md`, and docs/B.md, and `src/x.ts`.")).toEqual(["docs/A.md"]);
    expect(citedDocs("`docs/A.md.`")).toEqual(["docs/A.md"]);
  });
});

describe("isEncrypted", () => {
  it("recognises the transcrypt header and nothing else", () => {
    expect(isEncrypted("U2FsdGVkX1+abc")).toBe(true);
    expect(isEncrypted("# Cuisko project memory")).toBe(false);
  });
});
