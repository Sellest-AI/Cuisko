/**
 * C20's own tests (spec P5, §11.1): what the check adds to its rules. Each rule has its broken
 * fixture in scripts/memory/__tests__/factChecks.test.ts; here are the modes, the skip, the
 * arguments and the report.
 *
 * The modes are pairs: a cited `docs/` path dies when a doc is renamed, without an edit to the
 * memory, so the same tree must fail in `--full` and pass in the stable mode. A stable mode that
 * failed on it would break an unrelated commit.
 */
import { afterEach, expect, it } from "vitest";

import { cleanupTrees, makeTree, passed, runCheck, type Tree } from "./_harness";

const MEMORY = ".claude/memory";
const FACT = (title: string, body: string) => `---\ntitle: ${title}\nstatus: stable\ncreated: 2026-11-02\nlast_verified: 2026-11-08\n---\n\n${body}\n`;
const ISO = `${MEMORY}/memories/convex-api/convex-refuses-iso-dates-k3x9.md`;
const USAGE = `${MEMORY}/usage/2026-11-12-u1u1.json`;

/** A coherent memory: two facts in two topics and one usage file. */
const memoryTree = (facts: Record<string, string> = {}): Tree => ({
  [`${MEMORY}/README.md`]: "# Rules\n",
  [`${MEMORY}/_template.md`]: "# Template\n",
  [ISO]: FACT("Convex refuses ISO dates", "Convex refuses an ISO date string in a v.number() field. (source: 2026-11-02)"),
  [`${MEMORY}/memories/git-hooks/hooks-read-a-temporary-index-a1b2.md`]: FACT("Hooks read a temporary index", "A hook sees a temporary index. (source: 2026-11-05)"),
  [USAGE]: JSON.stringify({ version: 2, sessions: ["2026-11-10T08:00:00.000Z"], reads: { "convex-api": { count: 1, last: "2026-11-10T09:00:00.000Z" } } }),
  ...facts,
});

const NO_IDENTITY = ["--identity", "{}"];
const stable = (tree: Tree, extra: string[] = []) => runCheck("c20-memory-integrity.mjs", tree, undefined, [...NO_IDENTITY, ...extra]);
const full = (tree: Tree, extra: string[] = []) => stable(tree, ["--full", ...extra]);

afterEach(cleanupTrees);

it("passes a coherent memory in both modes, and a memory with no fact yet", () => {
  expect(passed(stable(memoryTree()))).toBe(true);
  expect(passed(full(memoryTree()))).toBe(true);
  expect(passed(full({ [`${MEMORY}/README.md`]: "# Rules\n" }))).toBe(true);
});

it("fails on a broken fact and names its file and the rule", () => {
  const result = stable(memoryTree({ [ISO]: FACT("No date", "Convex refuses ISO dates.") }));

  expect(result.code).toBe(1);
  expect(result.output).toContain("convex-refuses-iso-dates-k3x9.md");
  expect(result.output).toContain("fact without a source date");
});

it("fails on a usage file that does not parse", () => {
  const result = stable(memoryTree({ [USAGE]: '{"version":1}' }));

  expect(result.code).toBe(1);
  expect(result.output).toContain("usage file does not parse");
});

it("reports personal data by line, never echoing it", () => {
  const result = stable(memoryTree({ [ISO]: FACT("Leak", "Ask jean.dupont@example.com. (source: 2026-11-02)") }));

  expect(result.code).toBe(1);
  expect(result.output).toContain("personal data (email)");
  expect(result.output).not.toContain("jean.dupont");
});

it("rejects the owner's identity when one is injected, and accepts the same text without it", () => {
  const tree = memoryTree({ [ISO]: FACT("Author", "Written by Camille Martin. (source: 2026-11-02)") });

  const result = runCheck("c20-memory-integrity.mjs", tree, undefined, ["--identity", '{"gitName":"Camille Martin"}']);

  expect(result.code).toBe(1);
  expect(result.output).toContain("personal data (owner)");
  expect(passed(stable(tree))).toBe(true);
});

it("skips when a fact is ciphertext, and never reads the identity", () => {
  const result = runCheck("c20-memory-integrity.mjs", memoryTree({ [ISO]: "U2FsdGVkX1+abcdef" }), undefined, ["--full", "--identity", "this is not json"]);

  expect(result.code).toBe(0);
  expect(result.output).toContain("skipped");
});

it("does not skip on a plaintext usage folder beside plaintext facts: usage/ is never encrypted", () => {
  const result = stable(memoryTree({ [ISO]: FACT("No date", "No date.") }));

  expect(result.output).not.toContain("skipped");
});

it("skips when there is no memory folder", () => {
  const result = runCheck("c20-memory-integrity.mjs", { "src/a.ts": "" }, undefined, ["--full"]);

  expect(result.code).toBe(0);
  expect(result.output).toContain("skipped");
});

it("full mode rejects a cited docs/ path that is gone, where stable accepts it", () => {
  const tree = memoryTree({ [ISO]: FACT("Cites", "See `docs/GONE.md`. (source: 2026-11-02)") });

  expect(passed(stable(tree))).toBe(true);
  expect(full(tree).output).toContain("cited path docs/GONE.md does not exist");
  expect(passed(full({ ...tree, "docs/GONE.md": "# here\n" }))).toBe(true);
});

it("full mode rejects README.md or _template.md changed in the dream's copy", () => {
  const repo = makeTree(memoryTree());
  const copy = makeTree({ ...memoryTree(), [`${MEMORY}/README.md`]: "# Rewritten by an agent\n" });

  const result = runCheck("c20-memory-integrity.mjs", {}, repo, [...NO_IDENTITY, "--full", "--memory-dir", `${copy}/${MEMORY}`]);

  expect(result.code).toBe(1);
  expect(result.output).toContain("README.md differs from the repo's copy");
});

it("checks the folder it is pointed at, not the repo's", () => {
  const repo = makeTree(memoryTree());
  const copy = makeTree(memoryTree({ [ISO]: FACT("No date", "No date.") }));

  const result = runCheck("c20-memory-integrity.mjs", {}, repo, [...NO_IDENTITY, "--memory-dir", `${copy}/${MEMORY}`]);

  expect(result.code).toBe(1);
  expect(result.output).toContain("fact without a source date");
});

it("rejects an unknown argument and a flag with no value, instead of passing", () => {
  expect(stable(memoryTree(), ["--ful"]).output).toContain("unknown argument --ful");
  expect(stable(memoryTree(), ["--now", "2026-11-12T00:00:00Z"]).output).toContain("unknown argument --now");
  expect(runCheck("c20-memory-integrity.mjs", memoryTree(), undefined, ["--memory-dir"]).output).toContain("--memory-dir needs a value");
});

it("rejects an identity that is not JSON, once past the skip", () => {
  const result = runCheck("c20-memory-integrity.mjs", memoryTree(), undefined, ["--identity", "nope"]);

  expect(result.code).toBe(1);
  expect(result.output).toContain("--identity is not valid JSON");
});
