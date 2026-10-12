/**
 * What costs money, and how an operation reaches it: the import graph and Convex references that
 * C16 (is it rate limited?) and C17 (is it traced?) both read.
 *
 * Shared rather than copied because the two checks have to agree on what "reaches a cost" means. A
 * second copy would let one of them learn a new paid vendor, or a new way to reach one, and the
 * other go on passing the same operation.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { listFiles, parse, relative, ROOT, ts } from "./_lib.mjs";

export const CONVEX = path.join(ROOT, "convex");

/** What a model, a page fetch or an upload costs. A file under any of these is a call out, or the agent that makes them. */
export const PAID = [
  "convex/agent/",
  "convex/lib/typesafe/",
  "convex/lib/replicate/",
  "convex/lib/runpod/",
  // Fetches a page the cook named: our bandwidth, and a small SSRF-shaped surface (`fetchPage`).
  "convex/lib/scraping/",
];

const _candidates = (base) => [`${base}.ts`, path.join(base, "index.ts"), base];

/** The file a value import resolves to inside `convex/`, or `undefined` for a package or another tree. */
const _resolve = (from, specifier) => {
  const base = specifier.startsWith("@convex/")
    ? path.join(CONVEX, specifier.slice("@convex/".length))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : undefined;

  return base && _candidates(base).find((file) => file.endsWith(".ts") && existsSync(file));
};

const _importsCache = new Map();

/** The files this one imports at runtime. `import type` is erased, so it reaches nothing. */
const _importsOf = (file) => {
  if (_importsCache.has(file)) return _importsCache.get(file);

  const found = [];
  for (const statement of parse(file).statements) {
    const isImport = ts.isImportDeclaration(statement);
    const isReexport = ts.isExportDeclaration(statement) && !statement.isTypeOnly;
    if (!isImport && !isReexport) continue;
    if (isImport && statement.importClause?.isTypeOnly) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const target = _resolve(file, statement.moduleSpecifier.text);
    if (target) found.push(target);
  }

  _importsCache.set(file, found);
  return found;
};

/** Every file reachable from `entry` by imports, `entry` included. */
export const closureOf = (entry) => {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    for (const next of _importsOf(queue.pop())) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return seen;
};

/** `a.b.c` → `["a", "b", "c"]`, or `null` when any link is not a plain identifier. */
const _dottedChain = (node) => {
  if (ts.isIdentifier(node)) return [node.text];
  if (!ts.isPropertyAccessExpression(node)) return null;

  const head = _dottedChain(node.expression);
  return head ? [...head, node.name.text] : null;
};

/**
 * The export a Convex reference names, as `{ file, exportName }`, or `undefined` for anything else.
 *
 * `internal.router.recipes.importOneNode._internal` is a path in a string-keyed object, not an
 * import. It names a module by its path, then an export, so it is resolved the way the platform does:
 * the longest prefix of the chain that is a file under `convex/`, and the segment after it.
 */
export const referenceTarget = (node) => {
  const chain = _dottedChain(node);
  if (!chain || (chain[0] !== "internal" && chain[0] !== "api")) return undefined;

  const segments = chain.slice(1);
  for (let length = segments.length - 1; length >= 1; length--) {
    const target = `${path.join(CONVEX, ...segments.slice(0, length))}.ts`;
    if (existsSync(target)) return { file: target, exportName: segments[length] };
  }

  return undefined;
};

const _referencesCache = new Map();

/** The exports this file calls through a Convex reference, as `{ file, exportName, node }`. */
export const referencesOf = (file) => {
  if (_referencesCache.has(file)) return _referencesCache.get(file);

  const found = [];
  const visit = (node) => {
    const isOutermost = !node.parent || !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node);
    if (ts.isPropertyAccessExpression(node) && isOutermost) {
      const target = referenceTarget(node);
      if (target) found.push({ ...target, node });
    }

    ts.forEachChild(node, visit);
  };
  visit(parse(file));

  _referencesCache.set(file, found);
  return found;
};

const _isExported = (statement) =>
  statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

/**
 * The builder a definition is made with, and the object it is given: `authActionI18n({ … })`, or
 * `ownedMutation("recipes")({ … })`, whose builder is the inner call's name.
 */
const _builderOf = (initializer) => {
  if (!initializer || !ts.isCallExpression(initializer)) return {};

  const callee = initializer.expression;
  const builder = ts.isIdentifier(callee)
    ? callee.text
    : ts.isCallExpression(callee) && ts.isIdentifier(callee.expression)
      ? callee.expression.text
      : undefined;
  const [first] = initializer.arguments;

  return { builder, definition: first && ts.isObjectLiteralExpression(first) ? first : undefined };
};

/** The exported `const` declarations of a file: `{ name, statement, builder, definition, isAction, isCostly }`. */
export const exportsOf = (file) =>
  parse(file).statements.flatMap((statement) =>
    ts.isVariableStatement(statement) && _isExported(statement)
      ? statement.declarationList.declarations
          .filter((declaration) => ts.isIdentifier(declaration.name))
          .map((declaration) => {
            const { builder, definition } = _builderOf(declaration.initializer);

            return {
              name: declaration.name.text,
              statement,
              builder,
              definition,
              isAction: builder === "internalAction",
              isCostly: ts.getJSDocTags(statement).some((tag) => tag.tagName.text === "costly"),
            };
          })
      : [],
  );

export const startsWithAny = (file, prefixes) => prefixes.some((prefix) => file.startsWith(prefix));

/** Every router file a check reads. Tests define no operation. */
export const routerFiles = () =>
  listFiles(path.join(CONVEX, "router")).filter((file) => !file.endsWith(".test.ts"));

/** `relative(file)#export` for every export marked `@costly` in the router. */
export const costlyExports = (files) =>
  new Set(
    files.flatMap((file) =>
      exportsOf(file)
        .filter(({ isCostly }) => isCostly)
        .map(({ name }) => `${relative(file)}#${name}`),
    ),
  );
