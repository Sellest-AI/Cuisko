import type { Doc } from "@convex/_generated/dataModel";
import { hashText, setTranslations } from "@convex/lib/i18n";
import {
  LOCALES,
  DEFAULT_LOCALE,
  type Locale,
  type LocalizedList,
  type TranslationStatus,
} from "@convex/schema/i18n";
import type { Allergen } from "@shared/allergens";
import type { Category } from "@shared/categories";
import type { Diet } from "@shared/diets";
import type { IngredientSource, Unit } from "@shared/ingredients";
import { computeNutriScore, type IngredientNutrition } from "@shared/nutrition";
import { searchTextByLocale } from "@shared/search";

/**
 * Everything about an ingredient that somebody has to KNOW. Nothing here is computed.
 *
 * The line between this and the row is the line between a fact and a derivation, and it is drawn
 * where it is so that the derivations have exactly one author. A caller that could pass `search`
 * or `nutriScore` would be a caller that could get them wrong.
 */
export type IngredientFacts = {
  /**
   * The seed's dedup key, and only the seed's. A row grown from a shopper's typing has no slug —
   * there is nothing stable to key it by, which is the reason `source` exists.
   */
  slug?: string;
  /**
   * What this ingredient is called, per language, and how each language got there.
   *
   * **Keyed by `Locale` rather than an `en`/`fr` pair**, because the locale vocabulary is written
   * in `schema/i18n.ts` and nowhere else — a second copy here would typecheck against that one
   * only for as long as the two happened to agree, which is the argument `perLocale` already
   * makes for itself.
   *
   * **`status` is per language, and it is the writer's to supply.** It records whether a name was
   * authored in that language or rendered from another one, and no rule at this level can infer
   * that: a row from CIQUAL carries an authored French name beside an English one a model
   * rendered, and the two must not be marked alike. `"edited"` is what forbids replacing a name
   * later with a better rendering, so claiming it for a name nobody authored is how an invented
   * spelling becomes permanent.
   *
   * **Every language, or no row — and that is not a formality.** A source routinely knows a food
   * in one language only: 2216 of the shipped taxonomy's 6248 entries carry a single name, and
   * neither live API promises better. A row stored with just its French name is invisible to a
   * shopper typing "carrot", who then gets a second `carotte` created for them — the duplicate
   * this whole resolver exists to prevent, arriving through the door it came in by. `resolvei18n`
   * would not even make it look broken: it falls back, and the English screen simply reads
   * "Carotte".
   *
   * So the gap is the writer's to close BEFORE it gets here, which is what the agent is for — it
   * is already mandatory on the create path for `category`, `diet`, `allergens` and `emoji`, so a
   * missing name is one more field in a call that was happening anyway. Total rather than
   * `Partial` so that omitting one fails to compile, and so that adding a third locale fails here
   * too, at every writer, instead of quietly storing rows nobody can find in it.
   */
  names: Record<Locale, { value: string; status: TranslationStatus }>;
  /**
   * The language this row's names were DERIVED FROM.
   *
   * It decides the `sourceHash` every `machine` name is stored against, and the direction matters:
   * the agent is handed one word in one language and renders the others from it, so a shopper
   * typing `chocolat lindt` produces an authored-ish French and an English rendered out of it.
   * Pivoting on the wrong language records the derivation backwards, and `edited` cannot save a
   * row where the model invented both names — neither locale carries it.
   *
   * ⚠️ **It is the shopper's UI language, not the language of the words they typed.** Nothing
   *    detects the latter — `resolve.authed` passes `ctx.i18n.locale`, and the agent tool has read
   *    its own `locale` arg that way since it was written. The two part when somebody types across
   *    languages: a French-UI shopper typing `chicken breast` pivots this row on `fr`, recording
   *    the English as a rendering of the French the model made from it, which is backwards. The
   *    proxy is accepted rather than unnoticed — it is right whenever the shopper types in the
   *    language they read the app in, and closing the gap means detecting a language from one or
   *    two words, which is its own slice. An authored name outranks this and repairs the case
   *    anyway wherever a source stated a spelling.
   *
   * **Optional, and outranked by an authored name.** It is consulted only when NO locale is
   * `edited` — where a source stated one of the names, that source's language is what the others
   * were rendered from, whatever the shopper typed. See `pivot` below, which is where the order
   * is decided and argued.
   *
   * So it is the answer for the row the model invented outright, and `seedIngredients` has nothing
   * to pass: its names are hand-written in `ingredientCatalog.ts` and marked `edited` in both
   * languages, which hashes each against itself and reads no pivot at all.
   */
  sourceLocale?: Locale;
  emoji: string;
  aliases: LocalizedList;
  category: Category;
  diet: Diet;
  /**
   * `[]` is a claim, not a gap — "we considered the fourteen and this carries none". A source that
   * has not been checked for allergens must not reach this type.
   */
  allergens: Allergen[];
  defaultUnit: Unit;
  defaultQuantity: number;
  gramsPerPiece?: number;
  gramsPerMl?: number;
  nutrition: IngredientNutrition;
};

/** Every field of the table, ready to insert or patch. `updatedAt` is the caller's to stamp. */
export type IngredientRow = Omit<Doc<"ingredients">, "_id" | "_creationTime" | "updatedAt">;

/**
 * The share of an ingredient, by weight, that is fruit/vegetable/legume — the one Nutri-Score
 * input nothing measures per ingredient (see `shared/nutrition.ts`). Estimated from `category`,
 * which is sound here because these are single unprocessed ingredients rather than mixed products.
 *
 * Moved here from `seedIngredients` when this file was extracted: it is an input to a DERIVED
 * field, so leaving it beside one writer would have meant the second writer estimating it
 * differently and the same carrot scoring two grades depending on who created it.
 */
const FRUIT_VEG_LEGUME_PERCENT: Partial<Record<Category, number>> = {
  VEGETABLE: 100,
  FRUIT: 100,
  HERB: 100,
  LEGUME: 50,
};

/**
 * **The one row sanitizer for `ingredients` (ADR 0011).** Facts in, every field the table declares
 * out. Pure: it touches no database, so every writer can compose it and it can be tested against
 * the seed's own catalog with no `ctx` in the loop.
 *
 * The rule it exists for is not "one writer". `ingredients` legitimately has several — the catalog
 * is seeded from the repo AND grown by cooks, and a row created from a thin source is later
 * corrected from a better one. What there can only be one of is the function that SHAPES the row,
 * because `search` and `nutriScore` are derived: the moment a call site builds its own `search`
 * blob, that row is indexed under a spelling the reader never searches for and there is no
 * symptom — the row is simply never found again.
 *
 * So a writer's whole job is to produce facts and hand them here. If you find yourself reaching
 * for `@shared/search` or `computeNutriScore` at a call site, the call site is wrong.
 *
 * `source` is a separate argument rather than a field of `IngredientFacts` because it is not a
 * fact about the ingredient — it is a fact about the write. The same carrot facts recorded by the
 * seed and by a lookup are the same facts, provenanced differently.
 */
export const ingredientRow = (facts: IngredientFacts, source: IngredientSource): IngredientRow => {
  const named = LOCALES.map((locale) => ({ locale, ...facts.names[locale] }));

  const authored = named.filter(({ status }) => status === "edited");

  /**
   * The language the rendered names below are recorded as renderings OF.
   *
   * **An authored name outranks the shopper's, and that order is the whole point.** `edited` means
   * a source STATED that spelling — CIQUAL's `carotte` — so the other locale was rendered from it
   * whichever language the shopper was reading the app in. Taking `sourceLocale` first would pivot
   * a CIQUAL row on the model's own English, hash it against itself, and leave nothing that can
   * ever notice the French it came from changing.
   *
   * `sourceLocale` answers the row nothing authored, which is the common one: the model invents
   * both names, and the shopper's language is the only evidence of which way that ran. It is a
   * proxy and a lossy one — see the warning on `IngredientFacts.sourceLocale` — which is the
   * second reason an authored name is preferred over it rather than the other way round.
   *
   * `DEFAULT_LOCALE` breaks a tie between two authored names and closes the type. Both are
   * arbitrary and both are safe — a row with two authored names hashes each against itself below,
   * so no pivot is read at all, and that is exactly `seedIngredients`.
   */
  const pivot =
    authored.find(({ locale }) => locale === DEFAULT_LOCALE)?.locale ??
    authored[0]?.locale ??
    facts.sourceLocale ??
    DEFAULT_LOCALE;

  // Hashed once rather than once per locale — the same economy `saveTranslations` makes, and for
  // the same reason: one source text covers every language rendered from it.
  const sourceHash = hashText(facts.names[pivot].value);

  return {
    slug: facts.slug,
    name: setTranslations(
      undefined,
      named.map(({ locale, value, status }) => ({
        locale,
        value,
        status,
        // **An authored name is hashed against ITSELF, and only a rendered one against the source.**
        // `sourceHash` answers "has the text this was derived from changed under it", and a name a
        // person wrote was derived from nothing — see `isTranslationOutdated`, which returns false
        // for `edited` before it reads this at all. Storing the pivot's hash on an authored name
        // would record a derivation that never happened; storing its own keeps the row honest and
        // leaves `seedIngredients`, whose names are `edited` in both languages, exactly as it was.
        sourceHash: status === "edited" ? hashText(value) : sourceHash,
      })),
    ),
    emoji: facts.emoji,
    aliases: facts.aliases,
    // Built by the shared serializer and by nothing else (ADR 0011), and for every language
    // rather than the ones a source happened to know — a row indexed in one locale only is a row
    // the other locale's shopper creates a duplicate of.
    search: searchTextByLocale((locale) => [
      facts.names[locale].value,
      ...(facts.aliases[locale] ?? []),
    ]),
    category: facts.category,
    diet: facts.diet,
    allergens: facts.allergens,
    defaultUnit: facts.defaultUnit,
    defaultQuantity: facts.defaultQuantity,
    // Undefined for a row that has no such ratio, which is how `patch` drops one that was removed
    // from the catalog — an omitted key would leave the old value in place instead.
    gramsPerPiece: facts.gramsPerPiece,
    gramsPerMl: facts.gramsPerMl,
    nutrition: facts.nutrition,
    nutriScore: computeNutriScore(
      facts.nutrition,
      FRUIT_VEG_LEGUME_PERCENT[facts.category] ?? 0,
    ),
    source,
  };
};
