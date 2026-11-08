/**
 * The memory lock (spec §5.3), run by .githooks/pre-commit before verify. Only memory:update
 * writes the memory: a commit staging index.md, usage.json or a file under memories/ is refused
 * unless it comes from one of these:
 *
 *   - memory:update, which sets MEMORY_UPDATE=1 for its own commit. Such a commit must stage
 *     nothing outside .claude/memory/, so the variable never becomes a second --no-verify
 *   - a merge: a clean one runs pre-merge-commit, which exports GIT_HOOK_NAME=pre-merge-commit
 *     before handing over to pre-commit; a conflicted one ends in a commit with MERGE_HEAD present.
 *     This is how a memory commit made on another machine arrives through a pull
 *   - a conflicted revert (REVERT_HEAD present); a clean revert never runs pre-commit
 *
 * A cherry-pick is refused: memory commits belong on dev. README.md and _template.md are the
 * owner's, never locked.
 *
 * The state files are found with `git rev-parse --git-path`, so a worktree (whose .git is a file)
 * finds its own. Exit 1 with the reason, 0 otherwise.
 *
 * This is a guard rail against mistakes, not a boundary: `--no-verify` or a typed MEMORY_UPDATE=1
 * still pass. The encryption workflow and the owner's diff are the gates.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { git } from "./_lib/git.mjs";

const MEMORY_DIR = ".claude/memory/";
const LOCKED = [/^\.claude\/memory\/index\.md$/, /^\.claude\/memory\/usage\.json$/, /^\.claude\/memory\/memories\//];
const DREAMS_DIR = ".tmp/memory";

/** Staged paths, POSIX. `--no-renames`: a memory file moved out shows as its deletion too. */
const _stagedPaths = () => git("diff", "--cached", "--name-only", "--no-renames", "-z").split("\0").filter(Boolean);

const _gitStateExists = (name) => existsSync(path.resolve(git("rev-parse", "--git-path", name)));

/** True when a dream's commit failed and waits for a rerun (update.mjs keeps its folder with pending.json). */
const _dreamPending = () => {
  const dreams = path.join(git("rev-parse", "--show-toplevel"), DREAMS_DIR);
  if (!existsSync(dreams)) return false;
  return readdirSync(dreams, { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && existsSync(path.join(dreams, entry.name, "pending.json")),
  );
};

const _refuse = (lines) => {
  process.stderr.write(`${lines.map((line, index) => (index === 0 ? `✖ ${line}` : `  ${line}`)).join("\n")}\n`);
  process.exit(1);
};

const staged = _stagedPaths();

if (process.env.MEMORY_UPDATE === "1") {
  const outside = staged.filter((file) => !file.startsWith(MEMORY_DIR));
  if (outside.length > 0) {
    _refuse([
      "Commit refused: a MEMORY_UPDATE=1 commit stages only .claude/memory/.",
      `Staged outside it: ${outside.join(", ")}`,
    ]);
  }
  process.exit(0);
}

const locked = staged.filter((file) => LOCKED.some((pattern) => pattern.test(file)));
if (locked.length === 0) process.exit(0);

const fromMerge = process.env.GIT_HOOK_NAME === "pre-merge-commit" || _gitStateExists("MERGE_HEAD");
if (fromMerge || _gitStateExists("REVERT_HEAD")) process.exit(0);

_refuse([
  _dreamPending()
    ? "Commit refused: a dream commit is pending: rerun pnpm memory:update to finish it."
    : "Commit refused: the memory is written by pnpm memory:update only.",
  `Staged: ${locked.join(", ")}`,
  "Unstage them: git restore --staged .claude/memory",
]);
