/**
 * C19 — every function a `convex/router/` file exports has a caller.
 *
 * Knip cannot answer this. It sees `api` as one generated object, reached by property path, so an
 * export under `convex/` never looks unused however dead it is; it treats the whole folder as entry
 * points and moves on. A function nothing calls then stays deployed, with its tests, its auth and
 * its rate limit still maintained.
 *
 * A caller is a reference in code that runs:
 *
 *   • a full chain ending on the export, `api.router.recipes.getOne.authed`. A chain that stops
 *     short (`const recipes = api.router.recipes`) proves nothing about which export it reaches,
 *     so it counts for none and the function is reported.
 *   • a name in a string, `"router/users/getAccount:_internal"`, which is how `convex/procedures.ts`
 *     has to write it (it cannot import `api`, ADR 0001), outside test files, where such a string is
 *     an assertion on a name rather than a call.
 *   • `npx convex run router/…:…` in `package.json` or a workflow: a deploy step is a caller.
 *
 * Three things are not callers. A function's own test file, or C5's required rejection test would
 * keep every function alive forever. A function reaching itself, which is how a job reschedules.
 * A `typeof api.…` type, which runs nothing.
 *
 * A function with none has to be deleted or listed in `NO_CALLER` with the reason, and a passing run
 * prints that list: this check cannot tell a tool run from the dashboard from a forgotten one, so it
 * keeps the question in front of whoever reads the output instead of settling it.
 *
 * @limitation One hop, not reachability: a dead `authed` keeps alive the `_internal` it calls.
 * Deleting the first surfaces the second on the next run.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { NO_CALLER } from "./c19-convex-callers.no-caller.mjs";
import { lineOf, listFiles, parse, relative, report, ROOT, ROUTER_EXPORT, ts } from "./_lib.mjs";

const SOURCE_ROOTS = ["src", "app", "convex", "scripts"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mjs"];
const NO_CALLER_FILE = "scripts/checks/c19-convex-callers.no-caller.mjs";
const ROUTER_NAME = /router\/[\w/]+:\w+/g;

const _isTest = (file) => file.includes("/__tests__/") || file.includes(".test.");

/** `convex/router/recipes/getOne.ts` → `router/recipes/getOne`, as the function's name spells it. */
const _modulePathOf = (file) => file.replace(/^convex\//, "").replace(/\.tsx?$/, "");

/* ── What the router exports ──────────────────────────────────────────────────────────── */

/** `router/recipes/getOne:authed` → where it is declared. */
const _exportsOf = () => {
  const found = new Map();

  for (const file of listFiles(path.join(ROOT, "convex", "router"))) {
    const at = relative(file);
    if (_isTest(at) || path.basename(file).split(".").length > 2) continue;

    const source = parse(file);
    const modulePath = _modulePathOf(at);

    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;

      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !ROUTER_EXPORT.test(declaration.name.text)) continue;
        found.set(`${modulePath}:${declaration.name.text}`, {
          file: at,
          line: lineOf(source, declaration),
        });
      }
    }
  }

  return found;
};

/* ── What refers to it ────────────────────────────────────────────────────────────────── */

/** `a.b.c` as `["a", "b", "c"]`, or `null` when any link is not a plain property. */
const _chainOf = (node) => {
  if (ts.isIdentifier(node)) return [node.text];
  if (!ts.isPropertyAccessExpression(node)) return null;
  const head = _chainOf(node.expression);
  return head && [...head, node.name.text];
};

/** The outermost link only: `a.b` inside `a.b.c` is part of that chain, not a chain of its own. */
const _isOutermost = (node) =>
  !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node);

const _nameOfChain = (chain) => {
  const [root, ...rest] = chain;
  if ((root !== "api" && root !== "internal") || rest[0] !== "router" || rest.length < 3) return null;
  return `${rest.slice(0, -1).join("/")}:${rest.at(-1)}`;
};

/** The name of the top-level declaration `node` sits inside, or `null` at the top of the file. */
const _enclosingDeclaration = (node) => {
  let current = node;
  while (current.parent && !ts.isSourceFile(current.parent)) current = current.parent;
  if (!ts.isVariableStatement(current)) return null;

  const declaration = current.declarationList.declarations.find(
    (candidate) => node.pos >= candidate.pos && node.end <= candidate.end,
  );
  return declaration && ts.isIdentifier(declaration.name) ? declaration.name.text : null;
};

/** Every function name `file` refers to, parsed as what it is: JSX does not survive as plain TS. */
const _referencesIn = (file) => {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind);
  const at = relative(file);
  const test = _isTest(at);
  const modulePath = _modulePathOf(at);
  const names = new Set();

  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && _isOutermost(node)) {
      const chain = _chainOf(node);
      const name = chain && _nameOfChain(chain);
      const isItself = name === `${modulePath}:${_enclosingDeclaration(node)}`;
      if (name && !isItself) names.add(name);
    }
    if (!test && ts.isStringLiteralLike(node) && /^router\/[\w/]+:\w+$/.test(node.text)) {
      names.add(node.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return names;
};

/** The commands that run a function from outside the code: npm scripts and workflow steps. */
const _commandFiles = () => {
  const workflows = path.join(ROOT, ".github", "workflows");
  let entries = [];
  try {
    entries = readdirSync(workflows);
  } catch {
    entries = []; // A tree with no workflows simply has none of these callers.
  }

  return [
    path.join(ROOT, "package.json"),
    ...entries.filter((entry) => /\.ya?ml$/.test(entry)).map((entry) => path.join(workflows, entry)),
  ];
};

const _namesInCommands = (file) => {
  try {
    return [...readFileSync(file, "utf8").matchAll(ROUTER_NAME)].map((match) => match[0]);
  } catch {
    return []; // A tree with no package.json has no npm scripts to read.
  }
};

/** Function name → every file that refers to it. */
const _callersOf = () => {
  const callers = new Map();
  const add = (name, file) => callers.set(name, [...(callers.get(name) ?? []), file]);

  for (const root of SOURCE_ROOTS) {
    for (const extension of SOURCE_EXTENSIONS) {
      for (const file of listFiles(path.join(ROOT, root), extension)) {
        if (relative(file) === NO_CALLER_FILE) continue; // Its keys are names, and it cannot vouch for itself.

        for (const name of _referencesIn(file)) add(name, relative(file));
      }
    }
  }

  for (const file of _commandFiles()) {
    for (const name of _namesInCommands(file)) add(name, relative(file));
  }

  return callers;
};

/* ── Compare ──────────────────────────────────────────────────────────────────────────── */

const _isOwnTest = (caller, declaredIn) => {
  const { dir, name } = path.posix.parse(declaredIn);
  return caller.startsWith(`${dir}/__tests__/${name}.`);
};

const findings = [];
const callers = _callersOf();
const routerExports = _exportsOf();

const _hasCaller = (name, declaredIn) =>
  (callers.get(name) ?? []).some((caller) => !_isOwnTest(caller, declaredIn));

for (const [name, { file, line }] of routerExports) {
  if (_hasCaller(name, file)) {
    if (name in NO_CALLER) {
      findings.push({
        file: NO_CALLER_FILE,
        message: `NO_CALLER lists ${name}, which has a caller now.`,
        fix: "Remove the entry.",
      });
    }
    continue;
  }

  if (name in NO_CALLER) continue;

  findings.push({
    file,
    line,
    message: `${name} has no caller in ${SOURCE_ROOTS.join("/, ")}/, package.json or a workflow.`,
    fix: `Delete it, write a partial chain out in full, or list it in NO_CALLER (${NO_CALLER_FILE}) with the reason.`,
  });
}

for (const name of Object.keys(NO_CALLER)) {
  if (routerExports.has(name)) continue;

  findings.push({
    file: NO_CALLER_FILE,
    message: `NO_CALLER lists ${name}, which is no longer exported.`,
    fix: "Remove the entry.",
  });
}

report("C19 every router export has a caller", findings);

console.log("   Kept with no caller. Ask whether each is still worth keeping:");
for (const [name, reason] of Object.entries(NO_CALLER)) console.log(`   • ${name}: ${reason}`);
