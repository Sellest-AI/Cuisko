import common from "./en/common.json";
import home from "./en/home.json";

// Type the nested structure to match your i18n config
type TranslationResources = {
  Home: typeof home;
  Common: typeof common;
};

export type IntlMessages = TranslationResources;

// Utility type to generate all possible dot-notation paths from nested object
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & string]: ObjectType[Key] extends object
  ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
  : `${Key}`;
}[keyof ObjectType & string];

// Export the path type for use in useTranslations
export type TranslationKeys<Namespace extends keyof IntlMessages> = NestedKeyOf<IntlMessages[Namespace]>;

// Type augmentation for react-i18next - enables autocomplete!
declare module "react-i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: TranslationResources;
    };
  }
}
