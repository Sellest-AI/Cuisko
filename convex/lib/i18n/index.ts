import { Locale, Localized, TranslationStatus } from "@convex/schema/i18n";

export function resolvei18n(f: Localized, locale: Locale, fallback: Locale = "en") {
  return f.values[locale] ?? f.values[fallback] ?? "";
}

export const hasTranslation = (f: Localized, locale: Locale) =>
  f.values[locale] !== undefined && f.meta[locale]?.status !== "failed";

/**
 * Whether a locale's translation is missing, or present but no longer answers the source it was
 * made from. `sourceHash` is written at translation time as a hash of the SOURCE text (see
 * `saveTranslations.ts`), so an edit that changes the source afterwards changes nothing about the
 * translation's own `values`/`meta` — the row still passes `hasTranslation`, and reads as done to
 * anything that only checks presence. Comparing the stored hash against the source's CURRENT one is
 * what catches a translation that is quietly answering a question nobody is asking anymore.
 *
 * `sourceHash` is the caller's rather than computed here: whoever calls this already has the
 * source `Localized` field in hand for every locale it is checking, and hashing it once per field
 * rather than once per (field, locale) pair is the entire reason `saveTranslations.ts`'s `fold`
 * computes it outside its own loop.
 *
 * ⚠️ `"edited"` is never outdated, whatever the hash says. That status means a cook typed this text
 *    themselves, and a stale hash is exactly what hand-written text looks like — it was never
 *    derived from any source, so it can never match one. Without this clause the machine would
 *    overwrite the cook's own words with a translation, which is the one thing the status exists to
 *    prevent. The cost is the honest one: an edited locale stops tracking the source, and only
 *    another edit will move it again.
 *
 * Today a cook only ever reaches their own recipes in their own language, so no recipe can carry
 * `"edited"` in two locales at once and this clause cannot yet fire. It is here because the status
 * is already written — the gap would open the day a second locale becomes reachable, silently.
 */
export const isTranslationOutdated = (f: Localized, locale: Locale, sourceHash: string): boolean => {
  if (f.meta[locale]?.status === "edited") return false;

  return !hasTranslation(f, locale) || f.meta[locale]?.sourceHash !== sourceHash;
};

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
