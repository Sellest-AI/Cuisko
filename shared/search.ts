import { foldAccents, SUPPORTED_LOCALES, type Locale } from "./translations";

/**
 * The separator every derived search blob uses.
 *
 * A space, because Convex tokenizes the indexed field with Tantivy's `SimpleTokenizer`, which
 * splits on whitespace AND punctuation. Any other separator would either be split anyway or, worse,
 * be glued to the term beside it.
 */
const SEPARATOR = " ";

/**
 * How the search index will split whatever is stored: on every run of characters that is neither a
 * letter nor a digit.
 *
 * This mirrors `SimpleTokenizer`, and mirroring it is the point. A serializer that stores units the
 * index does not store cannot de-duplicate against itself — "huile d'olive" and the terms "huile"
 * and "olive" are three different strings to a `Set` and the same two tokens to the index.
 */
const TOKEN_BOUNDARY = /[^\p{L}\p{N}]+/u;

/**
 * The tokens of one term, as the index will see them.
 *
 * **Lowercased** because the index lowercases too. It changes no match — it makes the de-duplication
 * real, so "Crème" written by the model and "crème" from the catalog collapse to one token.
 *
 * **Single characters dropped**, which is the `elision` filter every French analyzer ships: split
 * "huile d'olive" on punctuation and the `d` falls out as its own token, shared by thousands of
 * rows and searched for by nobody. Storing it costs field length — BM25 divides by it — and buys no
 * reachable query, since the same tokenizer strips it out of what the shopper types.
 */
const tokensOf = (term: string): string[] =>
  term
    .toLowerCase()
    .split(TOKEN_BOUNDARY)
    .filter((token) => token.length > 1);

/**
 * The one function that builds a string a `searchIndex` reads. Governed by ADR 0011.
 *
 * Every searchable blob in the schema goes through here — the ingredient catalog's name-and-alias
 * string, the recipe's ingredient string, and whatever comes next. Not for tidiness: the blob is
 * DERIVED, so it is correct only while every writer produces the same shape from the same input.
 * The moment one call site builds its own, that row is indexed under a spelling the reader never
 * searches for, and there is no symptom — the row is simply never found.
 *
 * **What it does, and why each part is load-bearing:**
 *
 * - **Accent-folded copies are added, never substituted.** Both "crème" and "creme" end up in the
 *   index, because the shopper types on a phone keyboard in a supermarket and will not stop to
 *   long-press a vowel. Storing only the folded form would break the correctly-spelled query.
 * - **Split into tokens first**, by `tokensOf`, so a caller may hand over a phrase, a single word or
 *   a whole blob this function wrote and get the same units out. Everything below operates on
 *   tokens, which is what makes it operate on what the index actually stores.
 * - **De-duplicated**, so an already-unaccented term is not stored twice. The index gains nothing
 *   from the repeat, and BM25 scores on term frequency — a doubled term is a silent ranking thumb
 *   on the scale. De-duplicating phrases rather than tokens would not do it: "huile d'olive" beside
 *   "huile" is two distinct strings and one repeated token.
 * - **Empty terms dropped**, so a missing name cannot contribute a bare separator.
 *
 * ⚠️ **Hyphens and punctuation split.** `SimpleTokenizer` turns `gluten-free` into the two terms
 * `gluten` and `free`, and `free` is then shared with `nut-free` and `dairy-free` — three different
 * facets colliding on one meaningless high-frequency token. So a CLOSED VOCABULARY never belongs in
 * a blob: it belongs in a `filterField`, where matching is exact. This function is for words a
 * person types, and for nothing else.
 */
export const searchTextOf = (terms: readonly string[]): string => {
  const tokens = terms.flatMap(tokensOf);

  // The same fold the navigation bar applies to what the shopper types. It has to be the same one:
  // this writes the string the search index matches, and that one scores against it.
  const folded = tokens.map(foldAccents);

  return [...new Set([...tokens, ...folded])].join(SEPARATOR);
};

/**
 * The same blob for every locale at once — the shape a table's per-locale `searchField` column
 * actually stores.
 *
 * Here rather than at the call site for two reasons, and the second is the one that matters.
 *
 * A blob assembled key by key is a blob that can be assembled for SOME keys: a row indexed in
 * French and not English is invisible to an English shopper, who then has a duplicate created for
 * them — which is the failure the ingredient resolver exists to prevent, arriving through the
 * indexing door instead. Driving the keys off `SUPPORTED_LOCALES` makes "every locale" hold by
 * construction, and makes a locale added to that list a compile error in every caller.
 *
 * And it keeps C11 able to see what it is checking. The check trusts a VALUE produced by a
 * sanctioned builder; a blob accumulated into an empty object over a loop is untraceable, and C11
 * distrusts it for the good reason that an empty object literal claims to be a blob and is not
 * one. A single call it can follow is worth more than a loop it has to be taught to allow.
 *
 * Composing one blob out of ANOTHER needs no function at all: a blob is tokens joined by
 * `SEPARATOR`, and `tokensOf` splits on exactly that, so a whole blob handed back in yields its own
 * tokens de-duplicated against everything beside them. `recipeSearchText` builds a recipe's blob
 * out of its ingredients' that way.
 */
export const searchTextByLocale = (
  termsOf: (locale: Locale) => readonly string[],
): Record<Locale, string> =>
  // `fromEntries` widens the key back to `string`; the map above it is what makes the assertion
  // true, and `SUPPORTED_LOCALES` is what makes it stay true when a locale is added.
  Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, searchTextOf(termsOf(locale))]),
  ) as Record<Locale, string>;
