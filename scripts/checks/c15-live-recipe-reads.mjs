/**
 * C15 — a query over `recipes` reads live rows only (ADR 0017).
 *
 * A recipe its cook deleted is archived, not removed: planned and cooked meals still point at it.
 * So the row stays in every index, and the only thing keeping it off the recipes page, the search
 * box, the favorites shelf and the planning pool is each of those reads asking for
 * `isArchived: false`. A new list written without it shows deleted recipes again, with no error
 * and no failing test, because every existing test seeds live rows.
 *
 * Structural, like C13: every `query("recipes")` outside the allowlist must narrow its index read
 * with `.eq("isArchived", false)`, written inside the `withIndex` / `withSearchIndex` callback where
 * this can see it. A helper that narrows on the caller's behalf is invisible here, which is why
 * `searchForUser` spells it at each call site rather than inside `_narrow`.
 *
 * Point reads by id (`db.get`) are deliberately not covered: opening an archived recipe from a
 * meal cooked with it is what archiving exists for (ADR 0014). A list assembled from ids, as
 * `listFavorites` is, filters by hand, and ADR 0017 says so; this check cannot see that case.
 */
import path from "node:path";

import { lineOf, listFiles, parse, relative, report, ROOT, stringLiteral, ts } from "./_lib.mjs";

/**
 * Files allowed to read archived recipes, each with the reason. Adding one here is the review: it
 * says the reader needs every row, and why no screen will show what it returns.
 */
const ALLOWLIST = new Map([
  ["convex/functions/recipes/findCatalogBySource.ts", "dedupes an import against every row holding the page"],
]);

const INDEX_READS = new Set(["withIndex", "withSearchIndex"]);

const LIVE_ONLY = /\.eq\(\s*["']isArchived["']\s*,\s*false\s*\)/;

/** `x.query("recipes")`, whatever `x` is: `ctx.db`, a destructured `db`, a wrapper. */
const isRecipesQuery = (node) =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  node.expression.name.text === "query" &&
  node.arguments.length > 0 &&
  stringLiteral(node.arguments[0]) === "recipes";

/** The first `.withIndex(…)` / `.withSearchIndex(…)` call chained onto `query`, if any. */
const indexReadOf = (query) => {
  let node = query;

  while (ts.isPropertyAccessExpression(node.parent) && ts.isCallExpression(node.parent.parent)) {
    const call = node.parent.parent;
    if (INDEX_READS.has(node.parent.name.text)) return call;
    node = call;
  }

  return null;
};

const findings = [];

for (const file of listFiles(path.join(ROOT, "convex"))) {
  if (file.endsWith(".test.ts")) continue;

  const name = relative(file);
  if (ALLOWLIST.has(name)) continue;

  const source = parse(file);

  const visit = (node) => {
    if (isRecipesQuery(node)) {
      const read = indexReadOf(node);
      const range = read?.arguments[1];

      if (!range || !LIVE_ONLY.test(range.getText(source))) {
        findings.push({
          file: name,
          // The `query` itself, not the start of the chain: `ctx.db` often sits on the line above.
          line: lineOf(source, node.expression.name),
          message:
            "`query(\"recipes\")` does not narrow its index read to `isArchived: false`; a recipe " +
            "its cook deleted would show up in whatever this lists.",
          fix:
            "Read through an index carrying `isArchived` and add `.eq(\"isArchived\", false)` inside " +
            "the `withIndex` / `withSearchIndex` callback, or, if this reader needs archived rows, " +
            "add it to ALLOWLIST in scripts/checks/c15-live-recipe-reads.mjs with the reason.",
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
}

report("C15 recipe queries read live rows only (ADR 0017)", findings);
