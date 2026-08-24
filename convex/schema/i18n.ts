import { type Locale } from "@shared/translations";
import { v, type Infer, type Validator } from "convex/values";

/**
 * The locale vocabulary is `shared/`'s, not this file's.
 *
 * It has to be: `useLocale` picks a locale on the client from `SUPPORTED_LOCALES` and every
 * `*I18n` procedure validates one against `vLocale`, which is built from this. Two lists would
 * typecheck against each other while they happened to agree, and the day one gained a language
 * the client would send a locale the validator rejects — at runtime, with nothing failing to
 * compile. Re-exported under the shorter name because that is what this file's readers call it.
 */
export { SUPPORTED_LOCALES as LOCALES, type Locale } from "@shared/translations";

/**
 * One optional value per locale — the shape every translated field has, whatever it carries.
 *
 * The locale keys are written here and nowhere else. They cannot be derived from `LOCALES` at
 * runtime without losing the field types Convex infers from them, so the `Check` below is what
 * keeps the two in step: add a locale and this file stops compiling until every caller of
 * `perLocale` follows.
 */
const perLocale = <T extends Validator<unknown, "required", string>>(value: T) =>
  v.object({ fr: v.optional(value), en: v.optional(value) });

const meta = v.object({
  status: v.union(v.literal("machine"), v.literal("edited"), v.literal("failed")),
  sourceHash: v.string(),
});

/** A single meaning rendered in several languages, each carrying how it got there. */
export const vLocalized = v.object({
  values: perLocale(v.string()),
  meta: perLocale(meta),
});

/** A list per locale — alternate spellings, tags, anything many-per-language. */
export const vLocalizedList = perLocale(v.array(v.string()));

/** A plain string per locale, with no translation metadata — a denormalized or derived blob. */
export const vLocalizedText = perLocale(v.string());

export type Meta = Infer<typeof meta>;
export type Localized = Infer<typeof vLocalized>;
export type TranslationStatus = Meta["status"];

type Check = Locale extends keyof Localized["values"]
  ? keyof Localized["values"] extends Locale ? true : never
  : never;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _check: Check = true; // erreur de compilation si désynchronisé
