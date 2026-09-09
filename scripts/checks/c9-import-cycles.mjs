/**
 * C9 — no import cycles inside this repository.
 *
 * Metro does not fail on a cycle. It hands the second module a partially-initialised export, so
 * the symptom is `undefined is not a function` on one import order and not another — the kind of
 * defect that survives review because nothing in either file looks wrong.
 *
 * Peer modules may import each other's public roots (lint R8 guards the interior), and a barrel
 * such as `{domain}/hooks.ts` makes a cycle both easy to write and invisible to read. That is the
 * risk this check exists for.
 *
 * WHY NOT `import/no-cycle`. It was tried, and it took eslint from 4s to 20s — `pnpm verify` from
 * 16s to 32s, on every commit. All of that goes into resolving `react-native`, `expo-*` and the
 * rest of node_modules so the rule can classify them as external and skip them. A cycle through a
 * third-party package is not something this repo can fix, so the resolution is pure cost. Ignoring
 * every bare specifier makes the graph small enough to walk in milliseconds.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { listFiles, relative, report, ROOT, ts } from "./_lib.mjs";

/** Where cycles are worth preventing. `_generated/` is already skipped by listFiles. */
const ROOTS = ["app", "src", "convex", "shared"];

const EXTENSIONS = [".ts", ".tsx"];

/**
 * Metro picks a platform file over the base one, but they are alternates of a single module rather
 * than separate nodes. Resolving to the base keeps one node per module, which is what makes a
 * reported cycle a path a reader can follow.
 */
const RESOLUTION_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/**
 * Alias table, read from tsconfig rather than restated here — a copy would drift the first time an
 * alias is added, and drift in a check is worse than no check. tsconfig.json carries comments, so
 * it needs TypeScript's JSONC parser rather than JSON.parse.
 */
const _aliases = () => {
  const file = path.join(ROOT, "tsconfig.json");
  const { config, error } = ts.parseConfigFileTextToJson(file, readFileSync(file, "utf8"));

  if (error || !config?.compilerOptions?.paths) return [];

  return Object.entries(config.compilerOptions.paths).map(([pattern, targets]) => ({
    prefix: pattern.replace(/\*$/, ""),
    wildcard: pattern.endsWith("*"),
    target: String(targets[0]).replace(/^\.\//, "").replace(/\*$/, ""),
  }));
};

const ALIASES = _aliases();

/** Every import/export-from specifier in a file, as written. */
const _specifiers = (file) => {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const out = [];

  for (const statement of source.statements) {
    const isImport = ts.isImportDeclaration(statement);
    const isExportFrom = ts.isExportDeclaration(statement) && statement.moduleSpecifier;
    if (!isImport && !isExportFrom) continue;

    // A type-only edge cannot cause a runtime cycle — types are erased before Metro sees them.
    if (statement.importClause?.isTypeOnly || statement.isTypeOnly) continue;

    const specifier = statement.moduleSpecifier;
    if (specifier && ts.isStringLiteral(specifier)) out.push(specifier.text);
  }

  return out;
};

/** An internal specifier as a repo-relative path, or null for anything we deliberately ignore. */
const _toRepoPath = (specifier, fromFile) => {
  if (specifier.startsWith(".")) {
    return relative(path.resolve(path.dirname(fromFile), specifier));
  }

  for (const alias of ALIASES) {
    if (alias.wildcard ? specifier.startsWith(alias.prefix) : specifier === alias.prefix) {
      return alias.target + specifier.slice(alias.prefix.length);
    }
  }

  // A bare package name. Not ours, not fixable here — see the header.
  return null;
};

const _resolve = (repoPath, known) => {
  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidate = repoPath + suffix;
    if (known.has(candidate)) return candidate;
  }
  return null;
};

/* ── Build the graph ──────────────────────────────────────────────────────────────────────── */

const files = ROOTS.flatMap((root) =>
  EXTENSIONS.flatMap((ext) => listFiles(path.join(ROOT, root), ext)),
)
  .map(relative)
  .filter((file) => !file.endsWith(".d.ts"));

const known = new Set(files);
const graph = new Map();

for (const file of files) {
  const edges = [];

  for (const specifier of _specifiers(path.join(ROOT, file))) {
    const repoPath = _toRepoPath(specifier, path.join(ROOT, file));
    if (!repoPath) continue;

    const target = _resolve(repoPath, known);
    if (target && target !== file) edges.push(target);
  }

  graph.set(file, edges);
}

/* ── Find cycles ──────────────────────────────────────────────────────────────────────────── */

const findings = [];
const seen = new Set();
const state = new Map(); // file → "visiting" | "done"
const stack = [];

/** Rotation-independent identity, so one cycle is reported once rather than once per member. */
const _signature = (cycle) => [...cycle].sort().join(" ");

const visit = (file) => {
  state.set(file, "visiting");
  stack.push(file);

  for (const next of graph.get(file) ?? []) {
    if (state.get(next) === "visiting") {
      const cycle = stack.slice(stack.indexOf(next));
      const signature = _signature(cycle);

      if (!seen.has(signature)) {
        seen.add(signature);
        findings.push({
          file: cycle[0],
          message: `Import cycle: ${[...cycle, cycle[0]].join(" → ")}`,
          fix:
            "Break one edge. A cycle through a barrel usually means the importer wants something " +
            "the barrel re-exports — import it from the file that defines it instead.",
        });
      }
      continue;
    }

    if (state.get(next) !== "done") visit(next);
  }

  stack.pop();
  state.set(file, "done");
};

for (const file of files) if (!state.has(file)) visit(file);

report("C9 no import cycles", findings);
