/**
 * push:dev — the last step of "commit and merge to dev": the dream, then the push.
 *
 *   pnpm push:dev
 *
 * 1. refuse unless the branch is `dev` and the tree is clean
 * 2. `pnpm memory:update` — interactive: it shows the diff and asks. A failure stops here.
 * 3. `git push origin dev`
 *
 * The owner choosing [a] abort in step 2 still exits 0, and nothing here can tell. The pre-push
 * hook can: it refuses a push while a finished session is unread, so an aborted dream stops at
 * step 3 with the hook's own message. This script does not repeat that check.
 *
 * It merges nothing: the merge into `dev` goes through the `committing` skill's review first.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { gitIn } from "./_lib/git.mjs";

const BRANCH = "dev";
const UPDATE = fileURLToPath(new URL("./update.mjs", import.meta.url));

/** A refusal the owner can act on: printed as is, exit 1. */
class PushDevError extends Error {
  constructor(message) {
    super(message);
    this.name = "PushDevError";
  }
}

/** Runs a command with the terminal attached, so the dream's prompt and git's progress show. */
const _inherit = (command, args, cwd) => spawnSync(command, args, { cwd, stdio: "inherit" });

/**
 * Runs the three steps in `cwd`. `run(command, args, cwd)` returns the exit status; it is a
 * parameter so a test can watch the order without starting a dream.
 */
export const pushDev = ({ cwd = process.cwd(), run = (command, args, where) => _inherit(command, args, where).status } = {}) => {
  const branch = gitIn(cwd, "branch", "--show-current");
  if (branch !== BRANCH) throw new PushDevError(`push:dev runs on ${BRANCH}, and this is ${branch || "a detached HEAD"}. Merge into ${BRANCH} first.`);

  const dirty = gitIn(cwd, "status", "--porcelain");
  if (dirty !== "") throw new PushDevError(`The tree has uncommitted changes. Commit or stash them first:\n${dirty}`);

  if (run(process.execPath, [UPDATE], cwd) !== 0) throw new PushDevError("memory:update failed, so nothing was pushed.");
  if (run("git", ["push", "origin", BRANCH], cwd) !== 0) throw new PushDevError("git push failed. If the pre-push hook refused, follow what it printed above.");
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    pushDev();
  } catch (error) {
    console.error(error instanceof PushDevError ? error.message : `push:dev failed: ${error.message}`);
    process.exitCode = 1;
  }
}
