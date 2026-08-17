export const SUPPORTED_LOCALES = ["en", "fr"] as const;

type Locale = (typeof SUPPORTED_LOCALES)[number];

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
