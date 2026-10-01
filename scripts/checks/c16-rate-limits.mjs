/**
 * C16 — an operation a signed-in cook can call, and that costs money, is rate limited.
 *
 * `enforceRateLimit` is what keeps one cook from running up the bill (ADR 0018), and it is an
 * explicit call, so the failure it invites is the new `authed` operation that never makes it. A
 * builder could not be forgotten, but `procedures.ts` may not import `_generated/api` (ADR 0001) and
 * the limiter needs it, so the guarantee is this check instead.
 *
 * What costs money is found two ways, because an operation reaches it two ways:
 *
 *  1. By import. An `authed` / `admin` router file whose imports reach a model, a scraper or the
 *     storage (`VENDORS`) must also import `enforceRateLimit`.
 *  2. By reference. A paid `internal` action is marked `@costly`; an `authed` file whose imports
 *     reach a `@costly` export through `internal.<path>.<export>` must import the guard too. That is
 *     how an operation hands its work to an action (`importOne` to `importOneNode`), and no import
 *     shows it. The marker keeps it exact: following every reference instead flagged a dozen
 *     operations for deleting an image's files, which no cook can run up a bill with.
 *
 * And the marker has to be trustworthy, so:
 *
 *  3. An `internalAction` in a router file whose imports reach a PAID vendor (`PAID`) carries
 *     `@costly`. Only an action can call out, so only an action needs the tag.
 *  4. Every limit in `RATE_LIMITS` is applied somewhere: a limit nothing applies is a promise to the
 *     cook, and to us, that nothing keeps.
 *
 * "Imports reach" is the closure of static, value imports: it proves the guard is in the operation's
 * own graph, not that it runs first or on every branch. That is each endpoint's refusal test. It
 * fails closed where it can see: a new operation reaching a cost is a finding until it is rate
 * limited, or is added to ALLOWLIST with the reason.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { lineOf, listFiles, parse, relative, report, ROOT, ts } from "./_lib.mjs";

const CONVEX = path.join(ROOT, "convex");

const GUARD = "convex/functions/rateLimits/enforceRateLimit.ts";

/** What a model, a page fetch or an upload costs. A file under any of these is a call out, or the agent that makes them. */
const PAID = [
  "convex/agent/",
  "convex/lib/typesafe/",
  "convex/lib/replicate/",
  "convex/lib/runpod/",
  // Fetches a page the cook named: our bandwidth, and a small SSRF-shaped surface (`fetchPage`).
  "convex/lib/scraping/",
];

/** `PAID`, and the storage a cook can fill. Deleting from it is not a cost, so it is not in `PAID`. */
const VENDORS = [...PAID, "convex/lib/s3/", "convex/lib/media/"];

/**
 * Router files that reach a vendor and deliberately have no rate limit. Adding one here is the review:
 * say why the cook's own call is not the one that costs.
 */
const ALLOWLIST = new Map([
  // Imports the assistant agent to READ a stored transcript. It is a query: no model runs.
  ["convex/router/assistant/listMessages.ts", "reads a thread; never calls the model"],
]);

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
const _closureOf = (entry) => {
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

const _referencesCache = new Map();

/**
 * The exports this file calls through a Convex reference, as `{ file, exportName, node }`.
 *
 * `internal.router.recipes.importOneNode._internal` is a path in a string-keyed object, not an
 * import. It names a module by its path, then an export, so it is resolved the way the platform does:
 * the longest prefix of the chain that is a file under `convex/`, and the segment after it.
 */
const _referencesOf = (file) => {
  if (_referencesCache.has(file)) return _referencesCache.get(file);

  const found = [];
  const visit = (node) => {
    const isOutermost = !node.parent || !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node);
    if (ts.isPropertyAccessExpression(node) && isOutermost) {
      const chain = _dottedChain(node);
      if (chain && (chain[0] === "internal" || chain[0] === "api")) {
        const segments = chain.slice(1);
        for (let length = segments.length - 1; length >= 1; length--) {
          const target = `${path.join(CONVEX, ...segments.slice(0, length))}.ts`;
          if (!existsSync(target)) continue;

          found.push({ file: target, exportName: segments[length], node });
          break;
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(parse(file));

  _referencesCache.set(file, found);
  return found;
};

const _isExported = (statement) =>
  statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

/** The exported `const` declarations of a file: `{ name, statement, isCostly }`. */
const _exportsOf = (file) =>
  parse(file).statements.flatMap((statement) =>
    ts.isVariableStatement(statement) && _isExported(statement)
      ? statement.declarationList.declarations
          .filter((declaration) => ts.isIdentifier(declaration.name))
          .map((declaration) => ({
            name: declaration.name.text,
            statement,
            isAction:
              declaration.initializer !== undefined &&
              ts.isCallExpression(declaration.initializer) &&
              ts.isIdentifier(declaration.initializer.expression) &&
              declaration.initializer.expression.text === "internalAction",
            isCostly: ts.getJSDocTags(statement).some((tag) => tag.tagName.text === "costly"),
          }))
      : [],
  );

const _startsWithAny = (file, prefixes) => prefixes.some((prefix) => file.startsWith(prefix));

const findings = [];

const ROUTER = path.join(CONVEX, "router");
const routerFiles = listFiles(ROUTER).filter((file) => !file.endsWith(".test.ts"));

/** Rule 3: a paid `internalAction` says so, so rule 2 can see it. */
const costly = new Set();
for (const file of routerFiles) {
  const name = relative(file);
  const imported = [..._closureOf(file)].map(relative);
  const reachesPaid = imported.some((reached) => _startsWithAny(reached, PAID));

  for (const { name: exportName, statement, isAction, isCostly } of _exportsOf(file)) {
    if (isCostly) costly.add(`${name}#${exportName}`);
    if (!isAction || isCostly || !reachesPaid) continue;

    findings.push({
      file: name,
      line: lineOf(parse(file), statement),
      message: `\`${exportName}\` is an internal action whose imports reach a paid service, and it is not marked \`@costly\`; an \`authed\` operation calling it would go unchecked.`,
      fix: "Add `@costly` to its doc comment, so C16 can require every `authed` caller to be rate limited.",
    });
  }
}

for (const file of routerFiles) {
  const source = parse(file);
  const entry = _exportsOf(file).find(({ name }) => name === "authed" || name === "admin");
  if (!entry) continue;

  const name = relative(file);
  if (ALLOWLIST.has(name)) continue;

  const closure = [..._closureOf(file)];
  const imported = closure.map(relative);
  if (imported.includes(GUARD)) continue;

  /* Rule 1: it imports a cost. */
  const vendor = imported.find((reached) => _startsWithAny(reached, VENDORS));

  /* Rule 2: it references a `@costly` action. */
  const reference = closure
    .flatMap((reached) => _referencesOf(reached))
    .find(({ file: target, exportName }) => costly.has(`${relative(target)}#${exportName}`));

  if (!vendor && !reference) continue;

  findings.push({
    file: name,
    line: lineOf(source, entry.statement),
    message: vendor
      ? `an \`authed\` operation reaches \`${vendor}\` and never reaches \`enforceRateLimit\`; one cook could run it without limit.`
      : `an \`authed\` operation calls \`${relative(reference.file)}\` \`${reference.exportName}\`, marked \`@costly\`, and never reaches \`enforceRateLimit\`; one cook could run it without limit.`,
    fix:
      "Call `enforceRateLimit(ctx, kind)` (or `withRateLimit(...)`) from `functions/rateLimits/enforceRateLimit.ts` before the paid work runs, " +
      "with a kind from RATE_LIMITS, or add the file to ALLOWLIST in scripts/checks/c16-rate-limits.mjs with the reason.",
  });
}

/* Rule 4: a limit nothing applies. */
const LIMITS = path.join(CONVEX, "lib", "rateLimits.ts");
if (existsSync(LIMITS)) {
  const limits = readFileSync(LIMITS, "utf8");
  const kinds = [...limits.matchAll(/^\s+(\w+): \{ kind:/gm)].map((match) => match[1]);

  const sources = listFiles(CONVEX)
    .filter((file) => !file.endsWith(".test.ts") && file !== LIMITS)
    .map((file) => readFileSync(file, "utf8"));

  for (const kind of kinds) {
    const call = new RegExp(`\\b(?:enforceRateLimit|withRateLimit)\\([^;]*?["']${kind}["']`);
    if (sources.some((text) => call.test(text))) continue;

    findings.push({
      file: relative(LIMITS),
      line: limits.slice(0, limits.indexOf(`  ${kind}: {`)).split("\n").length,
      message: `\`${kind}\` is in RATE_LIMITS and no operation applies it.`,
      fix: "Apply it from the operation it limits, or delete the entry.",
    });
  }
}

report("C16 costly operations are rate limited (ADR 0018)", findings);
