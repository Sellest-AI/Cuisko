/**
 * C4 — the schema invariants (S5, S7, S10).
 *
 * These three were tagged 🧪 TEST in the original convention draft with no mechanism behind them,
 * which makes them guidelines wearing a rule's clothes. S10 is the one that bites late: a foreign
 * key creates a delete obligation, and the index that satisfies it has to exist at the moment the
 * key is declared — otherwise you discover the gap when data starts leaking.
 *
 *   S5   every table declares `updatedAt`, or is marked `@immutable <reason>`
 *   S7   every table has ≥1 index, or is marked `@singleton <reason>`
 *   S10  every `v.id(parent)` field has an index leading with that field, AND a CASCADE entry
 *        whose named index exists
 *
 * Only `convex/schema/**` is scanned. The `authTables` spread into `schema.ts` belongs to
 * @convex-dev/auth — we never write those rows, so our invariants do not apply to them.
 */
import path from "node:path";

import { lineOf, listFiles, parse, relative, report, ROOT, ts } from "./_lib.mjs";

const findings = [];
const stringLiteral = (node) => (node && ts.isStringLiteralLike(node) ? node.text : null);

/* ── 1. Read the cascade registry ─────────────────────────────────────────────────────── */

/** parent table → [{ table, index, field }] */
const cascade = new Map();

const readCascade = (node) => {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === "CASCADE" &&
    node.initializer &&
    ts.isObjectLiteralExpression(node.initializer)
  ) {
    for (const parent of node.initializer.properties) {
      if (!ts.isPropertyAssignment(parent) || !ts.isArrayLiteralExpression(parent.initializer)) {
        continue;
      }

      const parentName = ts.isIdentifier(parent.name)
        ? parent.name.text
        : stringLiteral(parent.name);
      if (!parentName) continue;

      const rules = parent.initializer.elements.filter(ts.isObjectLiteralExpression).map((entry) => {
        const rule = {};
        for (const prop of entry.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            rule[prop.name.text] = stringLiteral(prop.initializer);
          }
        }
        return rule;
      });

      cascade.set(parentName, rules);
    }
  }

  ts.forEachChild(node, readCascade);
};

readCascade(parse(path.join(ROOT, "convex", "functions", "cascade.ts")));

/* ── 2. Collect every declared table ──────────────────────────────────────────────────── */

/**
 * Unwraps `defineTable({…}).index("a", […]).index("b", […])` into its field object and its
 * chained calls. The chain nests outside-in, so we descend to `defineTable` first.
 */
const unwrapTable = (node) => {
  const methods = [];
  let current = node;

  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    methods.unshift({ name: current.expression.name.text, args: current.arguments });
    current = current.expression.expression;
  }

  const isDefineTable =
    ts.isCallExpression(current) &&
    ts.isIdentifier(current.expression) &&
    current.expression.text === "defineTable";
  if (!isDefineTable) return null;

  const fields = current.arguments[0];
  return { fields: fields && ts.isObjectLiteralExpression(fields) ? fields : null, methods };
};

/** name → { file, line, statement, source, fields, indexes, hasAnyIndex } */
const tables = new Map();

for (const file of listFiles(path.join(ROOT, "convex", "schema"))) {
  const source = parse(file);

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const table = unwrapTable(node.initializer);
      if (table) {
        tables.set(node.name.text, {
          file: relative(file),
          line: lineOf(source, node),
          source,
          statement: node.parent?.parent ?? node,
          fields: table.fields,
          indexes: table.methods
            .filter((m) => m.name === "index")
            .map((m) => ({
              name: stringLiteral(m.args[0]),
              fields:
                m.args[1] && ts.isArrayLiteralExpression(m.args[1])
                  ? m.args[1].elements.map(stringLiteral).filter((f) => f !== null)
                  : [],
            })),
          hasAnyIndex: table.methods.some((m) => m.name === "index" || m.name === "searchIndex"),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
}

/* ── 3. Check each table ──────────────────────────────────────────────────────────────── */

const hasMarker = (table, tag) => {
  const { source, statement } = table;
  const ranges = ts.getLeadingCommentRanges(source.text, statement.pos) ?? [];
  return ranges.some((r) => source.text.slice(r.pos, r.end).includes(tag));
};

/** `v.id("recipes")` → "recipes", seeing through `v.optional(...)`. */
const foreignKeyTarget = (node) => {
  if (!node || !ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }

  const method = node.expression.name.text;
  if (method === "optional") return foreignKeyTarget(node.arguments[0]);
  if (method !== "id") return null;

  return stringLiteral(node.arguments[0]);
};

for (const [name, table] of tables) {
  const at = { file: table.file, line: table.line };

  if (!table.hasAnyIndex && !hasMarker(table, "@singleton")) {
    findings.push({
      ...at,
      message: `S7 — table "${name}" declares no index.`,
      fix: 'Add an index, or document it with "@singleton <reason>" in the leading comment.',
    });
  }

  const fieldNames = (table.fields?.properties ?? [])
    .filter((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name))
    .map((p) => p.name.text);

  if (!fieldNames.includes("updatedAt") && !hasMarker(table, "@immutable")) {
    findings.push({
      ...at,
      message: `S5 — table "${name}" has no "updatedAt".`,
      fix: 'Add "updatedAt: v.number()", or document it with "@immutable <reason>".',
    });
  }

  for (const prop of table.fields?.properties ?? []) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;

    const parent = foreignKeyTarget(prop.initializer);
    if (!parent) continue;

    const field = prop.name.text;
    const suggested = `by_${field.replace(/Id$/, "")}`;
    const fkAt = { file: table.file, line: lineOf(table.source, prop) };
    const leading = table.indexes.find((i) => i.fields[0] === field);

    if (!leading) {
      findings.push({
        ...fkAt,
        message: `S10 — "${name}.${field}" references "${parent}" with no index leading on it.`,
        fix:
          `Add .index("${suggested}", ["${field}"]) — a compound index led by another field ` +
          `cannot answer "all rows for this ${parent} row".`,
      });
    }

    const rule = (cascade.get(parent) ?? []).find((r) => r.table === name && r.field === field);

    if (!rule) {
      findings.push({
        ...fkAt,
        message: `S10 — "${name}.${field}" has no CASCADE entry under "${parent}".`,
        fix:
          `Add { table: "${name}", index: "${leading?.name ?? suggested}", field: "${field}" } to ` +
          `CASCADE.${parent} in convex/functions/cascade.ts, or these rows are orphaned when a ` +
          `${parent} row is deleted.`,
      });
    } else if (!table.indexes.some((i) => i.name === rule.index)) {
      findings.push({
        file: "convex/functions/cascade.ts",
        message: `S10 — CASCADE["${parent}"] names index "${rule.index}", absent from "${name}".`,
        fix: `Use "${leading?.name ?? suggested}", or declare "${rule.index}" on the table.`,
      });
    }
  }
}

/* ── 4. Every cascade rule points at a table that exists ──────────────────────────────── */

for (const [parent, rules] of cascade) {
  for (const rule of rules) {
    if (!tables.has(rule.table)) {
      findings.push({
        file: "convex/functions/cascade.ts",
        message: `S10 — CASCADE["${parent}"] names table "${rule.table}", which is not declared.`,
        fix: `Remove the entry, or declare "${rule.table}" in convex/schema/.`,
      });
    }
  }
}

report("C4 schema invariants (S5, S7, S10)", findings);
