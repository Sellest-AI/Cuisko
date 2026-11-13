/**
 * SessionStart — the facts every session otherwise opens by rediscovering.
 *
 * Branch, working set, whether a slice is in flight, and whether the installed dependencies still
 * match the lockfile. An agent spends its first few tool calls
 * establishing some of this, and only when it thinks to look — which is the failure mode, not the
 * cost. Printing it deterministically costs CPU cycles and zero inference.
 *
 * Prints a JSON envelope whose `additionalContext` is injected before the first turn. Stays quiet
 * when there is nothing to say. Never fails the session — every git call degrades to an empty string.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { changedFiles, git, isDreamSession, ROOT } from "./_lib.mjs";

if (isDreamSession()) process.exit(0);

const MAX_FILES = 15;

const lines = [];

/* ── Branch ─────────────────────────────────────────────────────────────────────────────── */

const branch = git("rev-parse", "--abbrev-ref", "HEAD");

if (branch) {
  // `--abbrev-ref` returns the literal string "HEAD" when detached — mid-rebase, mid-bisect, or on
  // a checked-out tag. Printing "Branch: HEAD" says nothing, and committing there is worse than
  // committing on main: the commit belongs to no branch and is lost at the next checkout.
  if (branch === "HEAD") {
    lines.push(`Detached HEAD at ${git("rev-parse", "--short", "HEAD")} — do not commit here.`);
  } else if (branch === "main") {
    lines.push("Branch: main — a feature commit does not belong here. Branch before committing.");
  } else {
    lines.push(`Branch: ${branch}`);
  }

  const recent = git("log", "--oneline", "-3", "--no-decorate");
  if (recent) lines.push("Recent:", ...recent.split("\n").map((l) => `  ${l}`));

  // Local main, deliberately — fetching would put the network on the critical path of every
  // session start. A stale main under-reports, which is the safe direction to be wrong in.
  const behind = git("rev-list", "--count", "HEAD..main");
  if (behind && behind !== "0") lines.push(`Behind main by ${behind} commit(s).`);
}

/* ── Dependency drift ───────────────────────────────────────────────────────────────────── */

/**
 * A branch switch resyncs the lockfile but not node_modules, and the resulting failures read as
 * code problems rather than install problems — so the wrong thing gets debugged. pnpm rewrites
 * .modules.yaml on every install, so its mtime against the lockfile's answers this exactly.
 */
const lockfile = path.join(ROOT, "pnpm-lock.yaml");
const installed = path.join(ROOT, "node_modules", ".modules.yaml");

if (existsSync(lockfile)) {
  if (!existsSync(installed)) {
    // The worst case, and the one an mtime comparison alone would stay silent about: a fresh clone.
    lines.push("node_modules is missing — run `pnpm install` before anything else.");
  } else if (statSync(lockfile).mtimeMs > statSync(installed).mtimeMs) {
    lines.push("node_modules is older than pnpm-lock.yaml — run `pnpm install` before anything else.");
  }
}

/* ── Working set ────────────────────────────────────────────────────────────────────────── */

const files = changedFiles();

if (files.length) {
  lines.push(`Uncommitted (${files.length}):`);
  lines.push(...files.slice(0, MAX_FILES).map((f) => `  ${f}`));
  if (files.length > MAX_FILES) lines.push(`  …and ${files.length - MAX_FILES} more`);
}

/* ── Slice in flight ────────────────────────────────────────────────────────────────────── */

const plansDir = path.join(ROOT, "docs", "plans");

if (existsSync(plansDir)) {
  const plans = readdirSync(plansDir).filter(
    (f) => f.endsWith(".md") && f !== "README.md" && !f.startsWith("_"),
  );

  if (plans.length) {
    lines.push(
      `Plans in flight: ${plans.map((f) => `docs/plans/${f}`).join(", ")}`,
      "Read before touching the slices they cover. Intent, not description: where a plan disagrees",
      "with the code, the code wins and the plan should already have been deleted.",
    );
  }
}

/* ── GitHub identity ────────────────────────────────────────────────────────────────────── */

/**
 * A session acts on GitHub as the `sellest-agent` App (docs/external/github.md): git through the
 * credential helper, `gh` through `pnpm gh:bot`. Without its key or a token, every push and comment
 * would fail mid-task, so the session is told up front. Silent when a token comes back, which is
 * from the cache on most starts. Bounded: a slow network costs at most `TOKEN_TIMEOUT_MS`.
 */
const TOKEN_TIMEOUT_MS = 4000;

try {
  const { identityLine } = await import("../../scripts/github/_lib/botToken.mjs");
  // One deadline for both requests a token costs, so the hook stays inside its own timeout.
  const signal = AbortSignal.timeout(TOKEN_TIMEOUT_MS);
  const timedFetch = (url, init) => fetch(url, { ...init, signal });
  const line = await identityLine({ cwd: ROOT, fetch: timedFetch });
  if (line !== null) lines.push(line);
} catch (error) {
  // The import itself failed (a syntax error in scripts/github/): say so rather than go quiet.
  const reason = String(error?.message ?? error).split("\n")[0];
  lines.push(`GitHub App sellest-agent could not be checked (${reason}): push, comment and open no PR until it is fixed.`);
}

/* ── Emit ───────────────────────────────────────────────────────────────────────────────── */

process.stdout.write(
  JSON.stringify(
    lines.length
      ? {
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: lines.join("\n"),
          },
        }
      : {},
  ),
);
