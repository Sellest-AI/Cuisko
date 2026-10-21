/**
 * The allergen vocabulary — the fourteen substances EU regulation 1169/2011 requires to be
 * declared on food sold in the union.
 *
 * Someone else's list on purpose. An allergen vocabulary invented here would be exactly as long as
 * the tags that happen to read it — four, today — and would need a data migration the first time
 * anyone wanted `sesame-free`. The regulated fourteen are already the list every label the shopper
 * reads is written against, so the catalog and the packet agree.
 *
 * Only four are read by a tag today (`gluten`, `milk`, `nuts`, `peanuts` — see `allergenTagsOf` in
 * [`tags.ts`](./tags.ts)). The other ten are carried because recording a fact is cheap and
 * back-filling one across every catalog row is not.
 *
 * ⚠️ Like [`DIETS`](./diets.ts), every use of this is a claim of ABSENCE. An ingredient with no
 * allergens listed is only free of them if something actually looked; a row nothing has classified
 * is UNKNOWN, and callers must refuse to answer rather than answer "free of". `computeTags` does
 * this by requiring every line to come from the seed catalog.
 */
export const ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soybeans",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export const isAllergen = (value: string): value is Allergen =>
  ALLERGENS.some((allergen) => allergen === value);

/**
 * The canonical order — `ALLERGENS`' own — applied to any set of them.
 *
 * Stored as a `v.array`, an allergen list is whatever order it was built in, and two rows carrying
 * the same fourteen-subset can differ as arrays. Sorting on the way in makes the column comparable
 * with `===` on its serialized form, keeps a diff of two seeds readable, and stops a chip row from
 * reshuffling itself between renders.
 */
export const sortAllergens = (allergens: readonly Allergen[]): Allergen[] =>
  [...new Set(allergens)].sort((a, b) => ALLERGENS.indexOf(a) - ALLERGENS.indexOf(b));

/** The separator every serialized allergen list uses. Not a comma: OFF tag strings contain those. */
const SEPARATOR = " ";

/**
 * An allergen list as one string — for the places that can only hold a string.
 *
 * The stored column is a real `v.array` and needs none of this: Convex validates and returns it as
 * `Allergen[]`, so nothing round-trips through text to be saved or read. This pair exists for the
 * boundaries that are genuinely stringly and are all arriving at once — a search blob (a Convex
 * `searchIndex` takes exactly one string field), a URL filter parameter, and above all an external
 * classifier: OpenFoodFacts answers in `en:` tags and an LLM answers in prose.
 *
 * It is one pair in one file for the reason `foldAccents` is: the parse that reads a value and the
 * serialize that writes it have to be the same two functions, or a value written by the importer
 * stops matching the one the filter looks for, and nothing fails — the row is simply never found.
 */
export const serializeAllergens = (allergens: readonly Allergen[]): string =>
  sortAllergens(allergens).join(SEPARATOR);

/**
 * Every allergen named in `value`, and silently nothing for the words that name none.
 *
 * Lenient by design, because the callers are external. It splits on any whitespace, comma or
 * semicolon, lowercases, and strips a leading language prefix so OpenFoodFacts' `en:milk` and
 * `fr:lait`-shaped tags reduce to the same token as a bare `milk`. What survives that and is in the
 * vocabulary is kept; everything else is dropped.
 *
 * ⚠️ **Dropping is why this must never be the only classifier.** An input naming an allergen in a
 * spelling this does not recognise yields a SHORTER list, and a shorter list is what earns a
 * free-from tag. A caller feeding this untrusted text has to decide separately whether the source
 * was understood at all — and to leave `ingredients.allergens` undefined when it was not, rather
 * than storing the `[]` this returns. See `allergens` in convex/schema/ingredients.ts.
 */
export const parseAllergens = (value: string | null | undefined): Allergen[] => {
  if (!value) return [];

  const tokens = value
    .toLowerCase()
    .split(/[\s,;]+/)
    // "en:milk" and "fr:lait" — the language prefix is not part of the name.
    .map((token) => token.slice(token.lastIndexOf(":") + 1).trim())
    .filter(isAllergen);

  return sortAllergens(tokens);
};
