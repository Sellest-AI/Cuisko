/**
 * Shared by the hooks in this folder.
 *
 * Extracted at the second copy rather than the third. The git wrapper had already been pasted once,
 * and the cost showed up immediately: fixing the working-directory assumption meant making the same
 * edit twice, in lockstep, with nothing to catch a divergence between them.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Derived from this file, never from `cwd` — the same reason `scripts/checks/_lib.mjs` does it. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * `core.quotepath=false` is load-bearing, not tidiness. Under git's default, any path containing a
 * byte above 0x7F comes back C-quoted and wrapped in double quotes — `"convex/router/cr\303\251e.ts"`
 * — and that leading quote makes every `startsWith()` predicate miss, so an accented filename
 * silently escapes the check that governs it.
 */
export const git = (...args) => {
  try {
    return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return ""; // Not a repo, or git is unavailable. Callers read that as "nothing to report".
  }
};

/** Everything uncommitted: tracked modifications plus untracked files, deduped, repo-relative. */
export const changedFiles = () =>
  [
    ...new Set([
      ...git("diff", "--name-only", "HEAD").split("\n"),
      ...git("ls-files", "--others", "--exclude-standard").split("\n"),
    ]),
  ].filter(Boolean);
