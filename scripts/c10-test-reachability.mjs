/**
 * C10 — every test file is actually run, and every `_model/` has one.
 *
 * A test that no runner collects is worse than no test: it reports nothing, and it reads to the
 * next author as coverage that already exists. This repo shipped that exact state — the runner's
 * `include` was `**\/*.test.ts`, so a `.tsx` test could be written, committed, reviewed and never
 * once executed. Nothing failed, because nothing ran.
 *
 * Rule 1 asks Vitest itself which files it claims, rather than restating the include globs here.
 * A second copy of the globs would drift from the first, and this check's whole job is to catch
 * drift between what exists and what runs.
 *
 * Rule 2 is the one place a test is mandatory rather than judgement (ADR 0008): `_model/` is
 * framework-free domain logic, testable with a plain object and no provider tree, and it is what
 * the rest of the module is derived from. If anything is worth pinning, it is that.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { listFiles, relative, report, ROOT } from "./_lib.mjs";

const findings = [];

const testFilesOnDisk = [
  ...listFiles(ROOT, ".test.ts"),
  ...listFiles(ROOT, ".test.tsx"),
].map(relative);

/* ── 1. Every test file on disk is claimed by a Vitest project ─────────────────────────── */

/**
 * `--filesOnly` collects file paths without importing them, so this costs a resolve pass rather
 * than a test run.
 */
const listed = JSON.parse(
  execFileSync(
    process.execPath,
    [path.join(ROOT, "node_modules", "vitest", "vitest.mjs"), "list", "--filesOnly", "--json"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ),
);

const claimed = new Map(
  listed.map((entry) => [relative(path.resolve(entry.file)), entry.projectName]),
);

for (const file of testFilesOnDisk) {
  if (claimed.has(file)) continue;

  findings.push({
    file,
    message: "No Vitest project collects this file, so it never runs.",
    fix:
      "Add it to a project's `include` in vitest.config.mts — or move it under a path an " +
      "existing project already covers.",
  });
}

/* ── 2. Every _model/ file has a co-located test ───────────────────────────────────────── */

for (const file of listFiles(path.join(ROOT, "src", "modules"), ".ts")) {
  if (!file.split(path.sep).includes("_model")) continue;
  if (file.endsWith(".test.ts")) continue;

  const test = file.replace(/\.ts$/, ".test.ts");
  if (existsSync(test)) continue;

  findings.push({
    file: relative(file),
    message: "Domain logic in _model/ with no co-located test.",
    fix: `Write ${relative(test)}. _model/ is pure by construction — it needs no provider tree.`,
  });
}

report("C10 every test runs, and every _model/ has one", findings);
