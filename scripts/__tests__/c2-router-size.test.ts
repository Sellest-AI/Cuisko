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

const MAX_LINES = 80;

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
