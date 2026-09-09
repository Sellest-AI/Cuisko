/**
 * C12 — every entry of every shared vocabulary has a word in every locale.
 *
 * The `shared/` vocabularies are closed lists that the whole app is written against: a recipe's
 * `tags`, a household's `equipments`, a member's `diet` and `avoids`. They are drawn as chips and
 * tiles, so each entry needs two things beside it — a glyph and a word per locale.
 *
 * The glyph is already the compiler's problem: `src/lib/vocabulary.ts` types each map as a total
 * `Record<Tag, string>`, so an entry with no glyph does not build. The word is nobody's. JSON has
 * no type, `types.ts` derives its key union FROM the locale file rather than against the
 * vocabulary, and C8 only proves the locales agree WITH EACH OTHER — so a tag added to
 * `shared/tags.ts` and to neither locale file passes typecheck, lint, C8 and the tests, and
 * surfaces once, as the raw string `Vocabulary.Tags.high-calorie` rendered where a word should be.
 * In both languages, identically, which is what makes it easy to miss in review.
 *
 * This is the mechanism behind the plan's promise that adding an entry to a shared vocabulary
 * fails `pnpm verify` until its glyph and both translations exist. C12 owns the second half.
 *
 * Five assertions, per vocabulary and per locale:
 *
 *   1. the namespace is registered and its locale file exists and parses
 *   2. every vocabulary entry has a key in the block
 *   3. every key is a non-empty string — an entry present with `""` renders as nothing at all,
 *      which is the same blank the check exists to prevent
 *   4. no key survives an entry's removal from the vocabulary, which would otherwise leave dead
 *      copy that translators keep maintaining
 *   5. no block in the file is unclaimed by `VOCABULARIES` — assertions 2–4 iterate the REGISTERED
 *      vocabularies, so without this a whole block is checked by nobody and looks identical to one
 *      that passes. That is not hypothetical: this check shipped covering four of the six shared
 *      vocabularies, and nothing said so.
 *
 * ⚠️ **It fails closed everywhere it cannot read something.** A vocabulary whose constant it
 * cannot parse, a namespace nobody registered, a block that is not an object — each is a finding
 * rather than a skip, because the failure mode of the alternative is a green tick asserting
 * nothing over exactly the entries it could not see.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  declaredConstants,
  namespaceFiles,
  relative,
  report,
  ROOT,
  stringArray,
  stringLiteral,
  ts,
} from "./_lib.mjs";

const CHECK = "C12 shared vocabularies are fully translated";

const findings = [];

const LOCALES_SOURCE = path.join(ROOT, "shared/translations.ts");
const TRANSLATIONS_DIR = path.join(ROOT, "translations");
const TYPES_SOURCE = path.join(TRANSLATIONS_DIR, "types.ts");

/** The namespace that holds the words for the shared vocabularies, as `types.ts` names it. */
const NAMESPACE = "Vocabulary";

/**
 * Which `shared/` list each block of the namespace is the words for.
 *
 * The one hand-written mapping in this check, and it cannot be derived: nothing in either file
 * says that `Vocabulary.Equipments` is about `EQUIPMENTS`. Adding a vocabulary means adding a row
 * here — and assertion 5 is what stops that being a step somebody can forget, by rejecting any
 * block in the locale file that no row claims.
 */
const VOCABULARIES = [
  { block: "Equipments", source: "shared/equipments.ts", constant: "EQUIPMENTS" },
  { block: "Tags", source: "shared/tags.ts", constant: "TAGS" },
  { block: "Diets", source: "shared/diets.ts", constant: "DIETS" },
  { block: "Allergens", source: "shared/allergens.ts", constant: "ALLERGENS" },
  { block: "Cuisines", source: "shared/cuisines.ts", constant: "CUISINES" },
  { block: "Categories", source: "shared/categories.ts", constant: "CATEGORIES" },
];

/* ── The vocabularies, read from the source of truth ──────────────────────────────────── */

/**
 * A vocabulary's values, following one level of spread into other constants in the same file.
 *
 * `TAGS` is `[...COMPUTED_TAGS, ...AUTHORED_TAGS]`, and reading it as a flat array literal would
 * come back empty — which a check that skipped what it could not read would report as a
 * fully-translated vocabulary of zero entries.
 */
const valuesOf = (constants, node) => {
  const literal = stringArray(node);
  if (literal) return literal;

  const inner = node && ts.isAsExpression(node) ? node.expression : node;
  if (!inner || !ts.isArrayLiteralExpression(inner)) return null;

  const values = [];

  for (const element of inner.elements) {
    if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)) {
      const spread = stringArray(constants.get(element.expression.text));
      if (!spread) return null;
      values.push(...spread);
      continue;
    }

    const value = stringLiteral(element);
    if (value === null) return null;
    values.push(value);
  }

  return values;
};

const vocabularyEntries = () => {
  const out = new Map();

  for (const { block, source, constant } of VOCABULARIES) {
    const file = path.join(ROOT, source);

    if (!existsSync(file)) {
      findings.push({
        file: source,
        message: `Does not exist — C12 reads ${constant} from this file for Vocabulary.${block}.`,
        fix: `Restore it, or point the ${block} row of VOCABULARIES in scripts/checks/c12-vocabulary-coverage.mjs at its new home.`,
      });
      continue;
    }

    const constants = declaredConstants(file);
    const values = valuesOf(constants, constants.get(constant));

    if (!values || values.length === 0) {
      findings.push({
        file: source,
        message: `Could not read ${constant} as a list of string literals.`,
        fix:
          `C12 reads \`${constant} = [<string>, …] as const\`, following one level of spread into ` +
          "other constants in the same file. Keep it in that shape, or teach " +
          "scripts/checks/c12-vocabulary-coverage.mjs the new one.",
      });
      continue;
    }

    out.set(block, values);
  }

  return out;
};

/* ── The locales, and the file the namespace is bound to ──────────────────────────────── */

if (!existsSync(LOCALES_SOURCE)) {
  report(CHECK, [
    {
      file: relative(LOCALES_SOURCE),
      message: "Does not exist — C12 reads SUPPORTED_LOCALES from this file.",
      fix: "Restore it, or point LOCALES_SOURCE in scripts/checks/c12-vocabulary-coverage.mjs at its new home.",
    },
  ]);
}

const supportedLocales = stringArray(declaredConstants(LOCALES_SOURCE).get("SUPPORTED_LOCALES"));

if (!supportedLocales || supportedLocales.length === 0) {
  report(CHECK, [
    {
      file: relative(LOCALES_SOURCE),
      message: "Could not read SUPPORTED_LOCALES as a list of string literals.",
      fix: "Keep it a plain array of literals, or teach scripts/checks/c12-vocabulary-coverage.mjs the new shape.",
    },
  ]);
}

if (!existsSync(TYPES_SOURCE)) {
  report(CHECK, [
    {
      file: relative(TYPES_SOURCE),
      message: `Does not exist — C12 reads which file the ${NAMESPACE} namespace is bound to from it.`,
      fix: "Restore it, or point TYPES_SOURCE in scripts/checks/c12-vocabulary-coverage.mjs at its new home.",
    },
  ]);
}

const namespaceFile = namespaceFiles(TYPES_SOURCE).get(NAMESPACE);

/**
 * A namespace nobody registered has no typed keys at all, so every call site would be reaching for
 * words through an untyped path — reported here rather than left to C8, which compares the locales
 * that exist and has nothing to say about a namespace that does not.
 */
if (!namespaceFile) {
  report(CHECK, [
    {
      file: relative(TYPES_SOURCE),
      message: `No ${NAMESPACE} namespace is registered in TranslationResources.`,
      fix:
        `Import the locale file and add \`${NAMESPACE}: typeof <binding>\` to TranslationResources ` +
        `— the shared vocabularies' words are unreachable through useTranslations("${NAMESPACE}") without it.`,
    },
  ]);
}

/* ── 1–4. Every entry, in every locale ────────────────────────────────────────────────── */

const entries = vocabularyEntries();

for (const locale of supportedLocales) {
  const relativeFile = `translations/${locale}/${namespaceFile}`;
  const file = path.join(TRANSLATIONS_DIR, locale, namespaceFile);
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    // A missing or malformed file is a finding rather than a crash: an uncaught throw here would
    // bury every other locale's result, and "this file cannot be read" is itself the finding.
    findings.push({
      file: relativeFile,
      message: `Could not be read as JSON — ${error.message}.`,
      fix: `Create it with a block per shared vocabulary (${VOCABULARIES.map(({ block }) => block).join(", ")}).`,
    });
    continue;
  }

  for (const [block, values] of entries) {
    const words = parsed[block];

    if (words === undefined || words === null || typeof words !== "object" || Array.isArray(words)) {
      findings.push({
        file: relativeFile,
        message: `Has no "${block}" object — the words for every entry of that vocabulary live there.`,
        fix: `Add "${block}": { … } with a key per entry, matching the other locales.`,
      });
      continue;
    }

    for (const value of values) {
      const word = words[value];

      if (word === undefined) {
        findings.push({
          file: relativeFile,
          message: `"${block}.${value}" is missing — the vocabulary carries it and this locale has no word for it.`,
          fix: `Add "${value}": "…" to "${block}", or remove the entry from the shared vocabulary.`,
        });
        continue;
      }

      if (typeof word !== "string" || word.trim() === "") {
        findings.push({
          file: relativeFile,
          message: `"${block}.${value}" is empty — it renders as a chip with no word on it.`,
          fix: `Give it the word this locale uses for "${value}".`,
        });
      }
    }

    const vocabulary = new Set(values);

    for (const key of Object.keys(words)) {
      if (vocabulary.has(key)) continue;

      findings.push({
        file: relativeFile,
        message: `"${block}.${key}" is not in the vocabulary — nothing can render it.`,
        fix: `Remove it, or add "${key}" back to the shared list if it was dropped by mistake.`,
      });
    }
  }

  /* ── 5. Nothing in the file is checked by nobody ────────────────────────────────────── */

  for (const block of Object.keys(parsed)) {
    if (VOCABULARIES.some((vocabulary) => vocabulary.block === block)) continue;

    findings.push({
      file: relativeFile,
      message: `"${block}" is not claimed by any row of VOCABULARIES, so nothing checks it.`,
      fix:
        `Add a row naming the shared list "${block}" holds the words for to VOCABULARIES in ` +
        "scripts/checks/c12-vocabulary-coverage.mjs, or move the block to a namespace of its own — " +
        "this file is for vocabularies declared in shared/.",
    });
  }
}

report(CHECK, findings);
