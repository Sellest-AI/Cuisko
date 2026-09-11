/**
 * C2's own tests.
 *
 * C2 is a line count standing in for a rule that cannot be written exactly — "a router file holds
 * no domain logic". The number is the whole check, so the cases that matter are the ones either
 * side of it: exactly at the cap must pass, one over must fail. An off-by-one here does not break
 * anything visibly, it just moves the boundary the architecture is defended at.
 */
import { afterEach, expect, it } from "vitest";

import { cleanupTrees, runCheck } from "./_harness";

const MAX_LINES = 90;

/** A file of exactly `count` lines. */
const linesOf = (count: number) => Array.from({ length: count }, (_, i) => `// ${i}`).join("\n");

const runC2 = (files: Record<string, string>) =>
  runCheck(
    "c2-router-size.mjs",
    Object.fromEntries(Object.entries(files).map(([name, body]) => [`convex/router/${name}`, body])),
  );

afterEach(cleanupTrees);

it("accepts a file of exactly the cap", () => {
  const { code } = runC2({ "getOne.ts": linesOf(MAX_LINES) });

  expect(code).toBe(0);
});

it("rejects a file one line over the cap", () => {
  const { code, output } = runC2({ "getOne.ts": linesOf(MAX_LINES + 1) });

  expect(code).toBe(1);
  expect(output).toContain(`${MAX_LINES + 1} lines — the cap is ${MAX_LINES}`);
});

it("names the file that is too long, not just the count", () => {
  const { output } = runC2({
    "getOne.ts": linesOf(10),
    "nested/update.ts": linesOf(MAX_LINES + 40),
  });

  expect(output).toContain("convex/router/nested/update.ts");
  expect(output).not.toContain("getOne.ts");
});

it("exempts test files, which are long for a reason the rule is not about", () => {
  const { code } = runC2({ "__tests__/getOne.test.ts": linesOf(MAX_LINES * 3) });

  expect(code).toBe(0);
});

it("passes when convex/router does not exist yet", () => {
  const { code } = runCheck("c2-router-size.mjs", { "convex/schema/users.ts": "" });

  expect(code).toBe(0);
});

/**
 * The rest of the check, and the reason it was added: splitting an oversized router into a sibling
 * satisfies the line cap and moves nothing. Only `"use node"` forces one operation across two
 * modules, so only `"use node"` justifies a second file — and the split is directional. The entry
 * point and the mutations stay in the isolate half; the Node half carries the directive and only
 * what needs it.
 */
it("accepts the directional split", () => {
  const { code } = runC2({
    "importOne.ts": linesOf(10),
    "importOneNode.ts": `"use node"\n${linesOf(10)}`,
  });

  expect(code).toBe(0);
});

it("rejects a node half that does not declare use node", () => {
  const { code, output } = runC2({
    "importOne.ts": linesOf(10),
    "importOneNode.ts": linesOf(10),
  });

  expect(code).toBe(1);
  expect(output).toContain("convex/router/importOneNode.ts");
  expect(output).toContain('does not declare "use node"');
});

/** Both halves in Node means the split bought nothing — and a mutation cannot register there. */
it("rejects use node on the isolate half when a node half exists", () => {
  const { code, output } = runC2({
    "importOne.ts": `"use node"\n${linesOf(10)}`,
    "importOneNode.ts": `"use node"\n${linesOf(10)}`,
  });

  expect(code).toBe(1);
  expect(output).toContain("both halves run in Node");
});

/** A whole operation that is one Node action is legitimately one file, under the plain name. */
it("accepts a lone operation that runs entirely in node", () => {
  const { code } = runC2({ "importOne.ts": `"use node"\n${linesOf(10)}` });

  expect(code).toBe(0);
});

it("rejects a node half with no operation beside it", () => {
  const { code, output } = runC2({ "importOneNode.ts": `"use node"\n${linesOf(10)}` });

  expect(code).toBe(1);
  expect(output).toContain("nothing was split");
});

/** "use node" in a comment is not the directive, and must not buy the exemption. */
it("does not take use node from a comment", () => {
  const { code } = runC2({
    "importOne.ts": linesOf(10),
    "importOneNode.ts": `// "use node" would go here\n${linesOf(10)}`,
  });

  expect(code).toBe(1);
});

/**
 * The shape this convention used to name. Convex's bundler skips any basename with more than one
 * dot — silently, at logVerbose level — so the exports never register and C1, C7 and `tsc` all stay
 * green. The failure surfaces as a missing function in production, which is why C2 catches it here.
 */
it("rejects a filename whose extra dot would stop it being registered", () => {
  const { code, output } = runC2({
    "importOne.ts": linesOf(10),
    "importOne.node.ts": `"use node"\n${linesOf(10)}`,
  });

  expect(code).toBe(1);
  expect(output).toContain("convex/router/importOne.node.ts");
  expect(output).toContain("nothing it exports is registered");
});

it("still exempts test files from the extra-dot rule", () => {
  const { code } = runC2({ "__tests__/getOne.test.ts": linesOf(10) });

  expect(code).toBe(0);
});
