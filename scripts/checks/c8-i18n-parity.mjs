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
 * two key sets stay identical — plural forms excepted, which §3.3 spells out and assertion 5
 * below enforces. This is the mechanism behind those sentences.
 *
 * Six assertions. 1–4 are measured against DEFAULT_LOCALE as the reference; 5 and 6 cannot be,
 * and say why below:
 *
 *   1. the locale directories are exactly SUPPORTED_LOCALES — no orphan directory, and no locale
 *      the constant promises but nobody wrote
 *   2. every locale carries the same namespace files
 *   3. every key path exists in every locale, reported in BOTH directions
 *   4. every shared path has the same KIND everywhere — a string in `en` that became an object in
 *      `fr` is a structural divergence that comparing key names alone reports as a match
 *   5. every plural family carries exactly the CLDR categories ITS OWN locale has — the one
 *      assertion measured per-locale rather than against the reference
 *   6. every call site naming a plural family passes a `count` — the one assertion that reads
 *      `src/` and `app/` rather than `translations/`
 *
 * Assertion 5 exists because 3 and 4 are actively wrong about plurals. `fr` needs a `_many` form
 * that `en` has no category for, so comparing key names literally reports every correctly
 * translated French plural as a divergence — and the obvious way to silence that is to delete
 * `_many`, which is the actual bug: i18next then finds no French form at 1000000, falls through to
 * fallbackLng and renders ENGLISH to a French user. Silently. That is the exact failure this
 * script exists to make impossible, so plural forms are compared as families
 * (`to_buy_x_items`) rather than as keys (`to_buy_x_items_one`), and each locale is held to its
 * own grammar instead of to English's.
 *
 * Assertion 6 reads source because nothing in `translations/` can answer it. i18next selects a
 * form from `options.count` and from nothing else, so `t(key, { n })` renders the key itself on
 * screen — and the JSON is innocent: a form is allowed to omit the number entirely ("One item to
 * buy" is better English than "1 item to buy"), so there is no string to inspect. The variable
 * name is only observable where it is written, which is why CONVENTIONS §3.3 can call it a rule.
 *
 * It says nothing about the translations themselves: whether "Confirmer" renders "Confirm" well is
 * not a property a script can hold an opinion about.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  declaredConstants,
  listFiles,
  lineOf,
  namespaceFiles,
  relative,
  report,
  ROOT,
  stringArray,
  stringLiteral,
  ts,
} from "./_lib.mjs";

const findings = [];

const LOCALES_SOURCE = path.join(ROOT, "shared/translations.ts");
const TRANSLATIONS_DIR = path.join(ROOT, "translations");

/* ── The locale constants, read from the source of truth ──────────────────────────────── */

/*
 * The constants come out of `shared/translations.ts` rather than being restated here, because a
 * copy is the very drift this check exists to catch — see `declaredConstants` in _lib.mjs, which
 * C12 reads the `shared/` vocabularies with for the same reason.
 */

// `parse()` reads the file straight off disk, so a moved or renamed shared/translations.ts throws
// an ENOENT stack trace — burying the fail-closed report written for exactly this situation.
if (!existsSync(LOCALES_SOURCE)) {
  report("C8 locale parity and the plural contract", [
    {
      file: relative(LOCALES_SOURCE),
      message: "Does not exist — C8 reads DEFAULT_LOCALE and SUPPORTED_LOCALES from this file.",
      fix: "Restore it, or point LOCALES_SOURCE in scripts/checks/c8-i18n-parity.mjs at its new home.",
    },
  ]);
}

const constants = declaredConstants(LOCALES_SOURCE);
const defaultLocale = stringLiteral(constants.get("DEFAULT_LOCALE"));
const supportedLocales = stringArray(constants.get("SUPPORTED_LOCALES"));

/**
 * Without either constant there is no reference to compare against, and carrying on would print a
 * green tick while asserting nothing — the one outcome worse than failing.
 */
if (!defaultLocale || !supportedLocales) {
  report("C8 locale parity and the plural contract", [
    {
      file: relative(LOCALES_SOURCE),
      message: `Could not read ${defaultLocale ? "SUPPORTED_LOCALES" : "DEFAULT_LOCALE"} as a literal.`,
      fix:
        "C8 parses this file for `DEFAULT_LOCALE = <string>` and `SUPPORTED_LOCALES = [<string>, …]`. " +
        "Keep both as plain literals, or teach scripts/checks/c8-i18n-parity.mjs the new shape.",
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
if (!localeDirs.includes(defaultLocale)) report("C8 locale parity and the plural contract", findings);

// The directory exists but holds no namespace file. Every assertion from here down iterates
// `referenceNamespaces`, so all of them would run zero times and the check would print a tick
// having compared nothing — the one outcome the comment above calls worse than failing.
if (referenceNamespaces.length === 0) {
  findings.push({
    file: `translations/${defaultLocale}/`,
    message: `The reference locale "${defaultLocale}" carries no namespace file.`,
    fix:
      `Add at least one <namespace>.json to translations/${defaultLocale}/. Everything C8 asserts ` +
      "is measured against this locale's files, so with none of them there is nothing to assert " +
      "and a green tick would mean only that the check found nothing to do.",
  });
}

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

/* ── 5. Plural families ───────────────────────────────────────────────────────────────── */

/**
 * The CLDR categories i18next appends to a key, one per plural form.
 *
 * A string leaf whose name ends in one of these IS a plural form — no cleverer detection, because
 * `translations/types.ts` strips exactly these suffixes to build the callable key union, and a
 * check that disagreed with the type would police keys the compiler never offers. One rule, stated
 * in both places: never end an ordinary key with a category name.
 *
 * @limitation i18next's ordinal plurals (`key_ordinal_one`) are not covered — nothing uses them,
 * and they draw their categories from a different Intl rule set than the cardinal one asserted
 * here.
 */
const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"];

/** `QuickAccess.to_buy_x_items_one` -> `{ base: "QuickAccess.to_buy_x_items", category: "one" }`. */
const asPluralForm = (dotPath) => {
  for (const category of PLURAL_CATEGORIES) {
    const suffix = `_${category}`;
    if (dotPath.endsWith(suffix) && dotPath.length > suffix.length) {
      return { base: dotPath.slice(0, -suffix.length), category };
    }
  }
  return null;
};

/** What this locale's grammar actually needs: `fr` has `many`, `en` does not. */
const categoriesOf = (locale) =>
  new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);

/**
 * Split a flattened namespace into the paths compared by name and the plural families compared by
 * base name, each family carrying the KIND of every form it declares.
 *
 * The kind travels with the form because a suffixed key is claimed as a plural form whatever it
 * holds. Routing only strings here would put `"to_buy_x_items_one": {}` into `scalars` while the
 * same key in the reference locale sat in `families` — and the cross-locale comparison below,
 * finding it in neither of its counterparts, would report "absent from en" about a key `en`
 * plainly defines, with a fix that says to delete it. Following that advice deletes correct copy.
 */
const partitionPlurals = (flat) => {
  const scalars = new Map();
  const families = new Map();

  for (const [dotPath, kind] of flat) {
    const form = asPluralForm(dotPath);

    if (!form) {
      scalars.set(dotPath, kind);
      continue;
    }

    if (!families.has(form.base)) families.set(form.base, new Map());
    families.get(form.base).set(form.category, kind);
  }

  return { scalars, families };
};

const categoryList = (categories) =>
  [...categories].sort().map((category) => `"_${category}"`).join(", ");

const keyList = (base, categories) =>
  [...categories].sort().map((category) => `"${base}_${category}"`).join(", ");

/** Namespace file -> the plural families the reference locale declares in it, for assertion 6. */
const familiesByFile = new Map();

for (const namespace of referenceNamespaces) {
  const referenceFlat = flattenNamespace(defaultLocale, namespace);
  if (!referenceFlat) continue;

  const reference = partitionPlurals(referenceFlat);
  const byLocale = new Map([[defaultLocale, reference]]);

  familiesByFile.set(namespace, new Set(reference.families.keys()));

  for (const locale of comparedLocales) {
    // Assertion 2 already reported a namespace this locale does not carry.
    if (!namespacesByLocale.get(locale).includes(namespace)) continue;

    const flat = flattenNamespace(locale, namespace);
    if (!flat) continue;

    byLocale.set(locale, partitionPlurals(flat));
  }

  // 5 — each locale against its OWN grammar, the reference locale included. An English `_many` is
  // a string no English count can select, and usually means someone padded the file to get past a
  // parity error rather than translating anything.
  for (const [locale, { families, scalars }] of byLocale) {
    const required = categoriesOf(locale);

    for (const [base, categories] of families) {
      // A base that is also a plain key is one name for two strings: `t(base)` reaches the plain
      // one and `t(base, { count })` reaches the family, and StripPlural collapses both onto a
      // single member of the key union, so neither the type nor the call site can tell them
      // apart. Reported before the category checks, which would otherwise describe a shape that
      // should not exist at all.
      if (scalars.has(base)) {
        findings.push({
          file: `translations/${locale}/${namespace}`,
          message: `"${base}" is both a plain key and the base of a plural family.`,
          fix:
            `Rename one of them. types.ts strips the category suffixes, so "${base}" and ` +
            `${keyList(base, categories.keys())} are one key at the call site — which of the two ` +
            "strings renders depends only on whether a count was passed.",
        });
        continue;
      }

      // Assertion 4 compares kinds across locales, but only for scalars — a suffixed key is a
      // plural form whatever it holds, so its kind has to be asserted here instead.
      const malformed = [...categories].filter(([, kind]) => kind !== "string");

      if (malformed.length) {
        findings.push({
          file: `translations/${locale}/${namespace}`,
          message: `Plural "${base}" has ${malformed.length === 1 ? "a form" : "forms"} that ${malformed.length === 1 ? "is" : "are"} not a string: ${malformed.map(([category, kind]) => `"_${category}" is ${kind}`).join(", ")}.`,
          fix:
            "Every form of a plural is the sentence i18next renders for one count, so each is a " +
            `string. Replace ${malformed.map(([category]) => `"${base}_${category}"`).join(", ")} ` +
            "with the copy for that category.",
        });
        continue;
      }

      const missing = [...required].filter((category) => !categories.has(category));
      const extra = [...categories.keys()].filter((category) => !required.has(category));

      if (missing.length) {
        findings.push({
          file: `translations/${locale}/${namespace}`,
          message: `Plural "${base}" is missing ${categoryList(missing)} — "${locale}" needs ${categoryList(required)}.`,
          fix:
            `Add ${keyList(base, missing)}. Without every category its locale has, i18next finds ` +
            "no form for the counts that select the missing one and falls back to " +
            `"${defaultLocale}" — the count renders, in the wrong language.`,
        });
      }

      if (extra.length) {
        findings.push({
          file: `translations/${locale}/${namespace}`,
          message: `Plural "${base}" carries ${categoryList(extra)}, which "${locale}" has no category for.`,
          fix:
            `Delete ${keyList(base, extra)} — "${locale}" selects only ${categoryList(required)}, ` +
            "so no count can ever render it. If it is there to satisfy another locale's key set, " +
            "that is what assertion 5 exists to make unnecessary.",
        });
      }
    }
  }

  for (const locale of comparedLocales) {
    const target = byLocale.get(locale);
    if (!target) continue;

    for (const [dotPath, kind] of reference.scalars) {
      if (!target.scalars.has(dotPath)) {
        // A plural family here and a plain key there is a real divergence, but "missing key" would
        // send the reader looking for a key that is, in a sense, right in front of them.
        findings.push(
          target.families.has(dotPath)
            ? {
                file: `translations/${locale}/${namespace}`,
                message: `"${dotPath}" is a plain string in "${defaultLocale}" but a plural in "${locale}".`,
                fix:
                  "Make it a plural in both or in neither. The call site passes a count or it does " +
                  `not, and it cannot do both — types.ts reads that decision from "${defaultLocale}".`,
              }
            : {
                file: `translations/${locale}/${namespace}`,
                message: `Missing key "${dotPath}", which "${defaultLocale}" defines.`,
                fix:
                  `Add "${dotPath}" to translations/${locale}/${namespace}. Until then a "${locale}" ` +
                  "user is shown the raw key where the words should be.",
              },
        );
        continue;
      }

      // 4 — same name, different shape. A key-name comparison alone calls this a match.
      if (target.scalars.get(dotPath) !== kind) {
        findings.push({
          file: `translations/${locale}/${namespace}`,
          message: `Key "${dotPath}" is ${kind} in "${defaultLocale}" but ${target.scalars.get(dotPath)} in "${locale}".`,
          fix:
            `Make "${dotPath}" the same kind in both locales — ${kind}, as in "${defaultLocale}". ` +
            `types.ts derives this key's type from "${defaultLocale}" alone, so the shapes have to ` +
            "agree for that type to be true of both.",
        });
      }
    }

    for (const dotPath of target.scalars.keys()) {
      if (reference.scalars.has(dotPath) || reference.families.has(dotPath)) continue;

      findings.push({
        file: `translations/${locale}/${namespace}`,
        message: `Key "${dotPath}" is absent from "${defaultLocale}".`,
        fix:
          `Add "${dotPath}" to translations/${defaultLocale}/${namespace}, or remove it here. ` +
          `types.ts compiles its key union from "${defaultLocale}" only, so this key cannot be ` +
          "reached through the typed useTranslations API.",
      });
    }

    // 3, for plurals: the FAMILY has to exist either side. Which categories it carries is
    // assertion 5's business, and is deliberately not compared across locales.
    for (const base of reference.families.keys()) {
      if (target.families.has(base)) continue;

      // Present as a plain key, so neither the scalar nor the family comparison above sees it
      // missing — and it is the more dangerous shape of the two, because the call site passes a
      // count that this locale alone will ignore.
      findings.push(
        target.scalars.has(base)
          ? {
              file: `translations/${locale}/${namespace}`,
              message: `"${base}" is a plural in "${defaultLocale}" but a plain string in "${locale}".`,
              fix:
                `Give "${locale}" the forms ${keyList(base, categoriesOf(locale))}, or drop the ` +
                "plural in both. The call site passes a count or it does not, and it cannot do " +
                `both — types.ts reads that decision from "${defaultLocale}".`,
            }
          : {
              file: `translations/${locale}/${namespace}`,
              message: `Missing plural "${base}", which "${defaultLocale}" defines.`,
              fix:
                `Add ${keyList(base, categoriesOf(locale))} to translations/${locale}/${namespace} — ` +
                `the categories "${locale}" needs, which are not necessarily the ones ` +
                `"${defaultLocale}" carries.`,
            },
      );
    }

    for (const base of target.families.keys()) {
      if (reference.families.has(base) || reference.scalars.has(base)) continue;

      findings.push({
        file: `translations/${locale}/${namespace}`,
        message: `Plural "${base}" is absent from "${defaultLocale}".`,
        fix:
          `Add it to translations/${defaultLocale}/${namespace} with the categories ` +
          `"${defaultLocale}" needs, or remove it here. types.ts compiles its key union from ` +
          `"${defaultLocale}" only, so this key cannot be reached through the typed API.`,
      });
    }
  }
}

/* ── 6. Plural call sites pass a count ─────────────────────────────────────────────────── */

const TYPES_SOURCE = path.join(TRANSLATIONS_DIR, "types.ts");

/**
 * `parse()` in _lib reads every file as ScriptKind.TS, which turns the first `<View>` of a .tsx
 * file into a malformed type assertion and loses the tree below it. Call sites live inside JSX,
 * so this one picks the kind from the extension.
 */
const parseSource = (file) =>
  ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

/** Where a module may resolve a key. `src/ui/**` never does — ADR 0002 — but is cheap to walk. */
const SOURCE_ROOTS = ["src", "app"];

if (existsSync(TYPES_SOURCE)) {
  // Every plural family, spelled the way a call site spells it: `Namespace.base`.
  const pluralKeys = new Set();

  for (const [namespace, file] of namespaceFiles(TYPES_SOURCE)) {
    for (const base of familiesByFile.get(file) ?? []) pluralKeys.add(`${namespace}.${base}`);
  }

  const sources = pluralKeys.size
    ? SOURCE_ROOTS.flatMap((root) =>
        [".ts", ".tsx"].flatMap((ext) => listFiles(path.join(ROOT, root), ext)),
      )
    : [];

  for (const file of sources) {
    const source = parseSource(file);

    // Two passes: a component declares `const t = useTranslations(…)` before it calls `t`, but
    // nothing guarantees that, and a single walk would silently skip the calls that came first.
    const namespaceOf = new Map();

    const collect = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === "useTranslations"
      ) {
        const [namespaceArg] = node.initializer.arguments;
        if (namespaceArg && ts.isStringLiteral(namespaceArg)) {
          namespaceOf.set(node.name.text, namespaceArg.text);
        }
      }

      ts.forEachChild(node, collect);
    };

    const check = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        namespaceOf.has(node.expression.text)
      ) {
        const [keyArg, optionsArg] = node.arguments;

        // A key assembled at runtime cannot be resolved here. Rare, and reporting it as a
        // violation would punish the shape rather than a defect — the type still constrains it.
        if (keyArg && ts.isStringLiteral(keyArg)) {
          const fullKey = `${namespaceOf.get(node.expression.text)}.${keyArg.text}`;

          // Options passed as anything but a literal — a spread, a variable — cannot be read
          // without type information this parse does not have. Left alone deliberately.
          const readable = !optionsArg || ts.isObjectLiteralExpression(optionsArg);

          const passesCount =
            optionsArg &&
            ts.isObjectLiteralExpression(optionsArg) &&
            optionsArg.properties.some(
              (property) => property.name && property.name.getText(source) === "count",
            );

          if (pluralKeys.has(fullKey) && readable && !passesCount) {
            findings.push({
              file: relative(file),
              line: lineOf(source, node),
              message: `"${fullKey}" is a plural, but this call passes no \`count\`.`,
              fix:
                "Pass `{ count }`. i18next picks the form from that property and from nothing " +
                `else, so without it there is no form to pick and "${fullKey}" renders on ` +
                "screen as its own key — see CONVENTIONS §3.3 (Plurals).",
            });
          }
        }
      }

      ts.forEachChild(node, check);
    };

    collect(source);
    check(source);
  }
}

report("C8 locale parity and the plural contract", findings);
