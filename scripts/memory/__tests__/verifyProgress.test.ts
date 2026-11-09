/**
 * The progress line of the dream's commit (spec §9.1 U9): the steps of `pnpm verify` counted from
 * its output, so the owner sees `Verifying 2/5` and not the whole run.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/verifyProgress.mjs";

type State = { done: number; total: number; last: string };
const { createVerifyProgress, formatProgress, verifySteps } = lib as unknown as {
  verifySteps: (scripts?: Record<string, string>) => string[];
  createVerifyProgress: (steps: string[]) => { push: (chunk: string) => void; end: () => void; state: () => State };
  formatProgress: (state: State) => string;
};

const STEPS = ["typecheck:app", "typecheck:convex", "lint", "check", "test"];

describe("verifySteps", () => {
  it("expands the repo's verify script into the scripts it runs, in order", () => {
    const { scripts } = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(verifySteps(scripts)).toEqual(STEPS);
  });

  it("knows no step when there is no verify script", () => {
    expect(verifySteps({ test: "vitest" })).toEqual([]);
    expect(verifySteps()).toEqual([]);
  });
});

describe("createVerifyProgress", () => {
  it("counts a step on its Done line and the tests on vitest's Test Files line", () => {
    const progress = createVerifyProgress(STEPS);
    progress.push(". typecheck:app$ tsc --noEmit\n. lint$ eslint .\n. check: ✅ C1 export name matches its builder\n");
    expect(progress.state()).toEqual({ done: 0, total: 5, last: ". check: ✅ C1 export name matches its builder" });
    progress.push(". lint: Done\n. check: Done\n");
    expect(progress.state().done).toBe(2);
    progress.push(". typecheck:app: Done\n. typecheck:convex: Done\n\n Test Files  378 passed (378)\n");
    expect(progress.state().done).toBe(5);
  });

  it("reads a line cut across two chunks once, and strips colour codes", () => {
    const progress = createVerifyProgress(STEPS);
    progress.push("\u001b[32m. li");
    progress.push("nt: Done\u001b[39m\n. check: ✅ C2");
    expect(progress.state()).toEqual({ done: 1, total: 5, last: ". lint: Done" });
    progress.end();
    expect(progress.state().last).toBe(". check: ✅ C2");
  });

  it("does not count a Done line twice, nor a step verify does not run", () => {
    const progress = createVerifyProgress(STEPS);
    progress.push(". lint: Done\n. lint: Done\n. build: Done\n");
    expect(progress.state().done).toBe(1);
  });
});

describe("formatProgress", () => {
  it("shows the counter, then the last line", () => {
    expect(formatProgress({ done: 2, total: 5, last: ". lint: Done" })).toBe("Verifying 2/5 · . lint: Done");
    expect(formatProgress({ done: 0, total: 5, last: "" })).toBe("Verifying 0/5");
    expect(formatProgress({ done: 0, total: 0, last: "→ pre-commit" })).toBe("Verifying · → pre-commit");
  });
});
