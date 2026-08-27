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
 *
 * ⚠️ **The ligatures are expanded by hand, and no normalisation form would do it.** `œ` and `æ`
 * carry NO decomposition mapping in Unicode — not canonical, not compatibility — because they are
 * letters of the languages that use them rather than typographic ligatures like `ﬁ`. So `NFD`
 * leaves "bœuf" whole, the blob stores it twice, and "boeuf" is a token no row carries: a cook
 * typing the only spelling their keyboard offers finds nothing, with no error anywhere. That is
 * the exact failure this function exists to prevent, so the pair is expanded before the fold.
 */
const LIGATURES: Record<string, string> = { "œ": "oe", "Œ": "OE", "æ": "ae", "Æ": "AE" };

/**
 * Built FROM the map's own keys rather than written beside it, so the two cannot drift. A character
 * class typed out by hand is one edit away from listing a ligature the map has no entry for, and
 * the replacement for a missing entry is the string "undefined" — written into the blob, indexed,
 * and visible nowhere. Deriving it makes that state unreachable; the `?? ligature` below is the
 * total-function fallback that proves it to the compiler.
 */
const LIGATURE = new RegExp(`[${Object.keys(LIGATURES).join("")}]`, "gu");

export const foldAccents = (value: string) =>
  value
    .replace(LIGATURE, (ligature) => LIGATURES[ligature] ?? ligature)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * What each locale is called, in English, for a model that is being told which language to write.
 *
 * A prompt says "French", never "fr": a two-letter code is a token a model has to resolve before it
 * can obey the instruction, and the resolution is silent when it goes wrong. Here rather than in
 * one of the two prompt files that need it, because they must agree — a locale added to
 * `SUPPORTED_LOCALES` is a compile error in this record until it is named.
 */
export const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", fr: "French" };
