/**
 * A model started by memory:update runs inside this repo, so Claude Code loads the repo's hooks for
 * it: one prints the repo state, one runs the architecture checks at the end of a turn. Neither
 * means anything to a dreamer, and the second would run checks on a folder the dream owns. Both
 * return at once for a session under `<root>/.tmp/memory/`, decided by the hook's own input (the
 * dream never depends on how `claude -p` loads hooks).
 *
 * The hooks are run as Claude Code runs them, a JSON input on stdin. `session-start.mjs` always has
 * something to say in this repo, so silence is the dream session's mark.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ROOT = REPO.replace(/\\/g, "/");

const run = (hook: string, stdin: string) => {
  const result = spawnSync(process.execPath, [path.join(REPO, ".claude", "hooks", hook)], { input: stdin, encoding: "utf8", timeout: 60_000 });
  return { status: result.status, stdout: result.stdout };
};
const sessionStartIn = (cwd: string) => run("session-start.mjs", JSON.stringify({ session_id: "s1", cwd })).stdout;

describe("session-start.mjs: who counts as a dream session", () => {
  it("is silent under <root>/.tmp/memory/, whatever the slashes and the drive-letter case", () => {
    expect(sessionStartIn(`${ROOT}/.tmp/memory/dream-20261108-1200`)).toBe("");
    expect(sessionStartIn(`${ROOT}/.tmp/memory/dream-1/memory`.replace(/\//g, "\\"))).toBe("");
    expect(sessionStartIn(`${ROOT}/.tmp/memory/dream-1`.replace(/^[A-Za-z]:/, (drive) => drive.toLowerCase()))).toBe("");
  });

  it("speaks to the repo, a sibling repo, another .tmp folder and a .tmp below a subfolder", () => {
    for (const cwd of [ROOT, `${ROOT}-web/.tmp/memory/dream-1`, `${ROOT}/.tmp/other/job`, `${ROOT}/src/.tmp/memory/x`]) {
      expect(sessionStartIn(cwd), cwd).toContain("additionalContext");
    }
  });

  it("speaks when the input is not a hook input, so a glitch never silences a normal session", () => {
    for (const stdin of ["", "not json", "{}", JSON.stringify({ cwd: 7 })]) {
      expect(run("session-start.mjs", stdin).stdout, stdin).toContain("additionalContext");
    }
  });
});

describe("stop-checks.mjs", () => {
  it("says nothing and exits 0 for a dreamer", () => {
    expect(run("stop-checks.mjs", JSON.stringify({ session_id: "s1", cwd: `${ROOT}/.tmp/memory/dream-test` }))).toEqual({ status: 0, stdout: "" });
  });
});
