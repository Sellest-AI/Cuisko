/**
 * SessionStart — the facts every session otherwise opens by rediscovering.
 *
 * Branch, working set, whether a slice is in flight, where the build order stands, and whether the
 * installed dependencies still match the lockfile. An agent spends its first few tool calls
 * establishing some of this, and only when it thinks to look — which is the failure mode, not the
 * cost. Printing it deterministically costs CPU cycles and zero inference.
 *
 * Prints a JSON envelope whose `additionalContext` is injected before the first turn. Stays quiet
 * when there is nothing to say. Never fails the session — every git call degrades to an empty string.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { changedFiles, git, ROOT } from "./_lib.mjs";

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

/* ── Build order ────────────────────────────────────────────────────────────────────────── */

/**
 * The one fact here that git cannot answer. Branch and working set cost one command each; knowing
 * which slice the project is actually on means reading a 470-line spec that AGENTS.md only sends
 * you to when a task crosses layers.
 *
 * The parse is bound to a literal heading, so a rename would break it. It says so out loud rather
 * than going quiet — a feature that disappears without a trace is worse than one that reports it
 * cannot find what it needs.
 */
const architecture = path.join(ROOT, "docs", "ARCHITECTURE.md");

if (existsSync(architecture)) {
  const section = readFileSync(architecture, "utf8").split(/^## Build order$/m)[1]?.split(/^## /m)[0];
  const steps = [...(section ?? "").matchAll(/^- \[( |x)\] \*\*(.+?)\*\*/gm)];
  const next = steps.find(([, mark]) => mark !== "x");

  if (next) {
    const done = steps.filter(([, mark]) => mark === "x").length;
    lines.push(`Build order: next is ${next[2]} (${done}/${steps.length} steps done).`);
  } else if (steps.length === 0) {
    lines.push("Build order: could not parse the '## Build order' section of docs/ARCHITECTURE.md.");
  }
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
