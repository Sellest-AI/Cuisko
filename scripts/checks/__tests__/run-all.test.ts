/**
 * `run-all.mjs`, the runner behind `pnpm check`.
 *
 * It finds checks next to itself, so a copy in a temporary folder runs whatever stands beside it.
 * Each case below is a fake check in that folder: what is under test is the verdict on the whole
 * run, since `pnpm verify` and the commit hook read nothing else.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTrees, makeTree } from "./_harness";

const CHECKS = fileURLToPath(new URL("..", import.meta.url));
const CHECK_NAME = /^c\d+-[a-z0-9-]+\.mjs$/;

const PASS = `console.log("✅ passed");`;

/** Runs a copy of the runner beside `checks`, as `pnpm check` would. */
const runAll = (checks: Record<string, string>) => {
  const root = makeTree(checks);
  const runner = path.join(root, "run-all.mjs");
  copyFileSync(path.join(CHECKS, "run-all.mjs"), runner);

  try {
    return { code: 0, output: execFileSync(process.execPath, [runner], { encoding: "utf8", stdio: "pipe" }) };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };

    return { code: failure.status, output: `${failure.stdout}${failure.stderr}` };
  }
};

afterEach(cleanupTrees);

describe("run-all", () => {
  it("passes when every check passes", () => {
    const { code, output } = runAll({ "c1-one.mjs": PASS, "c2-two.mjs": PASS });

    expect(code).toBe(0);
    expect(output.match(/✅ passed/g)).toHaveLength(2);
  });

  it("fails when one check reports, and still prints what it said", () => {
    const { code, output } = runAll({
      "c1-one.mjs": PASS,
      "c2-two.mjs": `console.error("❌ a finding"); process.exit(1);`,
    });

    expect(code).toBe(1);
    expect(output).toContain("❌ a finding");
    expect(output).toContain("✅ passed");
  });

  /** A check that dies is not a check that passed: a crash has to refuse the commit too. */
  it("fails when a check crashes", () => {
    const { code, output } = runAll({ "c1-one.mjs": PASS, "c2-two.mjs": `throw new Error("it broke");` });

    expect(code).toBe(1);
    expect(output).toContain("it broke");
  });

  it("prints in check order, whichever finishes first", () => {
    const { output } = runAll({
      "c2-two.mjs": `console.log("second");`,
      "c10-ten.mjs": `console.log("third");`,
      "c1-one.mjs": `setTimeout(() => console.log("first"), 200);`,
    });

    expect(output.indexOf("first")).toBeLessThan(output.indexOf("second"));
    expect(output.indexOf("second")).toBeLessThan(output.indexOf("third"));
  });

  it("leaves alone a file that is not a check", () => {
    const { code } = runAll({
      "c1-one.mjs": PASS,
      "c1-one.helper.mjs": "process.exit(1);",
      "_lib.mjs": "process.exit(1);",
    });

    expect(code).toBe(0);
  });

  /** A new check is found by its name, so a name it cannot match is a check that silently never runs. */
  it("finds every check in this repo that package.json names", () => {
    const { scripts } = JSON.parse(
      readFileSync(path.join(CHECKS, "..", "..", "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const named = Object.entries(scripts)
      .filter(([name, command]) => name.startsWith("check:") && command.startsWith("node "))
      .map(([, command]) => path.basename(command.split(" ").at(-1) as string));

    expect(named.length).toBeGreaterThan(0);
    for (const script of named) expect(script).toMatch(CHECK_NAME);
    expect(readdirSync(CHECKS).filter((file) => CHECK_NAME.test(file)).sort()).toEqual([...named].sort());
  });
});
