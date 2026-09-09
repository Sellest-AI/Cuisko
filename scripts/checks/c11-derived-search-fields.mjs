/**
 * C11 — a field a search index reads is built by one shared serializer. ADR 0011.
 *
 * A `searchField` is denormalized, so it is correct only while every writer produces the same shape
 * from the same input. The failure when one does not is the quietest in the codebase: the row is
 * indexed under a spelling the reader never searches for, and it is never found. No error, no empty
 * state, no log line — a recipe simply missing from a list.
 *
 * Nothing else in the toolchain can see it. `tsc` is satisfied by any `string`, ESLint has no
 * opinion about how one was built, and a test would have to assert the exact blob of every writer
 * to notice. So the rule is checked structurally instead: read the schema for which fields are
 * indexed, then read every production writer of those fields and require the serializer.
 *
 * **What counts as derived, and why the marker is `vLocalizedText`.** A `searchIndex` can read
 * authored content directly — `recipes.title` is indexed at `title.values.en` and is nobody's
 * denormalization. Governing that would be wrong: there is no serializer for a title, because a
 * title is not derived from anything. So the check governs a searchField only when its root field
 * is declared `vLocalizedText`, the validator whose whole meaning in schema/i18n.ts is "a plain
 * string per locale, with no translation metadata — a denormalized or derived blob". Choosing that
 * type IS the declaration that a field is derived, which is what makes the rule checkable at all.
 *
 * Three assertions:
 *
 *   1. every `searchField` whose root is declared `vLocalizedText` is collected as governed
 *   2. every value assigned to one of those roots was PRODUCED by a sanctioned builder — the
 *      serializer, or a function imported from a module that composes it — traced through `await`,
 *      object literals and local constants to the call that made it
 *   3. no such assignment is built inline — a `.join(`, a template literal or a `+` concatenation
 *      at the assignment is the call site doing the serializer's job
 *
 * **Trust is a property of the value, not of the file.** An earlier version asked whether the file
 * imported a builder, against a hand-written list of blessed names. It passed this, which is the
 * whole mistake it exists to catch:
 *
 * ```ts
 * import { searchTextOf } from "@shared/search"; // used for some other field
 * const myOwnBlob = (terms) => terms.join(" ");  // the join hides one call away
 * await ctx.db.insert("recipes", { search: { en: myOwnBlob(terms) } });
 * ```
 *
 * `__tests__` is excluded on purpose. A fixture writing `search: { fr: "x" }` is stating a literal
 * input, not maintaining a derived field, and forcing it through the serializer would make the
 * fixture assert the serializer rather than the behaviour under test.
 *
 * What it does NOT check: that the value handed to the serializer is the RIGHT one. No script can
 * know that a recipe's blob should have been built from its ingredients rather than its title —
 * that is what the reviewer and the tests are for.
 */
import { listFiles, lineOf, parse, relative, report, ROOT, ts } from "./_lib.mjs";
import fs from "node:fs";
import path from "node:path";

/** The one serializer. Trust starts here and is derived from here; nothing else is named by hand. */
const SERIALIZER_MODULE = "@shared/search";

/**
 * An import specifier as an absolute file path, or `undefined` for anything outside the repo.
 *
 * Only the three forms this codebase uses — relative, `@convex/`, `@shared/`. A specifier that does
 * not resolve is a package, and a package is never a sanctioned builder.
 */
const resolveModule = (specifier, fromFile) => {
  const base = specifier.startsWith(".")
    ? path.resolve(path.dirname(fromFile), specifier)
    : specifier.startsWith("@convex/")
      ? path.join(ROOT, "convex", specifier.slice("@convex/".length))
      : specifier.startsWith("@shared/")
        ? path.join(ROOT, "shared", specifier.slice("@shared/".length))
        : undefined;

  if (!base) return undefined;

  return [`${base}.ts`, path.join(base, "index.ts")].find((candidate) => fs.existsSync(candidate));
};

/** Every module a file imports, as `{ specifier, resolved, names }`. */
const importsOf = (source, file) =>
  source.statements.filter(ts.isImportDeclaration).map((statement) => {
    const specifier = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;

    return {
      specifier,
      resolved: resolveModule(specifier, file),
      names:
        bindings && ts.isNamedImports(bindings)
          ? bindings.elements.map((element) => element.name.text)
          : [],
    };
  });

const builderModules = new Map();

/**
 * Whether a module is allowed to produce a governed value: it IS the serializer, or it imports it.
 *
 * **This is what replaced a hand-maintained list of blessed function names.** That list had to be
 * edited for every new per-table wrapper, and — worse — it sanctioned a NAME, so trust was decided
 * by what a file imported somewhere rather than by where a particular value came from. A file that
 * imported the serializer for one field could hand-roll another and pass.
 *
 * One hop is deliberate. A wrapper composes the serializer, so it imports it directly; requiring a
 * chain would sanction a module three levels away from anything that can serialize.
 */
const isBuilderModule = (file) => {
  const cached = builderModules.get(file);
  if (cached !== undefined) return cached;

  // Set before recursing: a cycle must not decide trust, and must not hang the check either.
  builderModules.set(file, false);

  const answer = importsOf(parse(file), file).some(
    (entry) => entry.specifier === SERIALIZER_MODULE,
  );

  builderModules.set(file, answer);
  return answer;
};

/**
 * The names a file may call to produce a governed value — imported from the serializer itself, or
 * from a module that composes it.
 *
 * A locally defined function is never in here, which is the point: `const myBlob = (t) =>
 * t.join(" ")` is exactly the call site this check exists to reject, and under the old file-level
 * rule it passed whenever the file imported the serializer for anything at all.
 */
const trustedCallables = (source, file) => {
  const names = new Set();

  for (const entry of importsOf(source, file)) {
    const sanctioned =
      entry.specifier === SERIALIZER_MODULE || (entry.resolved && isBuilderModule(entry.resolved));

    if (sanctioned) for (const name of entry.names) names.add(name);
  }

  return names;
};

/**
 * Every `const x = …` in a file, so a value assigned by name can be traced back to what built it.
 *
 * Shadowing is not modelled — two `const search` in different scopes collapse to the last one seen.
 * A check that reported the wrong one would be worse than this, but the failure here is a false
 * PASS, so it is worth knowing about: it needs two same-named constants in one file, one of them
 * built by a serializer, which no writer in this codebase has.
 */
const constantsOf = (source) => {
  const values = new Map();

  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      values.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return values;
};

/**
 * Whether a value was PRODUCED by a sanctioned builder, rather than merely sitting in a file that
 * imports one.
 *
 * It unwraps the noise (`await`, parentheses, `as`), descends object literals because the blob is
 * per-locale — `{ en: searchTextOf(…), fr: … }` — and follows an identifier back to the `const`
 * that defined it, which is how `const search = await recipeSearchText(…)` reaches its `{ search }`
 * two statements later.
 *
 * Everything it cannot trace is untrusted. That is the correct direction to be wrong in: a false
 * finding is argued about and fixed, a false pass is a recipe nobody can find and no symptom.
 */
const isTrustedValue = (node, trusted, constants, seen = new Set()) => {
  if (!node) return false;

  if (
    ts.isAwaitExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return isTrustedValue(node.expression, trusted, constants, seen);
  }

  if (ts.isObjectLiteralExpression(node)) {
    // An empty object claims to be a blob and is not one; a spread hides where its values came from.
    return (
      node.properties.length > 0 &&
      node.properties.every((property) => {
        if (ts.isPropertyAssignment(property)) {
          return isTrustedValue(property.initializer, trusted, constants, seen);
        }
        if (ts.isShorthandPropertyAssignment(property)) {
          return isTrustedValue(constants.get(property.name.text), trusted, constants, seen);
        }
        return false;
      })
    );
  }

  if (ts.isCallExpression(node)) {
    return ts.isIdentifier(node.expression) && trusted.has(node.expression.text);
  }

  if (ts.isIdentifier(node)) {
    // Guard the trace against `const a = b; const b = a;`.
    if (seen.has(node.text)) return false;
    seen.add(node.text);

    return isTrustedValue(constants.get(node.text), trusted, constants, seen);
  }

  return false;
};

/** The root of a dotted search field path — `search.en` is stored under the key `search`. */
const rootOf = (field) => field.split(".")[0];

/** The validator that marks a field as a derived blob rather than as authored content. */
const DERIVED_VALIDATOR = "vLocalizedText";

/**
 * The search-field roots this check governs: those declared `vLocalizedText`.
 *
 * Both halves are read from the schema — which fields are indexed, and which are derived — so a
 * field only becomes governed by being both.
 */
const searchFieldRootsOf = (root, source) => {
  const indexed = new Set();
  const derived = new Set();

  {
    const visit = (node) => {
      // `search: vLocalizedText` / `search: v.optional(vLocalizedText)`
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
        if (node.initializer.getText(source).includes(DERIVED_VALIDATOR)) {
          derived.add(node.name.text);
        }
      }

      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "searchIndex"
      ) {
        const options = node.arguments[1];
        if (options && ts.isObjectLiteralExpression(options)) {
          for (const property of options.properties) {
            if (
              ts.isPropertyAssignment(property) &&
              property.name.getText(source) === "searchField" &&
              ts.isStringLiteral(property.initializer)
            ) {
              indexed.add(rootOf(property.initializer.text));
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(root);
  }

  return new Set([...indexed].filter((field) => derived.has(field)));
};

/**
 * Every table that declares a governed field, as `table -> the roots it governs`.
 *
 * The table name comes from the `export const <name> = defineTable(…)` that encloses the index,
 * which is how `convex/schema.ts` names it and therefore how `ctx.db.insert("<name>", …)` addresses
 * it. Reading it per declaration rather than per file is what lets one schema file hold several
 * tables — `ingredients.ts` did, before the allergen tables were dropped.
 */
const governedTables = () => {
  const tables = new Map();

  for (const file of listFiles(path.join(ROOT, "convex", "schema"))) {
    const source = parse(file);

    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        node.initializer.getText(source).includes("defineTable")
      ) {
        const governed = searchFieldRootsOf(node.initializer, source);
        if (governed.size > 0) tables.set(node.name.text, governed);
        return;
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return tables;
};

/** True when the expression assembles its own string rather than calling something to do it. */
const isInlineAssembly = (node) => {
  if (ts.isTemplateExpression(node)) return true;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return true;
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "join"
  ) {
    return true;
  }
  return false;
};

/**
 * True when the value assigned to a governed field is assembled inline ANYWHERE inside it.
 *
 * It has to descend, because the blob is per-locale: the offending `.join(" ")` is never the
 * initializer of `search`, it is the initializer of the `en` inside it. Checking only the outer
 * value is how the first version of this check passed every fixture it was written to reject.
 *
 * It descends through object literals and no further, which is what keeps
 * `searchTextOf(terms.join(" "))` from being reported — the join there is an argument being handed
 * TO the serializer, not a call site standing in for it.
 */
const isAssembledInline = (node) => {
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.some(
      (property) => ts.isPropertyAssignment(property) && isAssembledInline(property.initializer),
    );
  }

  return isInlineAssembly(node);
};

/**
 * Every `ctx.db.insert("<table>", <payload>)` in a file.
 *
 * Inserts and not patches, and the asymmetry is not an oversight. An insert names its table as a
 * string literal, so it can be attributed with certainty; `ctx.db.patch(recipeId, …)` names no
 * table anywhere, and deciding which one it writes needs the type of `recipeId` — a full
 * `ts.Program`, not an AST walk. Gating the half that is knowable is worth more than a heuristic
 * over the half that is not, because a check that guesses gets switched off.
 */
const insertCallsIn = (source) => {
  const calls = [];

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "insert" &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.name.text === "db" &&
      node.arguments.length >= 2 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      calls.push({ table: node.arguments[0].text, node, payload: node.arguments[1] });
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return calls;
};

/**
 * The property names an insert payload supplies, or `undefined` when that cannot be known.
 *
 * `undefined` rather than an empty set, because the two must not be confused: a payload spread from
 * elsewhere is UNKNOWN, and reporting a missing field on it would be a false finding on code that
 * is very likely correct. An identifier is followed back to its `const` first, which is the shape
 * `seedIngredients` uses — it builds `row` and inserts it a few lines later.
 */
const suppliedFields = (node, constants, seen = new Set()) => {
  if (!node) return undefined;

  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return undefined;
    seen.add(node.text);
    return suppliedFields(constants.get(node.text), constants, seen);
  }

  if (!ts.isObjectLiteralExpression(node)) return undefined;

  const names = new Set();

  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) return undefined;

    if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
      names.add(property.name.text);
    } else if (ts.isShorthandPropertyAssignment(property)) {
      names.add(property.name.text);
    }
  }

  return names;
};

const findings = [];
const tables = governedTables();
const roots = new Set([...tables.values()].flatMap((fields) => [...fields]));

/** Which production modules insert into each governed table — `table -> [{ file, node }]`. */
const inserters = new Map([...tables.keys()].map((table) => [table, []]));

if (roots.size === 0) {
  // Not a violation — a schema with no search index has nothing to govern.
  report("C11 derived search fields are built by one serializer (ADR 0011)", findings);
}

for (const file of listFiles(path.join(ROOT, "convex"))) {
  if (file.includes("__tests__") || file.includes(`${path.sep}schema${path.sep}`)) continue;

  const source = parse(file);
  const trusted = trustedCallables(source, file);
  const constants = constantsOf(source);

  for (const call of insertCallsIn(source)) {
    const governed = tables.get(call.table);
    if (!governed) continue;

    inserters.get(call.table).push({ file, node: call.node, source });

    const supplied = suppliedFields(call.payload, constants);
    if (!supplied) continue;

    for (const field of governed) {
      if (supplied.has(field)) continue;

      findings.push({
        file: relative(file),
        line: lineOf(source, call.node),
        message: `this inserts into \`${call.table}\` without its derived field \`${field}\`.`,
        fix:
          `Supply \`${field}\` here, built through the serializer. A row inserted without it is ` +
          `indexed under nothing and is unreachable by search — and where the column is optional, ` +
          `no type error says so.`,
      });
    }
  }

  const unsanctioned = (node, name) => ({
    file: relative(file),
    line: lineOf(source, node),
    message: `\`${name}\` is a searchField, and this value did not come from a sanctioned builder.`,
    fix:
      `Build it by calling the serializer from ${SERIALIZER_MODULE}, or a function imported from a ` +
      `module that does — a blob built any other way is indexed under a spelling the reader never ` +
      `searches for, with no symptom.`,
  });

  const visit = (node) => {
    /**
     * Shorthand counts, and finding that out is why this branch exists.
     *
     * `return { search, ...facets }` is a ShorthandPropertyAssignment, which has no initializer and
     * is a different AST node entirely — the first version of this check inspected only
     * PropertyAssignment and waved the whole shape through. A hole in a check is worse than no
     * check, because the green tick is read as evidence.
     */
    if (ts.isShorthandPropertyAssignment(node) && roots.has(node.name.text)) {
      if (!isTrustedValue(constants.get(node.name.text), trusted, constants)) {
        findings.push(unsanctioned(node, node.name.text));
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
        ? node.name.text
        : undefined;

      if (name && roots.has(name)) {
        if (isAssembledInline(node.initializer)) {
          findings.push({
            file: relative(file),
            line: lineOf(source, node),
            message: `\`${name}\` is a searchField and is assembled inline here.`,
            fix: `Build it with the serializer exported from ${SERIALIZER_MODULE}.`,
          });
        } else if (!isTrustedValue(node.initializer, trusted, constants)) {
          findings.push(unsanctioned(node, name));
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
}

/**
 * One source of truth per table, and proof that it exists.
 *
 * The writer is DISCOVERED as the module that inserts the table rather than dictated by a filename.
 * Naming it by convention was the other option and it does not survive contact: a name derived from
 * the field breaks the moment a table has two derived fields, and `saveRecipe` / `seedIngredients`
 * already say plainly what they are. What matters is not what the writer is called — it is that
 * there is exactly one of it.
 *
 * Zero inserters is the fail-open case and the reason this runs at all: a table can declare a
 * derived field, be governed by every rule above, and have nothing write it. Every assertion in
 * this file is then vacuously true and the ✅ means nothing.
 *
 * ⚠️ This gates INSERTS only. A derived field whose sources live in ANOTHER table — `recipes.search`
 * is built from `recipeIngredients` — can still go stale from a write this never sees. That is
 * ADR 0011's recomputation clause, and it is not enforced here.
 */
for (const [table, governed] of tables) {
  const writers = inserters.get(table);
  const fields = [...governed].map((field) => `\`${field}\``).join(", ");

  if (writers.length === 0) {
    findings.push({
      file: "convex/schema",
      line: 1,
      message: `\`${table}\` declares the derived field ${fields}, and no module inserts the table.`,
      fix:
        `Either write the table through one module, or drop the field. A governed field nothing ` +
        `writes makes every other assertion in C11 vacuous for this table.`,
    });
    continue;
  }

  if (writers.length === 1) continue;

  for (const writer of writers) {
    findings.push({
      file: relative(writer.file),
      line: lineOf(writer.source, writer.node),
      message: `\`${table}\` carries the derived field ${fields} and is inserted from ${writers.length} modules.`,
      fix:
        `Funnel the inserts through one module so the derived field has a single writer — the ` +
        `others should call it. Two writers agree only until one of them is changed.`,
    });
  }
}

report("C11 derived search fields are built by one serializer (ADR 0011)", findings);
