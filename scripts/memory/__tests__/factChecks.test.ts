/**
 * The rules C20 holds the memory to (spec P5), one broken fixture per rule. Each test starts from a
 * memory that passes and breaks one thing, so a finding names exactly that thing.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/factChecks.mjs";

type Finding = { file: string; message: string; fix: string; line?: number };
const { checkMemory, factsEncrypted } = lib as unknown as {
  checkMemory: (memoryDir: string, options: { full: boolean; identity: Record<string, string>; root: string; repoMemory: string }) => Finding[];
  factsEncrypted: (memoryDir: string) => boolean;
};

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const FACT = (title: string, body: string) => `---\ntitle: ${title}\nstatus: stable\ncreated: 2026-11-02\nlast_verified: 2026-11-08\n---\n\n${body}\n`;
const ISO = FACT("Convex refuses ISO dates", "Convex refuses an ISO date string in a v.number() field. (source: 2026-11-02)");
const HOOK = FACT("Hooks read a temporary index", "A pre-commit hook sees a temporary index under `git commit -- <paths>`. (source: 2026-11-05)");
const USAGE = JSON.stringify({ version: 2, sessions: ["2026-11-10T08:00:00.000Z"], reads: { "convex-api": { count: 1, last: "2026-11-10T09:00:00.000Z" } } });

const ISO_PATH = "convex-api/convex-refuses-iso-dates-k3x9.md";

/** A repo root holding `.claude/memory` with the owner's files, the given facts and usage files. */
const repo = (facts: Record<string, string> = { [ISO_PATH]: ISO, "git-hooks/hooks-read-a-temporary-index-a1b2.md": HOOK }, usage: Record<string, string> = { "2026-11-12-u1u1.json": USAGE }) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fact-checks-"));
  dirs.push(root);
  const memory = path.join(root, ".claude", "memory");
  mkdirSync(path.join(memory, "memories"), { recursive: true });
  mkdirSync(path.join(memory, "usage"));
  writeFileSync(path.join(memory, "README.md"), "# Rules\n");
  writeFileSync(path.join(memory, "_template.md"), "# Template\n");
  for (const [name, text] of Object.entries(facts)) {
    mkdirSync(path.dirname(path.join(memory, "memories", name)), { recursive: true });
    writeFileSync(path.join(memory, "memories", name), text);
  }
  for (const [name, text] of Object.entries(usage)) writeFileSync(path.join(memory, "usage", name), text);
  return { root, memory };
};

const check = ({ root, memory }: { root: string; memory: string }, { full = false, identity = {}, repoMemory = memory } = {}) =>
  checkMemory(memory, { full, identity, root, repoMemory });
const messages = (findings: Finding[]) => findings.map((finding) => finding.message);

describe("checkMemory, stable", () => {
  it("finds nothing in a coherent memory, nor in an empty one", () => {
    expect(check(repo())).toEqual([]);
    expect(check(repo({}, {}))).toEqual([]);
  });

  it.each([
    ["no header", ISO.slice(ISO.indexOf("Convex refuses an")), "no YAML header"],
    ["no title", ISO.replace("title: Convex refuses ISO dates\n", ""), "header title"],
    ["a status that is neither stable nor volatile", ISO.replace("status: stable", "status: maybe"), "header status"],
    ["a created that is not a date", ISO.replace("created: 2026-11-02", "created: yesterday"), "header created"],
    ["a header key the template does not have", ISO.replace("status: stable", "status: stable\nsummary: x"), "header"],
    ["no fact", FACT("Empty", "## Links\n\n- `docs/A.md`"), "no fact before the first ## heading"],
    ["a fact with no source date", FACT("No date", "Convex refuses ISO dates."), "fact without a source date: Convex refuses ISO dates."],
    ["a source date that is not last", FACT("Date first", "(source: 2026-11-02) then more words"), "fact without a source date"],
  ])("finds a fact with %s", (_name, text, expected) => {
    const findings = check(repo({ [ISO_PATH]: text }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain(expected);
    expect(findings[0]?.file).toMatch(/convex-refuses-iso-dates-k3x9\.md$/);
  });

  it("accepts a fact wrapped over lines, a correction date, and a Links section with no dates", () => {
    const wrapped = FACT("Wrapped", "A long fact\nthat wraps. (source: correction of 2026-11-08)\n\n## Links\n\n- an item with no date");

    expect(check(repo({ [ISO_PATH]: wrapped }))).toEqual([]);
  });

  it("finds a file name outside the rule, and a topic folder that is not lowercase words", () => {
    expect(messages(check(repo({ "convex-api/Convex_ISO.md": ISO })))).toEqual([expect.stringContaining("file name is not")]);
    expect(messages(check(repo({ "Convex/convex-refuses-iso-dates-k3x9.md": ISO })))).toEqual([expect.stringContaining('topic folder "Convex"')]);
    expect(messages(check(repo({ "index/convex-refuses-iso-dates-k3x9.md": ISO })))).toEqual([expect.stringContaining('topic folder "index"')]);
  });

  it("finds a dead link between facts, and accepts one that resolves", () => {
    const linking = (target: string) => FACT("Links", `Convex refuses ISO dates. (source: 2026-11-02)\n\n## Links\n\n- [Hooks](${target})\n- [Web](https://example.com)`);

    expect(messages(check(repo({ [ISO_PATH]: linking("../git-hooks/gone-zz11.md") })))).toEqual(["dead link to ../git-hooks/gone-zz11.md"]);
    expect(check(repo({ [ISO_PATH]: linking("../git-hooks/hooks-read-a-temporary-index-a1b2.md"), "git-hooks/hooks-read-a-temporary-index-a1b2.md": HOOK }))).toEqual([]);
  });

  it("finds a file directly under memories/, a folder inside a topic, and a file that is not .md", () => {
    const findings = check(repo({ "flat.md": ISO, "convex-api/sub/deep.md": ISO, "convex-api/notes.txt": "x" }));

    expect(findings.map((finding) => path.basename(finding.file)).sort()).toEqual(["flat.md", "notes.txt", "sub"]);
    expect(new Set(messages(findings)).size).toBe(1);
  });

  it("finds a usage file that does not parse, and names it", () => {
    const findings = check(repo(undefined, { "2026-11-12-u1u1.json": USAGE, "2026-11-12-bad1.json": '{"version":1}' }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toMatch(/2026-11-12-bad1\.json$/);
    expect(findings[0]?.message).toContain("usage file does not parse");
  });

  it("finds personal data in a fact and in a usage file, without echoing it", () => {
    const leaked = FACT("Leak", "Ask jean.dupont@example.com about it. (source: 2026-11-02)");
    const usage = JSON.stringify({ version: 2, sessions: [], reads: {}, note: "camille.martin@example.com" });

    const findings = check(repo({ [ISO_PATH]: leaked }, { "2026-11-12-u1u1.json": usage }), { identity: {} });

    expect(messages(findings).filter((message) => message.startsWith("personal data"))).toHaveLength(2);
    expect(JSON.stringify(findings)).not.toContain("jean.dupont");
    expect(JSON.stringify(findings)).not.toContain("camille.martin");
  });

  it("does not check a cited docs/ path, which another commit can rename", () => {
    const cites = FACT("Cites", "See `docs/GONE.md`. (source: 2026-11-02)");

    expect(check(repo({ [ISO_PATH]: cites }))).toEqual([]);
  });
});

describe("checkMemory, full", () => {
  it("finds a cited docs/ path that is gone, and accepts it once it exists", () => {
    const tree = repo({ [ISO_PATH]: FACT("Cites", "See `docs/GONE.md`. (source: 2026-11-02)") });

    expect(messages(check(tree, { full: true }))).toEqual(["cited path docs/GONE.md does not exist"]);
    mkdirSync(path.join(tree.root, "docs"));
    writeFileSync(path.join(tree.root, "docs", "GONE.md"), "# here\n");
    expect(check(tree, { full: true })).toEqual([]);
  });

  it("finds README.md or _template.md changed in a copy, and not in the repo's own folder", () => {
    const tree = repo();
    const copy = repo();
    writeFileSync(path.join(copy.memory, "README.md"), "# Rewritten by an agent\n");

    expect(messages(check({ root: tree.root, memory: copy.memory }, { full: true, repoMemory: tree.memory }))).toEqual(["README.md differs from the repo's copy"]);
    expect(check(copy, { full: true })).toEqual([]);
  });
});

describe("factsEncrypted", () => {
  it("is true when a fact is ciphertext, and false when only a usage file looks like it", () => {
    expect(factsEncrypted(repo({ [ISO_PATH]: "U2FsdGVkX1+abcdef" }).memory)).toBe(true);
    expect(factsEncrypted(repo(undefined, { "2026-11-12-u1u1.json": "U2FsdGVkX1+abcdef" }).memory)).toBe(false);
    expect(factsEncrypted(repo({}, {}).memory)).toBe(false);
  });
});
