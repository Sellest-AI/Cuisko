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
 *   2. every production file assigning one of those roots imports a sanctioned builder — the
 *      serializer, or a per-table wrapper around it that C11 lists by name
 *   3. no such assignment is built inline — a `.join(`, a template literal or a `+` concatenation
 *      at the assignment is the call site doing the serializer's job
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
import path from "node:path";

/**
 * What a file may import to be trusted with a governed field.
 *
 * `@shared/search` is the serializer itself. The others are per-table builders that wrap it — a
 * migration or a save path legitimately delegates to one rather than assembling terms itself, and
 * requiring the raw serializer there would push callers into duplicating the composition instead.
 *
 * **Adding a name here is the sanctioning act.** A wrapper not listed is treated as a call site
 * doing the serializer's job, which is the direction to be wrong in.
 */
const SANCTIONED_BUILDERS = ["@shared/search", "recipeSearchText"];

/**
 * Whether a file actually IMPORTS one of the sanctioned builders.
 *
 * Read off the import declarations rather than by scanning the source text, and the difference is
 * not pedantry: a substring scan is satisfied by the builder's name appearing anywhere, comments
 * included. A file assembling its own blob and merely MENTIONING `recipeSearchText` in a comment
 * explaining why it does not use it would pass — a hole shaped exactly like the mistake this check
 * exists to catch, and hidden behind a green tick, which is worse than no check at all.
 *
 * A builder matches either as the module (`@shared/search`) or as a named binding
 * (`recipeSearchText`), because the sanctioned list holds both kinds.
 */
const importsSanctionedBuilder = (source) =>
  source.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement)) return false;

    const module = statement.moduleSpecifier.getText(source).slice(1, -1);
    if (SANCTIONED_BUILDERS.includes(module)) return true;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return false;

    return bindings.elements.some((element) => SANCTIONED_BUILDERS.includes(element.name.text));
  });

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
const searchFieldRoots = () => {
  const indexed = new Set();
  const derived = new Set();

  for (const file of listFiles(path.join(ROOT, "convex", "schema"))) {
    const source = parse(file);

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

    visit(source);
  }

  return new Set([...indexed].filter((root) => derived.has(root)));
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

const findings = [];
const roots = searchFieldRoots();

if (roots.size === 0) {
  // Not a violation — a schema with no search index has nothing to govern.
  report("C11 derived search fields are built by one serializer (ADR 0011)", findings);
}

for (const file of listFiles(path.join(ROOT, "convex"))) {
  if (file.includes("__tests__") || file.includes(`${path.sep}schema${path.sep}`)) continue;

  const source = parse(file);
  const trusted = importsSanctionedBuilder(source);

  const unsanctioned = (node, name) => ({
    file: relative(file),
    line: lineOf(source, node),
    message: `\`${name}\` is a searchField, and this file imports no sanctioned builder.`,
    fix:
      `Write it through ${SANCTIONED_BUILDERS[0]} (or a wrapper listed in C11) — a blob built ` +
      `here is indexed under a spelling the reader never searches for, with no symptom.`,
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
    if (ts.isShorthandPropertyAssignment(node) && roots.has(node.name.text) && !trusted) {
      findings.push(unsanctioned(node, node.name.text));
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
            fix: `Build it with the serializer exported from ${SANCTIONED_BUILDERS[0]}.`,
          });
        } else if (!trusted) {
          findings.push(unsanctioned(node, name));
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
}

report("C11 derived search fields are built by one serializer (ADR 0011)", findings);
