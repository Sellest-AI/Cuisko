/**
 * C8 — every locale carries the same keys.
 *
 * `translations/types.ts` derives the entire `TranslationKeys` union from the `en` files alone:
 *
 *     import common from "./en/common.json";
 *     import home from "./en/home.json";
 *
 * That is what makes the types useful — one locale defines the contract — and it is exactly why
 * nothing in the toolchain can see another locale falling behind it. `fr/common.json` is never
 * imported from a `.ts` file, so `tsc` never reads it; ESLint does not parse JSON; C6 proves only
 * that files a *doc* names exist. So a key deleted from `fr` type-checks, lints and tests clean,
 * and surfaces exactly once — as the raw string `Common.cancel` rendered to a French user where a
 * word should have been.
 *
 * PRODUCT.md commits to French and English both being first-class, and CONVENTIONS §3.3 says the
 * two key sets stay identical. This is the mechanism behind that sentence.
 *
 * Four assertions, all measured against DEFAULT_LOCALE as the reference:
 *
 *   1. the locale directories are exactly SUPPORTED_LOCALES — no orphan directory, and no locale
 *      the constant promises but nobody wrote
 *   2. every locale carries the same namespace files
 *   3. every key path exists in every locale, reported in BOTH directions
 *   4. every shared path has the same KIND everywhere — a string in `en` that became an object in
 *      `fr` is a structural divergence that comparing key names alone reports as a match
 *
 * It says nothing about the translations themselves: whether "Confirmer" renders "Confirm" well is
 * not a property a script can hold an opinion about.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { parse, relative, report, ROOT, ts } from "./_lib.mjs";

const findings = [];

const LOCALES_SOURCE = path.join(ROOT, "shared/translations.ts");
const TRANSLATIONS_DIR = path.join(ROOT, "translations");

/* ── The locale constants, read from the source of truth ──────────────────────────────── */

/**
 * Read out of `shared/translations.ts` rather than restated here, because a copy is the very drift
 * this check exists to catch: a hardcoded ["en", "fr"] would still pass on the day someone adds
 * "es" to the constant and no directory to go with it — the check would certify the gap it missed.
 */
const declaredConstants = () => {
  const source = parse(LOCALES_SOURCE);
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

const stringLiteral = (node) => {
  const inner = node && unwrap(node);
  return inner && ts.isStringLiteral(inner) ? inner.text : null;
};

const stringArray = (node) => {
  const inner = node && unwrap(node);
  if (!inner || !ts.isArrayLiteralExpression(inner)) return null;

  const values = inner.elements.map(stringLiteral);
  return values.every((value) => value !== null) ? values : null;
};

// `parse()` reads the file straight off disk, so a moved or renamed shared/translations.ts throws
// an ENOENT stack trace — burying the fail-closed report written for exactly this situation.
if (!existsSync(LOCALES_SOURCE)) {
  report("C8 locales are in parity", [
    {
      file: relative(LOCALES_SOURCE),
      message: "Does not exist — C8 reads DEFAULT_LOCALE and SUPPORTED_LOCALES from this file.",
      fix: "Restore it, or point LOCALES_SOURCE in scripts/c8-i18n-parity.mjs at its new home.",
    },
  ]);
}

const constants = declaredConstants();
const defaultLocale = stringLiteral(constants.get("DEFAULT_LOCALE"));
const supportedLocales = stringArray(constants.get("SUPPORTED_LOCALES"));

/**
 * Without either constant there is no reference to compare against, and carrying on would print a
 * green tick while asserting nothing — the one outcome worse than failing.
 */
if (!defaultLocale || !supportedLocales) {
  report("C8 locales are in parity", [
    {
      file: relative(LOCALES_SOURCE),
      message: `Could not read ${defaultLocale ? "SUPPORTED_LOCALES" : "DEFAULT_LOCALE"} as a literal.`,
      fix:
        "C8 parses this file for `DEFAULT_LOCALE = <string>` and `SUPPORTED_LOCALES = [<string>, …]`. " +
        "Keep both as plain literals, or teach scripts/c8-i18n-parity.mjs the new shape.",
    },
  ]);
}

/* ── 1. The locale directories are exactly SUPPORTED_LOCALES ──────────────────────────── */

const directoriesOf = (dir) => {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // No translations/ at all — reported below as every locale being absent.
  }
  return entries.filter((entry) => statSync(path.join(dir, entry)).isDirectory()).sort();
};

const localeDirs = directoriesOf(TRANSLATIONS_DIR);
const supported = new Set(supportedLocales);

for (const locale of supportedLocales) {
  if (localeDirs.includes(locale)) continue;

  findings.push({
    file: relative(LOCALES_SOURCE),
    message: `SUPPORTED_LOCALES declares "${locale}", but translations/${locale}/ does not exist.`,
    fix:
      `Create translations/${locale}/ with one file per namespace, or drop "${locale}" from ` +
      "SUPPORTED_LOCALES. A locale the app offers and cannot render is worse than one it never offered.",
  });
}

// The reference locale has to be one of the locales it is the reference for. Left unchecked, a
// DEFAULT_LOCALE outside SUPPORTED_LOCALES makes assertions 2–4 compare every locale against a
// directory that is not there — which finds nothing, and reports a clean tree.
if (!supported.has(defaultLocale)) {
  findings.push({
    file: relative(LOCALES_SOURCE),
    message: `DEFAULT_LOCALE is "${defaultLocale}", which SUPPORTED_LOCALES does not contain.`,
    fix:
      `Add "${defaultLocale}" to SUPPORTED_LOCALES, or point DEFAULT_LOCALE at a locale that is in ` +
      "it. Every other assertion here is measured against the default, so it has to be a real locale.",
  });
}

for (const dir of localeDirs) {
  if (supported.has(dir)) continue;

  findings.push({
    file: `translations/${dir}/`,
    message: `translations/${dir}/ is not listed in SUPPORTED_LOCALES.`,
    fix:
      `Add "${dir}" to SUPPORTED_LOCALES in shared/translations.ts, or delete the directory. ` +
      "Copy nobody can reach still has to be kept in step by hand.",
  });
}

/* ── 2. Every locale carries the same namespace files ─────────────────────────────────── */

/**
 * The namespace files of one locale.
 *
 * Namespaces are flat by convention — one `.json` per namespace, directly under the locale — so
 * this does not recurse. A subdirectory is not a namespace and is deliberately not walked.
 */
const namespacesOf = (locale) => {
  let entries;
  try {
    entries = readdirSync(path.join(TRANSLATIONS_DIR, locale));
  } catch {
    // Absent or unreadable. Absent is already reported by assertion 1, and answering "every
    // namespace is missing" here would bury that one real finding under a list of its consequences.
    return [];
  }
  return entries.filter((entry) => entry.endsWith(".json")).sort();
};

// Only locales that are both declared and present can be compared. The rest are already reported
// above, and measuring against a directory that is not there produces noise, not information.
const comparable = supportedLocales.filter((locale) => localeDirs.includes(locale));

// Read each locale's directory once. The namespace list is consulted again per (namespace × locale)
// below, and re-reading it there would both cost a syscall per pair and leave two sources of truth
// for one list.
const namespacesByLocale = new Map(comparable.map((locale) => [locale, namespacesOf(locale)]));

const comparedLocales = comparable.filter((locale) => locale !== defaultLocale);
const referenceNamespaces = namespacesByLocale.get(defaultLocale) ?? [];

// Every remaining assertion is measured against the default locale's own files, so without them
// there is nothing left to say that the checks above have not already said.
//
// `findings` cannot be empty at this point — a missing default directory has already been reported
// either as a declared-but-absent locale, or as a DEFAULT_LOCALE outside SUPPORTED_LOCALES — so
// report() exits here rather than printing a tick and returning into the comparisons below.
if (!localeDirs.includes(defaultLocale)) report("C8 locales are in parity", findings);

for (const locale of comparedLocales) {
  const namespaces = namespacesByLocale.get(locale);

  for (const namespace of referenceNamespaces) {
    if (namespaces.includes(namespace)) continue;

    findings.push({
      file: `translations/${locale}/${namespace}`,
      message: `${defaultLocale}/${namespace} has no counterpart in "${locale}".`,
      fix:
        `Create translations/${locale}/${namespace} carrying the same keys, or delete ` +
        `translations/${defaultLocale}/${namespace} if the namespace is gone.`,
    });
  }

  for (const namespace of namespaces) {
    if (referenceNamespaces.includes(namespace)) continue;

    findings.push({
      file: `translations/${locale}/${namespace}`,
      message: `"${locale}" carries namespace ${namespace}, which "${defaultLocale}" does not.`,
      fix:
        `Add translations/${defaultLocale}/${namespace} — the default locale defines the key ` +
        "contract types.ts compiles — or delete this file.",
    });
  }
}

/* ── 3 + 4. Key paths, and the kind of value at each ──────────────────────────────────── */

const kindOf = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

/**
 * Every path in the tree — the objects as well as the leaves — mapped to its kind.
 *
 * Recording intermediate objects is what makes assertion 4 possible at all: a string that became
 * `{}` has no leaves left to compare, so a leaves-only flatten would stop seeing the key entirely
 * and report it as missing, describing the wrong defect. types.ts nests through `NestedKeyOf`, so
 * the comparison has to nest with it.
 *
 * Arrays are descended into for the same reason, and `Object.entries` already yields their indices
 * as keys — so a three-item `en` list against a one-item `fr` list is two missing `tips.1`/`tips.2`
 * paths rather than a matching pair of "array"s. Stopping at the array would let a component using
 * i18next's `returnObjects` render three bullets in English and one in French while C8 reported
 * parity, and `NestedKeyOf` descends there too: an array type satisfies its `extends object` test.
 */
const flatten = (value, prefix = "", out = new Map()) => {
  const kind = kindOf(value);
  if (kind !== "object" && kind !== "array") return out;

  for (const [key, child] of Object.entries(value)) {
    const dotPath = prefix ? `${prefix}.${key}` : key;
    out.set(dotPath, kindOf(child));
    flatten(child, dotPath, out);
  }

  return out;
};

const flattenNamespace = (locale, namespace) => {
  const file = `translations/${locale}/${namespace}`;
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(path.join(TRANSLATIONS_DIR, locale, namespace), "utf8"));
  } catch (error) {
    // Malformed JSON is a finding, not a crash: an uncaught throw here would bury every other
    // locale's result, and "this file cannot be parsed" is itself the thing worth reporting.
    findings.push({
      file,
      message: `Cannot be read as JSON: ${error.message}`,
      fix: "Fix the syntax. Until it parses, this namespace cannot be compared against the others.",
    });
    return null;
  }

  if (kindOf(parsed) !== "object") {
    findings.push({
      file,
      message: `The root of this file is ${kindOf(parsed)}, not an object of keys.`,
      fix: "A namespace file is a JSON object — i18next resolves keys against its properties.",
    });
    return null;
  }

  return flatten(parsed);
};

for (const namespace of referenceNamespaces) {
  const reference = flattenNamespace(defaultLocale, namespace);
  if (!reference) continue;

  for (const locale of comparedLocales) {
    // Assertion 2 already reported a namespace this locale does not carry.
    if (!namespacesByLocale.get(locale).includes(namespace)) continue;

    const paths = flattenNamespace(locale, namespace);
    if (!paths) continue;

    for (const [dotPath, kind] of reference) {
      if (!paths.has(dotPath)) {
        findings.push({
          file: `translations/${locale}/${namespace}`,
          message: `Missing key "${dotPath}", which "${defaultLocale}" defines.`,
          fix:
            `Add "${dotPath}" to translations/${locale}/${namespace}. Until then a "${locale}" ` +
            "user is shown the raw key where the words should be.",
        });
        continue;
      }

      // 4 — same name, different shape. A key-name comparison alone calls this a match.
      if (paths.get(dotPath) !== kind) {
        findings.push({
          file: `translations/${locale}/${namespace}`,
          message: `Key "${dotPath}" is ${kind} in "${defaultLocale}" but ${paths.get(dotPath)} in "${locale}".`,
          fix:
            `Make "${dotPath}" the same kind in both locales — ${kind}, as in "${defaultLocale}". ` +
            `types.ts derives this key's type from "${defaultLocale}" alone, so the shapes have to ` +
            "agree for that type to be true of both.",
        });
      }
    }

    for (const dotPath of paths.keys()) {
      if (reference.has(dotPath)) continue;

      findings.push({
        file: `translations/${locale}/${namespace}`,
        message: `Key "${dotPath}" is absent from "${defaultLocale}".`,
        fix:
          `Add "${dotPath}" to translations/${defaultLocale}/${namespace}, or remove it here. ` +
          `types.ts compiles its key union from "${defaultLocale}" only, so this key cannot be ` +
          "reached through the typed useTranslations API.",
      });
    }
  }
}

report("C8 locales are in parity", findings);
