export const SUPPORTED_LOCALES = ["en", "fr"] as const;

type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
