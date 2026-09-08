import { SUPPORTED_LOCALES, type Locale } from "@shared/translations";
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
export { SUPPORTED_LOCALES as LOCALES, DEFAULT_LOCALE, type Locale } from "@shared/translations";

export const vLocale = v.union(...SUPPORTED_LOCALES.map(v.literal));

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

/**
 * One value per locale with NO locale optional — the shape a payload takes when every language is
 * mandatory rather than filled in as it arrives.
 *
 * The counterpart of `perLocale`, and it lives here for the same reason: the locale keys are
 * written in this file and nowhere else. `IngredientFacts.names` is why it exists — a row stored
 * with only its French name is invisible to a shopper typing "carrot", who then creates a second
 * `carotte`, so the writer has to state both and the validator has to insist.
 */
export const everyLocale = <T extends Validator<unknown, "required", string>>(value: T) =>
  v.object({ fr: value, en: value });

/** How a rendering got there — authored in this language, machine-rendered, or failed to render. */
export const vTranslationStatus = v.union(
  v.literal("machine"),
  v.literal("edited"),
  v.literal("failed"),
);

const meta = v.object({
  status: vTranslationStatus,
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
/** Many strings per locale — alternate spellings, and anything else many-per-language. */
export type LocalizedList = Infer<typeof vLocalizedList>;
/** A derived blob per locale — what a `searchIndex` reads. See @shared/search and ADR 0011. */
export type LocalizedText = Infer<typeof vLocalizedText>;
export type TranslationStatus = Meta["status"];

type Check = Locale extends keyof Localized["values"]
  ? keyof Localized["values"] extends Locale ? true : never
  : never;

/** The keys `everyLocale` actually writes — the second place a locale has to be added. */
type EveryLocale = keyof Infer<ReturnType<typeof everyLocale<typeof vLocale>>>;

/** The same guard, for the total helper: a new locale must reach both or neither. */
type CheckEveryLocale = Locale extends EveryLocale
  ? EveryLocale extends Locale ? true : never
  : never;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _check: Check = true; // erreur de compilation si désynchronisé
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _checkEveryLocale: CheckEveryLocale = true;
