/**
 * Running a check script against a tree that is not this repo.
 *
 * Every check test needs the same three things: a throwaway tree containing exactly the shapes
 * under test, the real script run against it, and the exit code plus what it printed. The scripts
 * are top-level side-effecting modules ending in `process.exit`, so there is nothing to import and
 * assert on — the exit code and the finding text are the whole contract.
 *
 * `CHECK_ROOT` is what aims them (see `scripts/_lib.mjs`). Without it a check can only ever run
 * against this repo, where the violations it hunts do not exist by definition.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = fileURLToPath(new URL("..", import.meta.url));

/** Relative POSIX path → file contents. Directories are created as needed. */
export type Tree = Record<string, string>;

const roots: string[] = [];

/** Writes `tree` into a fresh temporary directory and returns its absolute path. */
export const makeTree = (tree: Tree): string => {
  const root = mkdtempSync(path.join(tmpdir(), "cuisko-check-"));
  roots.push(root);

  for (const [relative, contents] of Object.entries(tree)) {
    const file = path.join(root, ...relative.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }

  return root;
};

/** Removes every tree made so far. Call it from `afterEach`. */
export const cleanupTrees = () => {
  while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
};

export type CheckResult = { code: number; output: string };

/**
 * Runs `script` (a bare filename in `scripts/`) against `tree`.
 *
 * Returns the exit code rather than throwing, because a non-zero exit is the expected result in
 * most cases — a check that never fails is the thing these tests exist to detect.
 *
 * `at` runs the check against a tree that already exists — this repo, in practice — instead of
 * building one. `tree` is ignored then: the point of that call is that nothing was arranged.
 */
export const runCheck = (script: string, tree: Tree, at?: string): CheckResult => {
  const root = at ?? makeTree(tree);

  try {
    const stdout = execFileSync(process.execPath, [path.join(SCRIPTS, script)], {
      encoding: "utf8",
      env: { ...process.env, CHECK_ROOT: root },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    const output = `${failure.stdout}${failure.stderr}`;

    /**
     * A crash and a violation both exit 1, and telling them apart is not optional here.
     *
     * This was found the hard way: disabling C9's cycle guard did not make it stop reporting, it
     * made it recurse until the stack overflowed — still exit 1, so two tests asserting only the
     * exit code kept passing against a check that had stopped working entirely. Throwing means no
     * test can ever pass on a crash, however loosely it asserts.
     */
    if (!output.includes("❌")) {
      throw new Error(`${script} crashed instead of reporting findings:\n${output}`);
    }

    return { code: failure.status, output };
  }
};

/** Asserts nothing itself — `passed(result)` just reads better than `result.code === 0`. */
export const passed = (result: CheckResult) => result.code === 0 && result.output.includes("✅");
