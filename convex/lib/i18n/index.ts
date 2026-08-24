import { Locale, Localized, TranslationStatus } from "@convex/schema/i18n";

export function resolvei18n(f: Localized, locale: Locale, fallback: Locale = "en") {
  return f.values[locale] ?? f.values[fallback] ?? "";
}

/** Cheap, stable, non-cryptographic — only used to notice that source text changed. */
export function hashText(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export function setTranslation(
  f: Localized,
  locale: Locale,
  value: string,
  status: TranslationStatus,
  sourceHash: string,
): Localized {
  return {
    values: { ...f.values, [locale]: value },
    meta: { ...f.meta, [locale]: { status, sourceHash } },
  };
}
