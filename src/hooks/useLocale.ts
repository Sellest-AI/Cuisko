import { getLocales } from "expo-localization";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@shared/translations";

/**
 * Which language the backend should answer in.
 *
 * Every `*I18n` procedure takes a `locale`, because the server resolves translated content and
 * picks a per-locale search index rather than shipping every language to the client. This is the
 * one place that decides which one, so a screen never has to.
 *
 * Read from the device rather than from a setting: there is no language preference in the app yet.
 * When there is, it goes here and every caller follows — that is the point of the seam.
 *
 * `getLocales()` is synchronous and its first entry is the device's preferred language, so this
 * needs no state and no effect: it is a hook only so the preference has somewhere to arrive when
 * one exists.
 */
export const useLocale = (): Locale => {
  const preferred = getLocales()[0]?.languageCode;

  return SUPPORTED_LOCALES.find((locale) => locale === preferred) ?? DEFAULT_LOCALE;
};
