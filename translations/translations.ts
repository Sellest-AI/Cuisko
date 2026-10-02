import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { getLocales } from "expo-localization"

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@shared/translations";

// Import all translations at build time
import enAccount from "./en/account.json";
import enAssistant from "./en/assistant.json";
import enAuth from "./en/auth.json";
import enCommon from "./en/common.json";
import enGroceries from "./en/groceries.json";
import enHealth from "./en/health.json";
import enHome from "./en/home.json";
import enNavigation from "./en/navigation.json";
import enOnboarding from "./en/onboarding.json";
import enPlanning from "./en/planning.json";
import enRecipe from "./en/recipe.json";
import enRecipes from "./en/recipes.json";
import enVocabulary from "./en/vocabulary.json";
import frAccount from "./fr/account.json";
import frAssistant from "./fr/assistant.json";
import frAuth from "./fr/auth.json";
import frCommon from "./fr/common.json";
import frGroceries from "./fr/groceries.json";
import frHealth from "./fr/health.json";
import frHome from "./fr/home.json";
import frNavigation from "./fr/navigation.json";
import frOnboarding from "./fr/onboarding.json";
import frPlanning from "./fr/planning.json";
import frRecipe from "./fr/recipe.json";
import frRecipes from "./fr/recipes.json";
import frVocabulary from "./fr/vocabulary.json";

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
        Account: enAccount,
        Assistant: enAssistant,
        Auth: enAuth,
        Common: enCommon,
        Groceries: enGroceries,
        Health: enHealth,
        Home: enHome,
        Navigation: enNavigation,
        Onboarding: enOnboarding,
        Planning: enPlanning,
        Recipe: enRecipe,
        Recipes: enRecipes,
        Vocabulary: enVocabulary,
      },
    },
    fr: {
      translation: {
        Account: frAccount,
        Assistant: frAssistant,
        Auth: frAuth,
        Common: frCommon,
        Groceries: frGroceries,
        Health: frHealth,
        Home: frHome,
        Navigation: frNavigation,
        Onboarding: frOnboarding,
        Planning: frPlanning,
        Recipe: frRecipe,
        Recipes: frRecipes,
        Vocabulary: frVocabulary,
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

