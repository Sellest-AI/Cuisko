import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/**
 * The tree a check runs against — this repo, unless CHECK_ROOT overrides it.
 *
 * The override is what makes the checks testable. They are top-level side-effecting modules that
 * end in `process.exit`, so a test cannot import one and inspect its findings; it has to run the
 * real script and read the exit code. Without a way to aim it at a fixture, the only tree a check
 * could ever run against is the repo itself — where the violations it looks for, by definition,
 * do not exist.
 */
export const ROOT = process.env.CHECK_ROOT
  ? path.resolve(process.env.CHECK_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// `.claude` holds the worktrees other sessions open inside the repo, each a full copy of the tree.
const IGNORED_DIRS = new Set(["node_modules", "_generated", ".git", ".history", ".expo", "dist", ".claude"]);

/** All files under `dir` matching `ext`, recursively. Returns absolute paths. */
export const listFiles = (dir, ext = ".ts") => {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // The directory does not exist yet — not an error, just nothing to check.
  }

  return entries.flatMap((entry) => {
    if (IGNORED_DIRS.has(entry)) return [];
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return listFiles(full, ext);
    return full.endsWith(ext) ? [full] : [];
  });
};

export const relative = (file) => path.relative(ROOT, file).split(path.sep).join("/");

/** Parses a file into a TypeScript AST with parent pointers set. */
export const parse = (file) =>
  ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

export const lineOf = (source, node) =>
  source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

/* ── Reading a declared constant out of a source file ─────────────────────────────────── */

/**
 * Top-level `const` name -> its initializer node, for every declaration in `file`.
 *
 * Shared by the checks that measure the repo against a vocabulary declared in TypeScript — C8
 * against `SUPPORTED_LOCALES`, C12 against the `shared/` lists. Every one of them reads the real
 * declaration rather than restating it, because a restated copy is the exact drift they exist to
 * catch: a hardcoded list still passes on the day someone adds an entry the check never hears
 * about, certifying the gap it missed.
 */
export const declaredConstants = (file) => {
  const source = parse(file);
  const out = new Map();

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      out.set(declaration.name.text, declaration.initializer);
    }
  }

  return out;
};

/** `["en"] as const` and `(["en"])` are both that array — unwrap to whatever it actually is. */
const unwrap = (node) =>
  ts.isAsExpression(node) || ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;

/** The text of a string literal node, or `null` for anything else — including a missing node. */
export const stringLiteral = (node) => {
  const inner = node && unwrap(node);
  return inner && ts.isStringLiteral(inner) ? inner.text : null;
};

/**
 * An array literal of string literals as a plain array, or `null`.
 *
 * `null` for a partially dynamic array rather than the strings it happens to contain: a caller
 * that cannot read the whole list must fail closed, since checking a subset it silently derived
 * would report a green tick over the entries it could not see.
 */
export const stringArray = (node) => {
  const inner = node && unwrap(node);
  if (!inner || !ts.isArrayLiteralExpression(inner)) return null;

  const values = inner.elements.map(stringLiteral);
  return values.every((value) => value !== null) ? values : null;
};

/**
 * Namespace name -> the locale file it is bound to, read out of `translations/types.ts`.
 *
 * That file is where a namespace name is actually bound to a locale file:
 *
 *     import home from "./en/home.json";
 *     type TranslationResources = { Home: typeof home; … }
 *
 * Deriving the pair instead — capitalise the filename — would be a second copy of that binding,
 * and would certify nothing the day a namespace is registered under a name that is not its
 * filename. Same argument as `declaredConstants`.
 *
 * Read by C8, which compares every namespace's keys across locales, and by C12, which compares one
 * namespace's keys against the `shared/` vocabularies they are the words for.
 */
export const namespaceFiles = (typesSource) => {
  const source = parse(typesSource);
  const fileOfBinding = new Map();
  const out = new Map();

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const binding = statement.importClause?.name?.text;
      const specifier = ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : null;

      if (binding && specifier) fileOfBinding.set(binding, path.basename(specifier));
      continue;
    }

    if (!ts.isTypeAliasDeclaration(statement)) continue;
    if (statement.name.text !== "TranslationResources") continue;
    if (!ts.isTypeLiteralNode(statement.type)) continue;

    for (const member of statement.type.members) {
      if (!ts.isPropertySignature(member) || !member.type) continue;
      if (!ts.isTypeQueryNode(member.type) || !ts.isIdentifier(member.type.exprName)) continue;

      out.set(member.name.getText(source), fileOfBinding.get(member.type.exprName.text));
    }
  }

  return out;
};

/**
 * Prints findings and exits non-zero if there are any. Every check reports through here so the
 * output shape is identical across C1–C3.
 */
export const report = (checkName, findings) => {
  if (findings.length === 0) {
    console.log(`✅ ${checkName}`);
    return;
  }

  console.error(`\n❌ ${checkName} — ${findings.length} violation(s)\n`);
  for (const { file, line, message, fix } of findings) {
    console.error(`   ${file}${line ? `:${line}` : ""}`);
    console.error(`      ${message}`);
    if (fix) console.error(`      Fix: ${fix}`);
    console.error("");
  }
  process.exit(1);
};

export { ts };
