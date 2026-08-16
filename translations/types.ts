import auth from "./en/auth.json";
import common from "./en/common.json";
import groceries from "./en/groceries.json";
import home from "./en/home.json";
import navigation from "./en/navigation.json";
import planning from "./en/planning.json";
import recipe from "./en/recipe.json";

// Type the nested structure to match your i18n config
type TranslationResources = {
  Auth: typeof auth;
  Common: typeof common;
  Groceries: typeof groceries;
  Home: typeof home;
  Navigation: typeof navigation;
  Planning: typeof planning;
  Recipe: typeof recipe;
};

export type IntlMessages = TranslationResources;

// Utility type to generate all possible dot-notation paths from nested object
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & string]: ObjectType[Key] extends object
  ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
  : `${Key}`;
}[keyof ObjectType & string];

/**
 * The CLDR categories i18next appends to a plural key, one per form.
 *
 * Kept in step with PLURAL_CATEGORIES in scripts/c8-i18n-parity.mjs: this type decides which keys
 * a call site may name, that check decides which keys a locale must carry, and a disagreement
 * between them is a key the compiler offers and nothing polices.
 */
type PluralSuffix = "_zero" | "_one" | "_two" | "_few" | "_many" | "_other";

/**
 * `to_buy_x_items_one` -> `to_buy_x_items`.
 *
 * A counted string is several keys in the JSON — one per category, and French has a category
 * English does not — but exactly one key at the call site: `t("to_buy_x_items", { count })`, with
 * i18next choosing the form. So the suffixed names are stripped out of the union rather than added
 * to it, which also makes calling one directly a type error, as it should be: naming a form is
 * choosing a grammar the count has not been consulted about.
 */
type StripPlural<Key extends string> = Key extends `${infer Base}${PluralSuffix}` ? Base : Key;

/** Every key `useTranslations(namespace)` will accept, in dot notation. */
export type TranslationKeys<Namespace extends keyof IntlMessages> = StripPlural<
  NestedKeyOf<IntlMessages[Namespace]>
>;

// Type augmentation for react-i18next - enables autocomplete!
declare module "react-i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: TranslationResources;
    };
  }
}
