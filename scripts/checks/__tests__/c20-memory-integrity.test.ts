/**
 * C20's own tests (spec P5, §11.1).
 *
 * C20 has two modes because `pnpm verify` runs it on every commit while two of its rules move
 * without an edit: the index order follows the date, and a cited `docs/` path dies when a doc is
 * renamed. So half of these cases are pairs: the same tree must fail in `--full` and pass in the
 * stable mode. A stable mode that failed on the date would break every commit made a month later.
 */
import { afterEach, expect, it } from "vitest";

import * as memoryIndexModule from "../../memory/_lib/memoryIndex.mjs";
import { cleanupTrees, makeTree, passed, runCheck, type Tree } from "./_harness";

type Usage = { version: 1; files: Record<string, { created: string; reads: number; lastRead: string | null }> };
const memoryIndex = memoryIndexModule as unknown as {
  FIXED_HEADER: string;
  renderIndex: (input: { files: { path: string; title: string; summary: string }[]; usage: Usage; now: Date }) => string;
};

const NOW = new Date("2026-11-08T12:00:00Z");
const MEMORY = ".claude/memory";
const README = "# Rules\n";
const TEMPLATE = "---\nsummary: x\n---\n";

const file = (title: string, summary: string, facts: string[], extra = "") =>
  `---\nsummary: ${summary}\nstatus: stable\nlast_verified: 2026-11-08\n---\n\n# ${title}\n\n## Facts\n\n${facts.map((fact) => `- ${fact}`).join("\n")}\n${extra}`;

const ALPHA = file("Alpha", "About alpha.", ["Alpha is true. (source: 2026-11-02)", "Alpha was fixed. (source: correction of 2026-11-08)"]);
const BETA = file("Beta", "About beta.", ["Beta is true. (source: 2026-11-05)"]);

const usageOf = (created: Record<string, string>): Usage => ({
  version: 1,
  files: Object.fromEntries(Object.entries(created).map(([name, date]) => [name, { created: date, reads: 0, lastRead: null }])),
});

/** A coherent memory: the index is the one renderIndex builds, so a test breaks exactly one thing. */
const memoryTree = (memories: Record<string, string> = { "alpha.md": ALPHA, "beta.md": BETA }): Tree => {
  const created = Object.fromEntries(Object.keys(memories).map((name, i) => [`memories/${name}`, `2026-11-0${i + 2}`]));
  const titles = Object.entries(memories).map(([name, text]) => ({
    path: `memories/${name}`,
    title: /^# (.+)$/m.exec(text)?.[1] ?? "",
    summary: /^summary: (.+)$/m.exec(text)?.[1] ?? "",
  }));
  return {
    [`${MEMORY}/README.md`]: README,
    [`${MEMORY}/_template.md`]: TEMPLATE,
    [`${MEMORY}/index.md`]: memoryIndex.renderIndex({ files: titles, usage: usageOf(created), now: NOW }),
    [`${MEMORY}/usage.json`]: JSON.stringify(usageOf(created)),
    ...Object.fromEntries(Object.entries(memories).map(([name, text]) => [`${MEMORY}/memories/${name}`, text])),
  };
};

/** The index of a tree. A Tree is a plain record, so a lookup is typed as possibly missing. */
const indexOf = (tree: Tree) => tree[`${MEMORY}/index.md`] ?? "";

const NO_IDENTITY = ["--identity", "{}"];
const stable = (tree: Tree, extra: string[] = []) => runCheck("c20-memory-integrity.mjs", tree, undefined, [...NO_IDENTITY, ...extra]);
const full = (tree: Tree, extra: string[] = []) => stable(tree, ["--full", "--now", NOW.toISOString(), ...extra]);

afterEach(cleanupTrees);

it("passes a coherent memory in both modes", () => {
  const tree = memoryTree();

  expect(passed(stable(tree))).toBe(true);
  expect(passed(full(tree))).toBe(true);
});

it("passes the folder with no memory file yet: the header-only index", () => {
  expect(passed(full(memoryTree({})))).toBe(true);
});

it.each([
  ["no summary", ALPHA.replace("summary: About alpha.\n", ""), "summary"],
  ["a status that is neither stable nor volatile", ALPHA.replace("status: stable", "status: maybe"), "status"],
  ["a last_verified that is not a date", ALPHA.replace("2026-11-08\n---", "yesterday\n---"), "last_verified"],
  ["no header at all", ALPHA.slice(ALPHA.indexOf("# Alpha")), "no YAML header"],
  ["no title", ALPHA.replace("# Alpha", "Alpha"), "Title"],
])("rejects a memory file with %s", (_name, text, expected) => {
  const tree = memoryTree({ "alpha.md": ALPHA });
  tree[`${MEMORY}/memories/alpha.md`] = text;

  const result = stable(tree);

  expect(result.code).toBe(1);
  expect(result.output).toContain(expected);
});

it("rejects a fact with no source date, and one whose date is not last", () => {
  const tree = memoryTree({ "alpha.md": file("Alpha", "About alpha.", ["No date here.", "(source: 2026-11-02) then more words"]) });

  const result = stable(tree);

  expect(result.code).toBe(1);
  expect(result.output).toContain("fact without a source date: No date here.");
  expect(result.output).toContain("then more words");
});

it("reads a fact wrapped over two lines as one", () => {
  const wrapped = file("Alpha", "About alpha.", [], "").replace("## Facts\n\n", "## Facts\n\n- A long fact\n  that wraps. (source: 2026-11-02)\n");

  expect(passed(stable(memoryTree({ "alpha.md": wrapped })))).toBe(true);
});

it("does not ask for a source date outside the Facts section", () => {
  const withLinks = file("Alpha", "About alpha.", ["Alpha. (source: 2026-11-02)"], "\n## Links\n\n- an item with no date\n");

  expect(passed(stable(memoryTree({ "alpha.md": withLinks })))).toBe(true);
});

it("rejects a link to a memory file that does not exist, and accepts one that does", () => {
  const dead = file("Alpha", "About alpha.", ["Alpha. (source: 2026-11-02)"], "\n## Links\n\n- [Gone](gone.md)\n");
  const alive = file("Alpha", "About alpha.", ["Alpha. (source: 2026-11-02)"], "\n## Links\n\n- [Beta](beta.md)\n- [Web](https://example.com)\n");

  const rejected = stable(memoryTree({ "alpha.md": dead, "beta.md": BETA }));

  expect(rejected.code).toBe(1);
  expect(rejected.output).toContain("dead link to gone.md");
  expect(passed(stable(memoryTree({ "alpha.md": alive, "beta.md": BETA })))).toBe(true);
});

it("rejects a stray file and a subfolder in memories/", () => {
  const tree = { ...memoryTree(), [`${MEMORY}/memories/notes.txt`]: "x", [`${MEMORY}/memories/sub/deep.md`]: "x" };

  const result = stable(tree);

  expect(result.output).toContain("memories/notes.txt");
  expect(result.output).toContain("memories/sub");
});

it("rejects a usage.json missing a file's entry, holding an extra one, or invalid", () => {
  const missing = memoryTree();
  missing[`${MEMORY}/usage.json`] = JSON.stringify(usageOf({ "memories/alpha.md": "2026-11-02" }));
  const extra = memoryTree();
  extra[`${MEMORY}/usage.json`] = JSON.stringify(usageOf({ "memories/alpha.md": "2026-11-02", "memories/beta.md": "2026-11-03", "memories/gone.md": "2026-11-01" }));
  const invalid = memoryTree();
  invalid[`${MEMORY}/usage.json`] = '{"version":2}';

  expect(stable(missing).output).toContain("no entry for memories/beta.md");
  expect(stable(extra).output).toContain("entry for memories/gone.md, which does not exist");
  expect(stable(invalid).code).toBe(1);
});

it("rejects an index missing a line, listing a stranger, listing a file twice, or with a changed header", () => {
  const index = indexOf(memoryTree());
  const lines = index.trimEnd().split("\n");
  const [first = "", second = ""] = lines.slice(-2);
  const without = { ...memoryTree(), [`${MEMORY}/index.md`]: `${lines.slice(0, -1).join("\n")}\n` };
  const stranger = { ...memoryTree(), [`${MEMORY}/index.md`]: `${index}- [Ghost](memories/ghost.md): None.\n` };
  const twice = { ...memoryTree(), [`${MEMORY}/index.md`]: `${index}${second}\n` };
  const header = { ...memoryTree(), [`${MEMORY}/index.md`]: index.replace("Do not edit them.", "Edit freely.") };

  expect(stable(without).output).toContain("missing or changed line");
  expect(stable(stranger).output).toContain("line for no memory file");
  expect(stable(twice).output).toContain("listed twice");
  expect(stable(header).output).toContain("fixed header");
  expect(first).toContain("- [");
});

it("rejects a changed summary in the index", () => {
  const tree = memoryTree();
  tree[`${MEMORY}/index.md`] = indexOf(tree).replace("About alpha.", "About something else.");

  expect(stable(tree).output).toContain("missing or changed line");
});

it("rejects personal data in a memory file and in the index, without echoing it", () => {
  const leaked = file("Alpha", "About alpha.", ["Ask jean.dupont@example.com. (source: 2026-11-02)"]);
  const tree = memoryTree({ "alpha.md": leaked });

  const result = stable(tree);

  expect(result.code).toBe(1);
  expect(result.output).toContain("personal data (email)");
  expect(result.output).not.toContain("jean.dupont");
});

it("rejects the owner's identity when one is injected", () => {
  const leaked = file("Alpha", "About alpha.", ["Written by Camille Martin. (source: 2026-11-02)"]);
  const tree = memoryTree({ "alpha.md": leaked });

  const result = runCheck("c20-memory-integrity.mjs", tree, undefined, ["--identity", '{"gitName":"Camille Martin"}']);

  expect(result.code).toBe(1);
  expect(result.output).toContain("personal data (owner)");
});

it("accepts the same text when no such identity is injected", () => {
  const text = file("Alpha", "About alpha.", ["Written by Camille Martin. (source: 2026-11-02)"]);

  expect(passed(stable(memoryTree({ "alpha.md": text })))).toBe(true);
});

it("skips encrypted memory and never reads the identity", () => {
  const tree = memoryTree();
  tree[`${MEMORY}/index.md`] = "U2FsdGVkX1+abcdef";

  const result = runCheck("c20-memory-integrity.mjs", tree, undefined, ["--identity", "this is not json"]);

  expect(result.code).toBe(0);
  expect(result.output).toContain("skipped");
});

it("skips encrypted memory files, not only an encrypted index", () => {
  const tree = memoryTree();
  tree[`${MEMORY}/memories/alpha.md`] = "U2FsdGVkX1+abcdef";

  expect(runCheck("c20-memory-integrity.mjs", tree, undefined, ["--full"]).output).toContain("skipped");
});

it("skips when there is no memory folder", () => {
  const result = runCheck("c20-memory-integrity.mjs", { "src/a.ts": "" }, undefined, ["--full"]);

  expect(result.code).toBe(0);
  expect(result.output).toContain("skipped");
});

it("stable mode ignores the date: the same memory sixty days later still passes", () => {
  const later = new Date(NOW.getTime() + 60 * 86_400_000).toISOString();

  expect(passed(stable(memoryTree(), ["--now", later]))).toBe(true);
});

it("full mode rejects lines in the wrong order, where stable accepts them", () => {
  const tree = memoryTree();
  const lines = indexOf(tree).trimEnd().split("\n");
  const [a = "", b = ""] = lines.slice(-2);
  tree[`${MEMORY}/index.md`] = `${[...lines.slice(0, -2), b, a].join("\n")}\n`;

  expect(passed(stable(tree))).toBe(true);
  expect(full(tree).code).toBe(1);
  expect(full(tree).output).toContain("differs from what the script generates");
});

it("full mode rejects a cited docs/ path that is gone, where stable accepts it", () => {
  const cites = file("Alpha", "About alpha.", ["See `docs/GONE.md`. (source: 2026-11-02)"]);
  const tree = memoryTree({ "alpha.md": cites });

  expect(passed(stable(tree))).toBe(true);
  expect(full(tree).output).toContain("cited path docs/GONE.md does not exist");
  expect(passed(full({ ...tree, "docs/GONE.md": "# here\n" }))).toBe(true);
});

it("full mode rejects README.md or _template.md changed in the dream's copy", () => {
  const repo = makeTree(memoryTree());
  const copy = makeTree({ ...memoryTree(), [`${MEMORY}/README.md`]: "# Rewritten by an agent\n" });

  const result = runCheck("c20-memory-integrity.mjs", {}, repo, [...NO_IDENTITY, "--full", "--now", NOW.toISOString(), "--memory-dir", `${copy}/${MEMORY}`]);

  expect(result.code).toBe(1);
  expect(result.output).toContain("README.md differs from the repo's copy");
});

it("checks the folder it is pointed at, not the repo's", () => {
  const repo = makeTree(memoryTree());
  const copy = makeTree({ ...memoryTree({ "alpha.md": file("Alpha", "About alpha.", ["No date."]) }) });

  const result = runCheck("c20-memory-integrity.mjs", {}, repo, [...NO_IDENTITY, "--memory-dir", `${copy}/${MEMORY}`]);

  expect(result.code).toBe(1);
  expect(result.output).toContain("fact without a source date");
});

it("rejects an unknown argument and a flag with no value, instead of passing", () => {
  expect(stable(memoryTree(), ["--ful"]).output).toContain("unknown argument --ful");
  expect(runCheck("c20-memory-integrity.mjs", memoryTree(), undefined, ["--memory-dir"]).output).toContain("--memory-dir needs a value");
  expect(stable(memoryTree(), ["--now", "soon"]).output).toContain("--now is not a date");
});

it("rejects an identity that is not JSON, once past the skip", () => {
  const result = runCheck("c20-memory-integrity.mjs", memoryTree(), undefined, ["--identity", "nope"]);

  expect(result.code).toBe(1);
  expect(result.output).toContain("--identity is not valid JSON");
});
