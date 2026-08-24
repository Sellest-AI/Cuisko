export const SUPPORTED_LOCALES = ["en", "fr"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

const FRENCH_STOPWORDS = new Set([
  "de", "des", "du", "d", "la", "le", "les", "l",
  "un", "une", "et", "ou", "avec", "pour", "au", "aux", "en",
]);

const ENGLISH_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "with", "for", "in", "on", "at",
  "to", "of", "from", "by", "as", "is", "are", "was", "were",
]);

export const STOPWORDS: Record<Locale, Set<string>> = {
  en: ENGLISH_STOPWORDS,
  fr: FRENCH_STOPWORDS,
};

/**
 * The same word, with its accents removed — "crème" and "creme" fold to one string.
 *
 * Shared because the two sides of search must agree exactly. The seed folds an ingredient's name
 * and aliases into the blob the Convex search index reads; the navigation bar folds what the
 * shopper typed before scoring it against what came back. Fold them differently and the server
 * returns a row the client then scores at zero — a search that finds an ingredient and refuses to
 * show it, with no error anywhere.
 *
 * `\p{Diacritic}` rather than the `[̀-ͯ]` block: the block covers Latin only, so a
 * combining mark above U+036F survives it. Same result for French and English, and the right one
 * for the languages after them.
 *
 * Case is deliberately left alone. Folding accents is reversible information loss the caller
 * always wants; lowercasing is not always — call `.toLowerCase()` where it is.
 */
export const foldAccents = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
