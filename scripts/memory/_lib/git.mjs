/**
 * Git, run from the memory scripts. One helper so every caller fails the same way: a non-zero
 * exit throws, with git's own stderr in the message, and stdout comes back trimmed.
 */
import { execFileSync } from "node:child_process";

/** Runs `git <args>` in the current directory and returns its trimmed stdout. Throws on failure. */
export const git = (...args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const stderr = String(error.stderr ?? "").trim();
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`, { cause: error });
  }
};

/** Like `git`, but a failure returns `null`: for questions whose "no" is an exit code. */
export const gitOrNull = (...args) => {
  try {
    return git(...args);
  } catch {
    return null; // The exit code is the answer here: unset config key, not a repository.
  }
};
