/**
 * C10 — every test file is actually run, warms what it globs, and every `_model/` has one.
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
 *
 * Rule 3 is placement, and it is here because placement is the one property a test cannot report
 * on itself. A misplaced test still runs and still passes; what it costs is found later, by
 * someone who looks beside a file, finds nothing, and writes the second copy.
 *
 * Rules 4 and 5 are the warm-up: every module a convex-test file names, and every module those run
 * through `ctx.run*` — themselves or through a helper they import — is loaded in its `beforeAll`
 * (ADR 0008, "The first test pays for the import").
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { listFiles, relative, report, ROOT, ROUTER_EXPORT } from "./_lib.mjs";

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

/* ── 2. Every _model/ file has a test ──────────────────────────────────────────────────── */

for (const file of listFiles(path.join(ROOT, "src", "modules"), ".ts")) {
  const segments = file.split(path.sep);
  if (!segments.includes("_model")) continue;
  if (file.endsWith(".test.ts")) continue;
  if (segments.includes("__tests__")) continue;

  const test = path.join(
    path.dirname(file),
    "__tests__",
    path.basename(file).replace(/\.ts$/, ".test.ts"),
  );
  if (existsSync(test)) continue;

  findings.push({
    file: relative(file),
    message: "Domain logic in _model/ with no test.",
    fix: `Write ${relative(test)}. _model/ is pure by construction — it needs no provider tree.`,
  });
}

/* ── 3. Every test sits in a __tests__/ folder ─────────────────────────────────────────── */

/**
 * One placement rule, no exceptions (ADR 0008). `_model/` and `_hooks/` used to co-locate, which
 * meant a reviewer had to know which folder a path was in before knowing where its test belonged —
 * and a rule with exceptions is one the next author gets wrong in the direction of the exception.
 *
 * Checked here rather than left to review because placement is invisible in a diff: a test in the
 * wrong place still runs, still passes, and reads as correct until someone goes looking for it
 * beside the file it covers and concludes there is none.
 */
for (const file of testFilesOnDisk) {
  if (file.split("/").includes("__tests__")) continue;

  findings.push({
    file,
    message: "Test file outside a __tests__/ folder.",
    fix:
      `Move it to ${path.posix.join(path.posix.dirname(file), "__tests__", path.posix.basename(file))} ` +
      "and fix its relative imports. A folder holds all its tests in one place or none.",
  });
}

/* ── 4. A convex-test file calling through the lazy glob warms its module first ────────── */

/**
 * `convex-test` takes `import.meta.glob` loaders and resolves them on the first call that needs
 * them, so a file calling `api.` / `internal.` charges the whole module graph beneath that call
 * to its first test, against that test's 5s timeout (ADR 0008, "The first test pays for the
 * import"). It fails silently while it passes — 2s and 2ms print the same tick — and grows with
 * the backend, so it surfaces as a timeout on somebody's unrelated commit.
 *
 * A warm-up filtered with `startsWith("/convex/…")` must cover every module the file calls, not
 * only its subject: households/leave.test.ts warmed `leave.` and called `join` cold, and a test
 * seeding through `planning.commit` pays for commit's graph the same way. A warm-up this cannot
 * read — no `startsWith` literal — is taken on trust. A test that imports its subject directly
 * (the `functions/` tests) pays at module load, outside any timer, and is not asked for one.
 */
const WARM_UP_FIX =
  "`beforeAll(() => Promise.all(Object.entries(modules)" +
  ".filter(([p]) => p.startsWith(\"/convex/<path>.\")).map(([, load]) => load())))`. " +
  "Filter on the modules the file calls — never load the whole glob.";

/** A function reference, `api.` or `internal.` then at least a module and an export. */
const REFERENCE = String.raw`\b(?:api|internal)(?:\.[A-Za-z_$][\w$]*){2,}`;

const RUN_CALL = new RegExp(String.raw`\.run(?:Query|Mutation|Action)\(\s*(${REFERENCE})`, "g");

const IMPORT = /^\s*import\s+(?!type\s)[^;]*?\sfrom\s+["']([^"']+)["']/gm;

const MOCK = /\bvi\.mock\(\s*["']([^"']+)["']/g;

/** `api.router.households.join.authed` → `/convex/router/households/join.`: the last segment is the export. */
const moduleOf = (reference) => `/convex/${reference.split(".").slice(1, -1).join("/")}.`;

const fileOf = (module) => path.join(ROOT, `${module.slice(1)}ts`);

/**
 * Every file rule 5 walks, read once, its comments blanked: a `ctx.run*` quoted in prose is not a
 * call. `null` for a file that does not exist. A `//` after a colon is a URL, not a comment.
 */
const _code = new Map();
const codeOf = (file) => {
  if (!_code.has(file))
    _code.set(
      file,
      existsSync(file)
        ? readFileSync(file, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|[^:])\/\/.*$/gm, "$1")
        : null,
    );
  return _code.get(file);
};

const isNodeModule = (module) => /^\s*["']use node["']/.test(codeOf(fileOf(module)) ?? "");

/**
 * An `@convex/…` or relative specifier → the backend file it loads, or null outside convex/. A file
 * not found is still named, as `<path>.ts`: a mock of it must still match its module.
 */
const resolveImport = (from, specifier) => {
  const base = specifier.startsWith("@convex/")
    ? path.join(ROOT, "convex", specifier.slice("@convex/".length))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (base === null || relative(base).split("/").includes("_generated")) return null;

  return [`${base}.ts`, path.join(base, "index.ts")].find((file) => existsSync(file)) ?? `${base}.ts`;
};

/**
 * The modules loaded lazily once `module` runs: every `ctx.runQuery` / `runMutation` / `runAction`
 * target reached from its source, from the helpers it imports, and from those targets in turn.
 * recipes/verifyOne.test.ts warmed every module it named and still billed its last test for
 * `updateOne`, which only the router's own `runMutation` reached — and timed out under load. Half
 * the router-to-router calls here go through a `functions/` helper, so imports are followed too.
 *
 * Left out on purpose: a scheduled target (`runAfter`, `scheduleTracedAfter`), which loads only when
 * the scheduler fires and the tests fake it; a `"use node"` target, which the edge-runtime project
 * must never load (ADR 0008, the trailing dot); and any file the test mocks, whose calls never run.
 * A call through a variable rather than a literal reference is not seen.
 */
const reachedBy = (module, mocked) => {
  const reached = new Set();
  const visited = new Set();
  const pending = [fileOf(module)];

  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file) || mocked.has(file)) continue;
    visited.add(file);

    const code = codeOf(file);
    if (code === null) continue;

    for (const [, reference] of code.matchAll(RUN_CALL)) {
      const target = moduleOf(reference);
      if (reached.has(target) || mocked.has(fileOf(target)) || isNodeModule(target)) continue;
      reached.add(target);
      pending.push(fileOf(target));
    }

    for (const [, specifier] of code.matchAll(IMPORT)) {
      const imported = resolveImport(file, specifier);
      if (imported !== null) pending.push(imported);
    }
  }

  return reached;
};

for (const file of listFiles(path.join(ROOT, "convex"), ".test.ts")) {
  const source = readFileSync(file, "utf8");
  if (!source.includes("convexTest(")) continue;

  const references = [...source.matchAll(new RegExp(REFERENCE, "g"))].map((match) => match[0].split("."));
  if (references.length === 0) continue;

  // Below router/ the last segment must be an access level (C1), or the path below reads it wrong.
  for (const reference of references) {
    if (reference[1] !== "router" || ROUTER_EXPORT.test(reference.at(-1))) continue;

    findings.push({
      file: relative(file),
      message: `\`${reference.join(".")}\` names no router export.`,
      fix: "End it with the access level it calls: anon · authed · admin · server · _internal · _internal_<verb>.",
    });
  }

  const called = new Set(references.map((reference) => moduleOf(reference.join("."))));

  if (!/\bbeforeAll\(/.test(source)) {
    findings.push({
      file: relative(file),
      message: "Calls a Convex function through the lazy glob with no beforeAll warm-up.",
      fix: `Preload the module under test before any test is timed: ${WARM_UP_FIX}`,
    });
    continue;
  }

  const warmed = [...source.matchAll(/startsWith\(\s*["'`](\/convex\/[^"'`]*)["'`]/g)].map((match) => match[1]);
  if (warmed.length === 0) continue;

  const isCold = (module) => !warmed.some((prefix) => module.startsWith(prefix));

  const cold = [...called].filter(isCold);
  if (cold.length > 0)
    findings.push({
      file: relative(file),
      message: `Its beforeAll does not warm ${cold.join(", ")}, which it calls through the lazy glob.`,
      fix: `Add each to the warm-up's filter, so no test is billed for its import: ${WARM_UP_FIX}`,
    });

  const mocked = new Set(
    [...source.matchAll(MOCK)].map(([, specifier]) => resolveImport(file, specifier)).filter((mock) => mock !== null),
  );
  const coldRun = [...new Set([...called].flatMap((module) => [...reachedBy(module, mocked)]))].filter(
    (module) => !called.has(module) && isCold(module),
  );
  if (coldRun.length > 0)
    findings.push({
      file: relative(file),
      message: `Its beforeAll does not warm ${coldRun.join(", ")}, which a function it calls runs through ctx.run*.`,
      fix: `Add each to the warm-up's filter — the test never names it, but it pays for its import: ${WARM_UP_FIX}`,
    });
}

report("C10 every test runs, sits in __tests__/, warms its glob, and every _model/ has one", findings);
