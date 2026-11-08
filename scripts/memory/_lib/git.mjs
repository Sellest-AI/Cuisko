/**
 * Git, run from the memory scripts. One helper so every caller fails the same way: a non-zero
 * exit throws, with git's own stderr in the message, and stdout comes back trimmed.
 *
 * The `…In` forms take the directory to run in, so a test can point them at a throwaway repo
 * without changing the process's own directory.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

/** Runs `git <args>` in `cwd` and returns its trimmed stdout. Throws on failure. */
export const gitIn = (cwd, ...args) => {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const stderr = String(error.stderr ?? "").trim();
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`, { cause: error });
  }
};

/** Like `gitIn`, but a failure returns `null`: for questions whose "no" is an exit code. */
export const gitInOrNull = (cwd, ...args) => {
  try {
    return gitIn(cwd, ...args);
  } catch {
    return null; // The exit code is the answer here: unset config key, not a repository.
  }
};

/** `gitIn` in the current directory. */
export const git = (...args) => gitIn(process.cwd(), ...args);

/** `gitInOrNull` in the current directory. */
export const gitOrNull = (...args) => gitInOrNull(process.cwd(), ...args);

/**
 * The git directory every worktree of this clone shares, absolute. The stamps and the dream lock
 * live there, so a session in a worktree under .claude/worktrees/ sees the same ones.
 */
export const commonDir = (cwd = process.cwd()) =>
  path.resolve(gitIn(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"));

/**
 * The main checkout's root, whichever worktree `cwd` is in: the folder holding the common git
 * dir. Worktrees live under it (.claude/worktrees/), so the transcript selection tests every
 * session's cwd against this one root.
 */
export const mainRoot = (cwd = process.cwd()) => path.dirname(commonDir(cwd));

