/**
 * Stop — run the architectural checks the working set warrants, at the one moment the code is
 * coherent.
 *
 * The same idea placed on PostToolUse would be noise: mid-edit files are half-written by design, so
 * a per-edit check reports states nobody intended and trains you to ignore it. At turn end the work
 * is finished, which makes a failure actionable — and it lands one turn after the mistake instead of
 * at commit time, which for C1 (export name vs builder) is the difference between a one-line fix and
 * an authorization hole nothing else detects.
 *
 * ADVISORY, deliberately. It prints and exits 0; it never blocks the turn. Promote it to blocking
 * only once it has been observed not to cry wolf — the same discipline CONVENTIONS §11 applies to
 * enforcement tags, turned on the tooling itself.
 *
 * Two checks are excluded on purpose:
 *
 *   C5  authorization tests — legitimately unsatisfied mid-slice, since the router file exists
 *       before its test does. A commit-time rule; the pre-commit hook already owns it.
 *   C7  generated API drift — needs `convex dev` to have run codegen. Nothing the model can fix by
 *       editing, so surfacing it every turn is pure noise.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { changedFiles, ROOT } from "./_lib.mjs";

const STAMP = path.join(ROOT, "node_modules", ".cache", "cuisko-stop-checks.json");

/**
 * Where the check scripts live, named once because it is read twice — to run a check, and to
 * stamp its mtime.
 *
 * Those two uses fail differently when this is wrong, which is why they must not drift apart.
 * Running a missing script throws, and the catch below reports the crash as an architectural
 * violation — loud, and misleading. Stamping a missing script does NOT throw: `mtimeOf` returns
 * "absent", the signature silently becomes a constant, and the cache invalidation this hook
 * depends on stops working with nothing printed either way.
 */
const CHECKS_DIR = path.join(ROOT, "scripts", "checks");

/**
 * Which check answers for which part of the tree.
 *
 * These triggers are deliberately **conservative supersets** of what each script actually reads.
 * Being precise would mean re-encoding a check's internals here, where nothing keeps the two in
 * step. Over-running costs milliseconds; under-running is a check that silently stopped covering
 * something, which is the failure this file exists against.
 *
 * C6's trigger is `true` and that is not laziness. It asks "do the docs point at things that
 * exist?", so its real input is the whole tree, not the docs: creating, renaming or deleting any
 * file can change its verdict. `src/global/routes.ts` is listed in its PLANNED set and referenced
 * from ARCHITECTURE.md, so the next slice creating that file breaks C6 without touching one `.md`.
 * Anything narrower than "always" is not a superset.
 */
const CHECKS = [
  { name: "C1 export contract", script: "c1-export-contract.mjs", when: (f) => f.startsWith("convex/router/") },
  { name: "C2 router size", script: "c2-router-size.mjs", when: (f) => f.startsWith("convex/router/") },
  { name: "C3 query and index rules", script: "c3-query-rules.mjs", when: (f) => f.startsWith("convex/") },
  { name: "C4 schema invariants", script: "c4-schema-invariants.mjs", when: (f) => f.startsWith("convex/") },
  { name: "C6 doc integrity", script: "c6-doc-integrity.mjs", when: () => true },
  // `shared/` is in the trigger as well as `translations/` because C8 reads SUPPORTED_LOCALES out
  // of shared/translations.ts: adding a locale to that constant and no directory to go with it is
  // a violation in which no translations/ file is touched at all.
  {
    name: "C8 i18n parity",
    script: "c8-i18n-parity.mjs",
    when: (f) => f.startsWith("translations/") || f.startsWith("shared/"),
  },
  // Any moved or renamed file can create a cycle, and a barrel makes one invisible to read — so
  // the trigger is every source root C9 walks, not just the file that closed the loop.
  {
    name: "C9 import cycles",
    script: "c9-import-cycles.mjs",
    when: (f) =>
      f.startsWith("src/") || f.startsWith("app/") || f.startsWith("convex/") || f.startsWith("shared/"),
  },
];

/* ── What changed ───────────────────────────────────────────────────────────────────────── */

const changed = changedFiles();
const needed = CHECKS.filter((check) => changed.some(check.when));

if (needed.length === 0) process.exit(0);

/* ── Skip when nothing moved since the last run ─────────────────────────────────────────── */

const mtimeOf = (absolute) => {
  try {
    return String(statSync(absolute).mtimeMs);
  } catch {
    return "absent"; // Deleted between git listing it and this call — still part of the signature.
  }
};

/**
 * Without this the checks re-run on every turn for the rest of the session — including turns that
 * only answered a question — and re-report a violation already reported.
 *
 * The signature covers both halves of what a verdict depends on: the files being checked, and the
 * check scripts themselves. Omitting the second half means editing a rule — C2's line cap, C6's
 * PLANNED set — leaves the stale verdict cached until some unrelated file happens to change.
 */
const signature = [
  ...needed.map((check) => `${check.script}:${mtimeOf(path.join(CHECKS_DIR, check.script))}`),
  ...changed
    .filter((f) => needed.some((check) => check.when(f)))
    .sort()
    .map((f) => `${f}:${mtimeOf(path.join(ROOT, f))}`),
].join("|");

const readStamp = () => {
  try {
    return JSON.parse(readFileSync(STAMP, "utf8")).signature;
  } catch {
    return null; // No stamp yet, or it is unreadable. Treat as "never run".
  }
};

if (readStamp() === signature) process.exit(0);

/* ── Run them ───────────────────────────────────────────────────────────────────────────── */

const failures = [];

for (const check of needed) {
  try {
    // process.execPath, not "node": spawning off PATH can resolve to a different runtime under a
    // version manager, or to nothing. If it resolved to nothing, every check would throw ENOENT and
    // be reported as failed — five architectural violations announced when zero checks ran.
    execFileSync(process.execPath, [path.join(CHECKS_DIR, check.script)], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // A C script reports its findings on stderr and exits 1, and its own banner names the check.
    // A script that crashed or is missing prints no banner at all, so the name is prefixed here —
    // otherwise the one failure that means "this check stopped running" arrives unlabelled.
    const output = (error.stderr || error.stdout || String(error.message)).trim();
    failures.push(output.startsWith("❌") ? output : `❌ ${check.name} — ${output}`);
  }
}

let stampWarning = null;

try {
  mkdirSync(path.dirname(STAMP), { recursive: true });
  writeFileSync(STAMP, JSON.stringify({ signature }));
} catch (error) {
  // `recursive: true` creates node_modules/.cache regardless, so the reachable causes are a
  // read-only or full disk. The cost is not one redundant run: without a stamp these checks run
  // and re-report on EVERY subsequent turn, which is what teaches you to ignore them. Kept out of
  // `failures` so it is never counted as an architectural violation — it is a tooling problem, and
  // "fix it before committing" would be the wrong advice.
  stampWarning = `⚠️  Could not write the run stamp (${error.code ?? error.message}) — these checks will re-run and re-report every turn until it is writable.`;
}

/* ── Report ─────────────────────────────────────────────────────────────────────────────── */

const message = [];

if (failures.length > 0) {
  message.push(
    `⚠️  ${failures.length} architectural check(s) failed on the current working set.`,
    "",
    ...failures,
    "These run again at commit time via pnpm verify — fixing now is cheaper.",
  );
}

if (stampWarning) {
  if (message.length > 0) message.push("");
  message.push(stampWarning);
}

if (message.length === 0) process.exit(0);

process.stdout.write(JSON.stringify({ systemMessage: message.join("\n") }));
