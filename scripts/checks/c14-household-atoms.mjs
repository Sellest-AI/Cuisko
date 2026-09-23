/**
 * C14 — every piece of session state has been sorted: about a household, or not (ADR 0016).
 *
 * A household switch resets every atom declared with `householdAtom`, and nothing else. An atom that
 * holds a household fact but was declared with a plain `atom` survives the switch, and the next
 * household is served the last one's state: a purchase undone against the wrong cellar, a planning
 * run committed into the wrong kitchen. Nothing throws and no test goes red; the declaration looked
 * like every other atom in the file.
 *
 * A script cannot tell whether a value is about a household. What it can do is refuse to let the
 * question go unanswered: every top-level atom that holds state is either a `householdAtom`, or is
 * named in `NOT_HOUSEHOLD` (`c14-household-atoms.not-household.mjs`) with the reason it is not. A
 * new atom fails this check until someone decides, and the decision is a line in that file that a
 * reviewer reads.
 *
 * Only atoms that hold state are counted. A derived atom (`atom((get) => …)`) holds nothing of its
 * own, and a write-only action (`atom(null, (get, set) => …)`) holds nothing at all.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { lineOf, listFiles, relative, report, ROOT, ts } from "./_lib.mjs";
import { NOT_HOUSEHOLD } from "./c14-household-atoms.not-household.mjs";

/** The Jotai constructors that make an atom holding a value of its own. */
const STATEFUL_FACTORIES = new Set(["atom", "atomWithReset", "atomWithStorage", "atomWithDefault"]);

/** Where `householdAtom` is defined: its own `atomWithReset` is the mechanism, not a declaration. */
const MECHANISM = "src/modules/households/household-atom.ts";

const _isFunction = (node) => node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

/** True when a call to `atom` makes a derived or write-only atom, neither of which holds a value. */
const _holdsNothing = (call) => {
  const [first, second] = call.arguments;
  if (_isFunction(first)) return true;
  return first?.kind === ts.SyntaxKind.NullKeyword && _isFunction(second);
};

const _parse = (file) =>
  ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

const _isTest = (file) => file.includes("__tests__") || /\.test\.tsx?$/.test(file);

const findings = [];
const answered = new Set();
const srcDir = path.join(ROOT, "src");

for (const file of [...listFiles(srcDir, ".ts"), ...listFiles(srcDir, ".tsx")]) {
  const rel = relative(file);
  if (_isTest(file) || rel === MECHANISM) continue;

  const source = _parse(file);

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    for (const decl of statement.declarationList.declarations) {
      const call = decl.initializer;
      if (!ts.isIdentifier(decl.name) || !call || !ts.isCallExpression(call)) continue;
      if (!ts.isIdentifier(call.expression) || !STATEFUL_FACTORIES.has(call.expression.text)) continue;
      if (call.expression.text === "atom" && _holdsNothing(call)) continue;

      const key = `${rel}:${decl.name.text}`;
      if (key in NOT_HOUSEHOLD) {
        answered.add(key);
        continue;
      }

      findings.push({
        file: rel,
        line: lineOf(source, decl),
        message: `ADR 0016 — "${decl.name.text}" holds session state and nobody has said whether it belongs to a household.`,
        fix:
          `If it is about the household the app shops for, declare it with householdAtom so a switch ` +
          `resets it. If it is not, add "${key}" to NOT_HOUSEHOLD in scripts/checks/c14-household-atoms.not-household.mjs ` +
          `with the reason.`,
      });
    }
  }
}

for (const key of Object.keys(NOT_HOUSEHOLD)) {
  if (answered.has(key)) continue;

  findings.push({
    file: "scripts/checks/c14-household-atoms.not-household.mjs",
    message: `ADR 0016 — NOT_HOUSEHOLD names "${key}", which no longer declares an atom.`,
    fix: "Remove the entry, or update it to where the atom moved. A stale entry would excuse whatever takes the name next.",
  });
}

report("C14 every session atom is sorted: household or not", findings);
