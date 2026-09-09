/**
 * Prunes the two shipped ingredient datasets and writes them into
 * `convex/functions/ingredients/lookup/data/`. Run by hand; **the output is committed**.
 *
 *     node scripts/build-ingredient-data.mjs
 *
 * Committed rather than fetched at deploy time for two reasons. A deploy that reaches out to
 * somebody else's CDN can fail for reasons that have nothing to do with the change being deployed.
 * And the dataset moving under us should be a diff a person reviews — these numbers end up on a
 * Nutri-Score a shopper reads.
 *
 * ## What comes from where
 *
 * **Names** — the Open Food Facts *ingredients taxonomy*, which maps one canonical food to its
 * name and synonyms in ~190 languages. That is the wrong-language fix: a shopper typing "carrot"
 * on a French device reaches `en:carrot`, whose French name is "carotte", which the catalog holds.
 * Pruned to `en`/`fr`, which are the locales this app has.
 *
 * **Nutrition** — CIQUAL 2020 (ANSES), the French reference composition table, joined to the
 * taxonomy by the `ciqual_food_code` the taxonomy already carries. Pruned to the nine fields
 * `schema/ingredients.ts` declares, out of the 67 CIQUAL publishes.
 *
 * ⚠️ **CIQUAL is read from the Open Food Facts mirror, not from ANSES.** ANSES publishes it as a
 * legacy `.xls` binary, which would cost this script a spreadsheet parser as a dependency; OFF
 * mirrors the same 2020 release as tab-separated text. The authoritative source and its licence
 * (Licence Ouverte / Open Licence) are ANSES's — `https://ciqual.anses.fr`. If the mirror ever
 * disappears, the fix is an `.xls` parser here, not a different dataset.
 *
 * ## Output shape
 *
 * `.ts` files exporting a typed const, not `.json`. Three reasons, in order of weight: no
 * `resolveJsonModule` in either tsconfig and no bundler question at deploy time; the entries are
 * typed at the boundary rather than cast after a parse; and one entry per line is a diff somebody
 * can actually review when the upstream dataset moves.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The repo root, derived from this file rather than from `cwd` — the generator writes into
 * `convex/`, and a run started from anywhere but the root would otherwise scatter output.
 *
 * Computed here rather than imported from `checks/_lib.mjs`: that library is the checks'
 * interior, and this is a hand-run tool that happens to need one line of it.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TAXONOMY_URL = "https://static.openfoodfacts.org/data/taxonomies/ingredients.full.json";

const CIQUAL_URL =
  "https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/external-data/ciqual/ciqual/CIQUAL2020_FR_2020_07_07.csv";

const OUT = path.join(ROOT, "convex", "functions", "ingredients", "lookup", "data");

/** The locales this app has. Adding a third is an edit here and a re-run. */
const LOCALES = ["en", "fr"];

/**
 * The CIQUAL columns the REQUIRED fields of `nutrition` are read from, by header name rather than by
 * position — the release adds columns between versions and a position silently reads the wrong
 * nutrient.
 *
 * ⚠️ **CIQUAL 2020 publishes no energy at all for 176 of the foods we reach**, raw vegetables
 * mostly: raw onion and raw lettuce have `-` in both the EU 1169/2011 column and the Jones-factor
 * one. There is no fallback to reach for — the other energy column is blank on exactly the same
 * rows — and deriving kcal from the macros with Atwater factors would be a calculation wearing a
 * measurement's `source`. Those foods are dropped here and answered by step 3, which is the reason
 * the resolver has one.
 */
const NUTRIENT_COLUMNS = {
  calories: "Energie, Règlement UE N° 1169/2011 (kcal/100 g)",
  protein: "Protéines, N x facteur de Jones (g/100 g)",
  fat: "Lipides (g/100 g)",
  saturatedFat: "AG saturés (g/100 g)",
  carbohydrates: "Glucides (g/100 g)",
  sugars: "Sucres (g/100 g)",
  fiber: "Fibres alimentaires (g/100 g)",
  sodium: "Sodium (mg/100 g)",
};

/**
 * Nutrients written when CIQUAL measured them and left off the row when it did not.
 *
 * The all-or-none rule below is right for the eight above — every one of them feeds either a macro
 * a screen shows or a Nutri-Score input, so a hole in any of them makes the row unusable. It would
 * be the wrong rule here. CIQUAL leaves iron unmeasured on 27 of the 491 foods the taxonomy
 * reaches, and demanding it would drop those foods entirely: they would lose their macros, their
 * grade and every nutrition tag they currently earn, to gain one mineral. Absent is "unknown" on
 * exactly one field instead, which `IngredientFacts` types as optional and `sumOptional` refuses a
 * total for — so `iron-rich` is withheld rather than guessed, and nothing else is affected.
 */
const OPTIONAL_NUTRIENT_COLUMNS = {
  iron: "Fer (mg/100 g)",
};

const fetchText = async (url) => {
  const response = await fetch(url, { headers: { "User-Agent": "Cuisko/1.0 (build script)" } });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);

  return response.text();
};

/**
 * One CIQUAL cell as a number, or `undefined` when the table does not answer.
 *
 * The four shapes a cell takes, and what each means:
 *
 * - `"12,4"` — a measurement. French decimal comma, sometimes with a thin space as a thousands
 *   separator.
 * - `"traces"` — measured, present below any meaningful amount. Zero.
 * - `"< 0,5"` — measured, below the method's limit of quantification. Also zero: the true value is
 *   somewhere in `[0, 0.5)`, and taking the bound would overstate every such field at once.
 * - `"-"` or empty — **not measured**. Not zero, and the caller must drop the food rather than
 *   write a zero we cannot stand behind. This distinction is the whole reason this returns
 *   `undefined` instead of defaulting.
 */
const cellValue = (raw) => {
  const value = (raw ?? "").replace(/ /g, " ").trim();
  if (!value || value === "-") return undefined;
  if (value === "traces") return 0;

  const parsed = Number(value.replace(/^</, "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(parsed)) return undefined;

  return value.startsWith("<") ? 0 : Math.round(parsed * 100) / 100;
};

const buildTaxonomy = (taxonomy) => {
  const entries = [];

  for (const [key, entry] of Object.entries(taxonomy)) {
    const names = {};
    const synonyms = {};

    for (const locale of LOCALES) {
      if (entry.name?.[locale]) names[locale] = entry.name[locale];
      // The canonical name repeats as its own first synonym upstream; dropping it here keeps the
      // committed file from storing every name twice.
      const listed = (entry.synonyms?.[locale] ?? []).filter((it) => it !== entry.name?.[locale]);
      if (listed.length) synonyms[locale] = listed;
    }

    // A food we can neither name nor recognise in either of our locales is unreachable: nothing a
    // shopper types could match it, and it would only cost bundle size.
    if (!Object.keys(names).length && !Object.keys(synonyms).length) continue;

    const code = entry.ciqual_food_code?.en ?? entry.ciqual_proxy_food_code?.en;

    entries.push({ key, names, synonyms, ...(code ? { ciqualCode: String(code) } : {}) });
  }

  return entries;
};

const buildComposition = (csv, codes) => {
  const [header, ...rows] = csv.split(/\r?\n/).filter(Boolean);
  const columns = header.split("\t");

  const indexOf = (name) => {
    const index = columns.indexOf(name);
    if (index === -1) throw new Error(`CIQUAL column not found: "${name}" — the release moved.`);

    return index;
  };

  const codeIndex = indexOf("alim_code");
  const nutrientIndexes = Object.entries(NUTRIENT_COLUMNS).map(([field, name]) => [
    field,
    indexOf(name),
  ]);
  const optionalIndexes = Object.entries(OPTIONAL_NUTRIENT_COLUMNS).map(([field, name]) => [
    field,
    indexOf(name),
  ]);

  const composition = {};
  let incomplete = 0;
  const unmeasuredOptional = {};

  for (const row of rows) {
    const cells = row.split("\t");
    const code = cells[codeIndex];
    if (!codes.has(code)) continue;

    const facts = {};
    for (const [field, index] of nutrientIndexes) facts[field] = cellValue(cells[index]);

    // All eight or none. A partial row would be written with a hole, and `nutrition` is required
    // precisely so that no screen has to draw one.
    if (Object.values(facts).some((value) => value === undefined)) {
      incomplete += 1;
      continue;
    }

    // The optional ones are appended only when measured — the food is kept either way, and an
    // absent key is what tells the tag layer "unknown" rather than "none". See the note above.
    for (const [field, index] of optionalIndexes) {
      const value = cellValue(cells[index]);

      if (value === undefined) unmeasuredOptional[field] = (unmeasuredOptional[field] ?? 0) + 1;
      else facts[field] = value;
    }

    composition[code] = facts;
  }

  return { composition, incomplete, unmeasuredOptional };
};

const HEADER = (source) => `/**
 * GENERATED by scripts/build-ingredient-data.mjs — do not edit by hand.
 * Source: ${source}
 */`;

const taxonomyFile = (entries) =>
  `${HEADER(TAXONOMY_URL)}
import type { TaxonomyEntry } from "../taxonomy";

export const TAXONOMY: readonly TaxonomyEntry[] = [
${entries.map((entry) => `  ${JSON.stringify(entry)},`).join("\n")}
];
`;

const compositionFile = (composition) =>
  `${HEADER(`${CIQUAL_URL} (CIQUAL 2020, ANSES — Licence Ouverte)`)}
import type { IngredientNutrition } from "@shared/nutrition";

export const COMPOSITION: Readonly<Record<string, IngredientNutrition>> = {
${Object.entries(composition)
  .map(([code, facts]) => `  "${code}": ${JSON.stringify(facts)},`)
  .join("\n")}
};
`;

const main = async () => {
  const [taxonomyJson, ciqualCsv] = await Promise.all([
    fetchText(TAXONOMY_URL).then(JSON.parse),
    fetchText(CIQUAL_URL),
  ]);

  const entries = buildTaxonomy(taxonomyJson);
  const codes = new Set(entries.map((entry) => entry.ciqualCode).filter(Boolean));
  const { composition, incomplete, unmeasuredOptional } = buildComposition(ciqualCsv, codes);

  const files = [
    ["taxonomy.ts", taxonomyFile(entries)],
    ["composition.ts", compositionFile(composition)],
  ];

  for (const [name, contents] of files) {
    writeFileSync(path.join(OUT, name), contents, "utf8");
    console.log(`${name.padEnd(16)} ${(contents.length / 1024).toFixed(0)} KB`);
  }

  const kept = Object.keys(composition).length;

  console.log(
    `\ntaxonomy     ${entries.length} foods, ${codes.size} carrying a CIQUAL code\n` +
      `composition  ${kept} kept, ${incomplete} dropped for an unmeasured required field\n` +
      Object.entries(OPTIONAL_NUTRIENT_COLUMNS)
        .map(([field]) => {
          const missing = unmeasuredOptional[field] ?? 0;

          return `  ${field.padEnd(11)}${kept - missing}/${kept} measured, ${missing} left absent`;
        })
        .join("\n"),
  );
};

await main();
