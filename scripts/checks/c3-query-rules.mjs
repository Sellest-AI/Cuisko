/**
 * C3 — the query and index rules (S1, S2, S3).
 *
 * These are the three schema rules 05-CONVENTIONS tags 📐 SCRIPT. Without this file they would
 * be guidelines wearing a rule's clothing, which is the specific failure mode this project
 * exists to avoid.
 *
 *   S1  every `ctx.db.query()` is immediately followed by .withIndex() / .withSearchIndex()
 *   S2  indexes are named `by_<field>[_and_<field>]`, in definition order
 *   S3  never `.filter()` together with `.paginate()`
 */
import path from "node:path";

import { lineOf, listFiles, parse, relative, report, ROOT, ts } from "./_lib.mjs";

const findings = [];

/* ── S1 + S3 — query chains, across the whole backend ─────────────────────────────────── */

/** Collects the method names chained onto a call, e.g. ["withIndex", "filter", "paginate"]. */
const chainMethods = (call) => {
  const methods = [];
  let node = call;

  for (;;) {
    const access = node.parent;
    if (!access || !ts.isPropertyAccessExpression(access) || access.expression !== node) break;
    methods.push(access.name.text);

    const next = access.parent;
    if (!next || !ts.isCallExpression(next) || next.expression !== access) break;
    node = next;
  }

  return methods;
};

const isDbQuery = (node) =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  node.expression.name.text === "query" &&
  ts.isPropertyAccessExpression(node.expression.expression) &&
  node.expression.expression.name.text === "db";

for (const file of listFiles(path.join(ROOT, "convex"))) {
  if (file.endsWith(".test.ts")) continue;

  const source = parse(file);

  const visit = (node) => {
    if (isDbQuery(node)) {
      const methods = chainMethods(node);
      const at = { file: relative(file), line: lineOf(source, node) };

      if (methods[0] !== "withIndex" && methods[0] !== "withSearchIndex") {
        findings.push({
          ...at,
          message: "S1 — ctx.db.query() is not immediately followed by .withIndex().",
          fix: "Add .withIndex(...) / .withSearchIndex(...), and define the index if it is missing.",
        });
      }

      if (methods.includes("filter") && methods.includes("paginate")) {
        findings.push({
          ...at,
          message: "S3 — .filter() combined with .paginate().",
          fix:
            "Convex paginates the index read and filters afterwards, so pages come back short " +
            "and infinite scroll stops early. Put the predicate in the index instead.",
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
}

/* ── S2 — index naming, in convex/schema/ ─────────────────────────────────────────────── */

const snake = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** `userId` may read as `user` or `user_id`; `isPublic` as `public` or `is_public`. */
const variantsOf = (field) => {
  const out = new Set([snake(field)]);
  if (field.length > 2 && field.endsWith("Id")) out.add(snake(field.slice(0, -2)));
  if (/^is[A-Z]/.test(field)) out.add(snake(field.slice(2)));
  return [...out];
};

const acceptableNames = (fields) =>
  fields
    .reduce((acc, field) => acc.flatMap((parts) => variantsOf(field).map((v) => [...parts, v])), [
      [],
    ])
    .map((parts) => `by_${parts.join("_and_")}`);

const stringLiteral = (node) =>
  node && ts.isStringLiteralLike(node) ? node.text : null;

for (const file of listFiles(path.join(ROOT, "convex", "schema"))) {
  const source = parse(file);

  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const at = { file: relative(file), line: lineOf(source, node) };
      const name = stringLiteral(node.arguments[0]);

      if (method === "index" && name) {
        const arrayArg = node.arguments[1];
        const fields =
          arrayArg && ts.isArrayLiteralExpression(arrayArg)
            ? arrayArg.elements.map(stringLiteral).filter((f) => f !== null)
            : [];

        if (fields.length > 0) {
          const acceptable = acceptableNames(fields);
          if (!acceptable.includes(name)) {
            findings.push({
              ...at,
              message: `S2 — index "${name}" does not match its fields [${fields.join(", ")}].`,
              fix: `Rename to "${acceptable[0]}".`,
            });
          }
        }
      }

      if (method === "searchIndex" && name && !name.startsWith("search_")) {
        findings.push({
          ...at,
          message: `S2 — search index "${name}" is not named search_<field>.`,
          fix: 'Rename to "search_<searchField>".',
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
}

report("C3 query and index rules (S1, S2, S3)", findings);
