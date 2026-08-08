import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { getLocales } from "expo-localization"

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@shared/translations";

// Import all translations at build time
import enCommon from "./en/common.json";
import enHome from "./en/home.json";
import frCommon from "./fr/common.json";
import frHome from "./fr/home.json";

// Import the type to use in this file
import type { IntlMessages, TranslationKeys } from "./types";


type Locale = (typeof SUPPORTED_LOCALES)[number]

const _isSupported = (code: string | null | undefined): code is Locale =>
  SUPPORTED_LOCALES.includes(code as Locale)

/**
 * The device's preferred language, if we speak it. `getLocales()` is synchronous, so this settles
 * before init and the first frame is already correct — no flash of English on a French device.
 */
const _resolveLocale = (): Locale => {
  const code = getLocales()[0]?.languageCode
  return _isSupported(code) ? code : DEFAULT_LOCALE
}

// Initialize i18next synchronously with bundled resources
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        Home: enHome,
        Common: enCommon,
      },
    },
    fr: {
      translation: {
        Home: frHome,
        Common: frCommon,
      },
    },
  },
  lng: _resolveLocale(),
  fallbackLng: DEFAULT_LOCALE,
  compatibilityJSON: "v4",
  interpolation: {
    escapeValue: false, // React already escapes values
  },
});

// Custom hook that mimics next-intl's useTranslations API with full deep type safety
export const useTranslations = <Namespace extends keyof IntlMessages>(namespace: Namespace) => {
  const { t } = useTranslation();

  return <Key extends TranslationKeys<Namespace>>(
    key: Key,
    values?: Record<string, string | number>
  ): string => {
    const fullKey = `${namespace}.${key}`;
    return t(fullKey, values);
  };
};

// Export i18n instance and hooks
export { useTranslation } from "react-i18next";
export { i18n };

