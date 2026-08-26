import { Locale, Localized, TranslationStatus } from "@convex/schema/i18n";

export function resolvei18n(f: Localized, locale: Locale, fallback: Locale = "en") {
  return f.values[locale] ?? f.values[fallback] ?? "";
}

export const hasTranslation = (f: Localized, locale: Locale) =>
  f.values[locale] !== undefined && f.meta[locale]?.status !== "failed";

/** Cheap, stable, non-cryptographic — only used to notice that source text changed. */
export function hashText(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/** A field with no translation yet — the state every `vLocalized` column starts from. */
const _empty: Localized = { values: {}, meta: {} };

export function setTranslation(
  f: Localized | undefined,
  locale: Locale,
  value: string,
  status: TranslationStatus,
  sourceHash: string,
): Localized {
  return {
    values: { ...(f ?? _empty).values, [locale]: value },
    meta: { ...(f ?? _empty).meta, [locale]: { status, sourceHash } },
  };
}

export function setTranslations(
  f: Localized | undefined,
  translations: { locale: Locale; value: string; status: TranslationStatus; sourceHash: string }[],
): Localized {
  return translations.reduce(
    (acc, { locale, value, status, sourceHash }) =>
      setTranslation(acc, locale, value, status, sourceHash),
    f ?? _empty,
  );
}
