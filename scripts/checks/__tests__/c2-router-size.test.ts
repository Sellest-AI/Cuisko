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

/** A file of exactly `count` lines of code — C2 counts nothing else. */
const linesOf = (count: number) => Array.from({ length: count }, (_, i) => `const line${i} = ${i};`).join("\n");

/** `count` lines that are not code: a comment, a blank line, a JSDoc block, in turn. */
const proseOf = (count: number) =>
  Array.from({ length: count }, (_, i) => ["// why this router is shaped so", "", "/** A JSDoc line. */"][i % 3]).join("\n");

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

/** The cap guards against logic in a router; a router that explains itself must not pay for it. */
it("counts neither comments nor blank lines", () => {
  const { code } = runC2({ "getOne.ts": `${proseOf(60)}\n${linesOf(MAX_LINES)}\n${proseOf(30)}` });

  expect(code).toBe(0);
});

it("does not count a multi-line JSDoc block", () => {
  const jsdoc = `/**\n${Array.from({ length: 40 }, () => " * The export binds an access level.").join("\n")}\n */`;
  const { code } = runC2({ "getOne.ts": `${jsdoc}\n${linesOf(MAX_LINES)}` });

  expect(code).toBe(0);
});

/** Read as a string, not as the start of a comment: the line is code. */
it("counts a line whose string holds a //", () => {
  const urls = Array.from({ length: MAX_LINES + 1 }, (_, i) => `const page${i} = "https://www.marmiton.org/${i}";`).join("\n");
  const { code } = runC2({ "getOne.ts": urls });

  expect(code).toBe(1);
});

it("counts every line a template literal spans", () => {
  const template = `const prompt = \`${Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n")}\`;`;
  const { code } = runC2({ "getOne.ts": `${template}\n${linesOf(MAX_LINES - 9)}` });

  expect(code).toBe(1);
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
