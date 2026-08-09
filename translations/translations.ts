import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { getLocales } from "expo-localization"

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@shared/translations";

// Import all translations at build time
import enAuth from "./en/auth.json";
import enCommon from "./en/common.json";
import enHome from "./en/home.json";
import enNavigation from "./en/navigation.json";
import enPlanning from "./en/planning.json";
import frAuth from "./fr/auth.json";
import frCommon from "./fr/common.json";
import frHome from "./fr/home.json";
import frNavigation from "./fr/navigation.json";
import frPlanning from "./fr/planning.json";

// Import the type to use in this file
import type { IntlMessages, TranslationKeys } from "./types";


type Locale = (typeof SUPPORTED_LOCALES)[number]

const _isSupported = (code: string | null | undefined): code is Locale =>
  SUPPORTED_LOCALES.includes(code as Locale)

/**
 * The device's preferred language, if we speak it. `getLocales()` is synchronous, so this settles
 * before init and the first frame is already correct — no flash of English on a French device.
 */
export const resolveLocale = (): Locale => {
  const code = getLocales()[0]?.languageCode
  return _isSupported(code) ? code : DEFAULT_LOCALE
}

// Initialize i18next synchronously with bundled resources
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        Auth: enAuth,
        Common: enCommon,
        Home: enHome,
        Navigation: enNavigation,
        Planning: enPlanning,
      },
    },
    fr: {
      translation: {
        Auth: frAuth,
        Common: frCommon,
        Home: frHome,
        Navigation: frNavigation,
        Planning: frPlanning,
      },
    },
  },
  lng: resolveLocale(),
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

