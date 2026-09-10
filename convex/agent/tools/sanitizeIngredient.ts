import * as z from "zod/v4";

import type { Id } from "@convex/_generated/dataModel";
import type { IngredientFacts } from "@convex/functions/ingredients/ingredientRow";
import {
  measuredAboutIt,
  measuredOver,
  NUTRITION_FIELDS,
  provenanceOf,
  type LookupHit,
} from "@convex/functions/ingredients/lookup/lookupHit";
import type { LocalizedList, TranslationStatus } from "@convex/schema/i18n";
import { ALLERGENS, type Allergen } from "@shared/allergens";
import { CATEGORIES } from "@shared/categories";
import { DIETS } from "@shared/diets";
import { retryPromise } from "@shared/helpers";
import { INGREDIENT_SOURCES, toGrams, UNITS, type IngredientSource } from "@shared/ingredients";
import { SUPPORTED_LOCALES, type Locale } from "@shared/translations";

import { ingredientsAgent, rankerAgent } from "../agents";
import { matchIngredientPrompt, sanitizeIngredientPrompt } from "../config/prompts/sanitizeIngredient";
import { createTool, modelText, parseModelOutput, providerSchema, wrapAgent } from "../utils";

/**
 * What the agent made of a term the catalog could not resolve.
 *
 * Three arms rather than "facts or nothing", for the reason `ResolvedIngredient` has three: the
 * caller does something different in each, and "we could not read that" and "that is a row you
 * already have" are not the same answer with a field missing.
 *
 * `existing` is the ONE place an id crosses this boundary, and it is not an id a model produced —
 * the model picks a POSITION in the candidate list it was handed, and the id is read out of that
 * list here (ADR 0010). Every other arm returns names and vocabulary.
 */
export type SanitizedIngredient =
  | {
    verdict: "existing";
    ingredientId: Id<"ingredients">;
    name: string;
    /**
     * Whether the word the shopper typed is worth STORING on that row as another word for it.
     *
     * The whole reason the ranker's answer is worth keeping: this call fires on every term the
     * catalog cannot resolve, so a shopper who types `zucchini` at a `courgette` row pays for a
     * model call today and pays again tomorrow, forever, for an answer that never changes. Stored
     * as an alias, the second attempt is answered by step 1 for nothing.
     *
     * It is the model's judgement and not this side's, because the question is about language: a
     * REGIONAL word and a COMMON misspelling are both worth storing, and a one-off mangling
     * ("pxtates") is not — the row would be indexed under a string nobody will ever type twice,
     * and the catalog slowly fills with a keyboard's noise. Nothing here can tell those apart
     * from the string alone, which is why the ranker is asked rather than a filter written.
     *
     * Absent reads as false: not storing costs one model call the next time, and storing junk
     * cannot be undone from here.
     */
    saveAlias: boolean;
  }
  | {
    verdict: "new";
    facts: IngredientFacts;
    /**
     * Where the row's numbers came from, decided beside them rather than re-derived by the
     * caller. It cannot be read off `hits`: a hit whose figures were measured on another food
     * contributes none of them (`measuredAboutIt`), so a second `provenanceOf` over the raw list
     * answers about evidence this row does not contain.
     */
    source: IngredientSource;
  }
  | { verdict: "refused"; reason: "not-food" | "not-an-ingredient" };

/**
 * One value per locale, keyed by the locale, built from `SUPPORTED_LOCALES` rather than written
 * out — the same shape and the same reason as `translateRecipe`'s `_localizedName`: adding a
 * language must not leave this one column short, and a `z.object` rather than a `z.record` because
 * `providerSchema` walks objects and passes a record through un-rewritten.
 */
const _perLocale = <T extends z.ZodType>(value: T) =>
  z.object(Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, value])) as {
    [K in Locale]: T;
  });

/** The nine, all required. What the model is asked for; what survives is decided below. */
const _nutritionSchema = z.object(
  Object.fromEntries(NUTRITION_FIELDS.map((field) => [field, z.number().min(0)])) as {
    [K in (typeof NUTRITION_FIELDS)[number]]: z.ZodNumber;
  },
);

/**
 * The fourteen, asked one at a time.
 *
 * **A checklist rather than an array, and that is the whole point.** `z.array(z.enum(ALLERGENS))`
 * let a model emit two entries without ever visiting the other twelve, and nothing downstream could
 * tell that apart from a completed walk — which is exactly the claim `IngredientFacts.allergens`
 * documents itself as making. A model with no hidden scratchpad cannot walk fourteen items
 * silently, so the walk is made STRUCTURAL: `providerSchema` marks every key required on the way
 * out, so the model has to emit a decision per allergen, and emitting it is what performs it.
 *
 * Measured, not assumed: across a bake-off of eight models on worcestershire sauce, the array
 * shape omitted `sulphites` in 13 of 21 completed runs and across six unrelated models — the
 * signature of a specification defect rather than a weak field.
 *
 * `.nullable().optional()` per key, the same bargain the file makes everywhere: required OUTBOUND
 * so the walk is forced, absentable INBOUND so a model writing `"yes"` instead of `true` costs one
 * allergen rather than the whole row. Absent reads as false, which is what absent means here.
 */
const _allergenChecklist = z.object(
  Object.fromEntries(
    ALLERGENS.map((allergen) => [
      allergen,
      z.boolean().nullable().optional()
        .describe(`true if this ingredient contains ${allergen}, false if it does not.`),
    ]),
  ) as { [K in Allergen]: z.ZodOptional<z.ZodNullable<z.ZodBoolean>> },
);

/** The checklist as the column stores it. Absent is false: an unanswered key is not a yes. */
const _allergensOf = (checklist: z.infer<typeof _allergenChecklist>): Allergen[] =>
  ALLERGENS.filter((allergen) => checklist[allergen] === true);

/**
 * The row as the model writes it — every field of `IngredientFacts` that is a judgement, and none
 * that is a derivation.
 *
 * Built from the shared `as const` vocabularies throughout (ADR 0010): `category`, `diet`,
 * `allergens` and `defaultUnit` are the four the column would reject a free string for, and
 * `_factsCheck` below is what fails to compile the day one of them drifts.
 *
 * ⚠️ No `search`, no `nutriScore`, no `slug`. `search` and `nutriScore` are `ingredientRow`'s to
 * derive and nobody else's (ADR 0011); `slug` is the seed's dedup key and a row grown from a
 * shopper's typing has none.
 *
 * **Key order is load-bearing, so `madeFrom` is first.** Structured output is generated in the
 * order the schema declares, so a field placed above `diet` and `allergens` is in context when
 * they are decided and a field placed below them is not. `madeFrom` is not stored anywhere — it
 * exists so that "anchovies, malt vinegar" is already written down by the time the model answers
 * whether this is vegan, which is the one thing that makes a non-reasoning model answer it the way
 * a reasoning one does. Reorder this object and that stops being true, silently.
 */
const _modelFactsSchema = z
  .object({
    madeFrom: z.string().describe(
      "FIRST, before every field below: what this food is made of, as the label on the back " +
      "would read it — the two or three that matter. \"anchovies, malt vinegar, tamarind\" for " +
      "worcestershire sauce; \"carrot\" for a carrot. Not stored and never shown to anyone: it " +
      "is here so the diet and allergen answers below are read off what is IN the food rather " +
      "than guessed from its name.",
    ),
    names: _perLocale(z.string()).describe(
      "What a shop or a recipe calls this food, in each language — singular, lowercase, no " +
      "quantity, no brand, no preparation. Every language gets one: a row named in one language " +
      "only is invisible to the other language's shopper, who then creates a second copy of it.",
    ),
    aliases: _perLocale(z.array(z.string())).describe(
      "Per language, the other spellings someone would plausibly type looking for this — the " +
      "regional word, the common misspelling, an irregular plural. NOT translations; those are " +
      "the names. An empty list is a normal answer.",
    ),
    emoji: z.string().describe("One emoji character, the closest to this food. Never a letter."),
    category: z.enum(CATEGORIES).describe("Exactly one — what it IS, i.e. the aisle it is in."),
    diet: z.enum(DIETS).describe(
      "Exactly one, and it is a claim of ABSENCE about this ingredient rather than about its " +
      "aisle: honey, gelatin and fish sauce are not vegan however vegetable the aisle looks.",
    ),
    allergens: _allergenChecklist.describe(
      "The regulated fourteen, answered one key at a time — true if this contains it, false if " +
      "it does not. Every key is asked, so every key gets an answer; fourteen falses is the " +
      "claim that you considered each and this carries none, which a screen prints " +
      "\"gluten-free\" on. Read `madeFrom` back first: the missed ones arrive with how the food " +
      "was made — barley malt vinegar is gluten, anything vinegared or bottled to keep is " +
      "sulphites.",
    ),
    defaultUnit: z.enum(UNITS).describe(
      `The unit a recipe writes this in. "cs" is a tablespoon, "cc" a teaspoon, "pcs" a ` +
      "countable single thing. What a cook would write, not what converts most neatly.",
    ),
    defaultQuantity: z.number().positive().describe("How much one recipe line typically calls for."),
    gramsPerPiece: z.number().positive().nullable().optional().describe(
      "What ONE of them weighs, in grams — 150 for an onion, 5 for a garlic clove. Left out for " +
      "anything there is no single one of (flour, oil, milk).",
    ),
    gramsPerMl: z.number().positive().nullable().optional().describe(
      "The density — 0.91 for oil, 1.42 for honey. Left out for anything nobody measures by " +
      "volume (a chicken, a carrot).",
    ),
    nutrition: _nutritionSchema.describe(
      "Per 100g, for the raw ingredient as sold: calories in kcal, the rest in grams, and sodium " +
      "in MILLIGRAMS — sodium, not salt, which is 2.5x more.",
    ),
  })
  // **The weighability rule is NOT enforced here, and that is deliberate — see `_weighable`.** A
  // `.refine()` on this object is fatal to the whole row rather than to the field that broke it:
  // `facts` is `.nullable().optional()`, so `_clean` drops an object that fails validation and the
  // caller gets "no usable row" instead of a row missing a density. Losing a correct diet, a
  // correct allergen walk and eight correct nutrition figures because a model forgot `gramsPerMl`
  // is the worst trade in this file, and it is the failure a bake-off measured a model dying on
  // twice in three runs. The rule is still enforced — after the parse, where it can repair.
  //
  // **A name is required, so `parseModelOutput` hands back whatever word the model wrote there** —
  // a required string is not a field it may drop, so "N/A" survives it as a valid string. That is
  // the right default everywhere else and the wrong one here: a row named "N/A" in English is a row
  // the English shopper never finds and immediately creates a second copy of, which is the whole
  // failure this step exists to prevent. `modelText` is the same judgement the parser uses.
  .refine((facts) => SUPPORTED_LOCALES.every((locale) => modelText(facts.names[locale])), {
    error: "every language needs a real name, not a word meaning there is none",
  });

/**
 * The whole answer: what it is, and the row if it is one.
 *
 * `facts` is nullable rather than a second call, because the model has to read the term to decide
 * either question and reading it twice is a second bill for the same work. Nullable rather than
 * required-and-ignored: a schema that demands a row for washing-up liquid gets one.
 */
export const modelIngredientSchema = z.object({
  verdict: z.enum(["ingredient", "not-food", "not-an-ingredient"]).describe(
    `"ingredient" for a food a shop sells. "not-food" for washing-up liquid, batteries, or an ` +
    `illegible string. "not-an-ingredient" for a finished dish, a ready meal or a sentence.`,
  ),
  // `.nullable()` AND `.optional()`, which say two different things and both are needed here (see
  // `providerSchema`): nullable is the model's permission to have no row, optional is this side's
  // permission to read a missing key — and `parseModelOutput` OMITS a key it dropped rather than
  // setting it to undefined, so nullable alone fails the parse on every refusal.
  facts: _modelFactsSchema.nullable().optional()
    .describe("The catalog row. null unless the verdict is \"ingredient\"."),
});

/**
 * What the model may be told about a candidate. A name and a position, never the id — the id stays
 * on this side of the boundary and is read back out of the list by the position it returns.
 */
const _candidateSchema = z.object({
  id: z.string().describe("Supplied by the caller. Never something to generate."),
  name: z.string(),
});

/**
 * The evidence the three cheap steps of `resolveIngredient` already gathered, mirrored in zod.
 *
 * A mirror rather than the type itself because `createTool` needs a runtime schema, and
 * `_evidenceCheck` below is what stops the mirror drifting: `LookupHit` gaining a field the tool
 * never sees would otherwise be silent.
 */
const _hitSchema = z.object({
  source: z.enum(INGREDIENT_SOURCES),
  names: _perLocale(z.array(z.string()).optional()),
  untagged: z.array(z.string()).optional(),
  searched: z.boolean().optional(),
  // Not decoration: `_inputSchema` PARSES what the tool is handed, and zod drops what it does not
  // declare. Omitted here, `measuredAs` would arrive as undefined however carefully the lookups
  // filled it, and `measuredAboutIt` would read every hit as one its source vouched for.
  measuredAs: z
    .array(z.object({ name: z.string(), locale: z.enum(SUPPORTED_LOCALES).optional() }))
    .optional(),
  nutrition: z
    .object(
      Object.fromEntries(
        NUTRITION_FIELDS.map((field) => [field, z.number().optional()]),
      ) as { [K in (typeof NUTRITION_FIELDS)[number]]: z.ZodOptional<z.ZodNumber> },
    )
    .optional(),
});

const _inputSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES).describe("The language the shopper typed in."),
  text: z.string().describe("What the shopper typed, verbatim."),
  candidates: z
    .array(_candidateSchema)
    .optional()
    .describe("Catalog rows the widened search found and declined to link on its score alone."),
  hits: z
    .array(_hitSchema)
    .optional()
    .describe("What the taxonomy, CIQUAL and the two live APIs said about this term."),
});

/** Everything the tool is handed. Named because the two prompt builders below both take it. */
export type SanitizeIngredientInput = z.infer<typeof _inputSchema>;

/**
 * What the ranker may answer, bounded by the list it was handed.
 *
 * A factory rather than a constant because the bound IS the list's length, and the bound does its
 * work on the way OUT: `providerSchema` sends `max` to the provider, so a model generating against
 * it cannot name a sixth candidate in a list of five. That is where a hallucinated position is
 * actually prevented — not on the way back.
 *
 * ⚠️ On the way back it does NOT throw, and this docblock claimed for a while that it did.
 * `matchIndex` is `.nullable().optional()`, and `parseModelOutput`'s rule is that an absentable
 * field failing its own validation goes ABSENT rather than failing the parse — so an out-of-range
 * index arrives as "no match" and the tool writes a fresh row. Which is the safe direction, and
 * the reason the mistake was invisible: the expensive branch runs, nobody's list gets the wrong
 * food, and the only cost is one generation. `sanitizeIngredient.test.ts` pins it.
 *
 * Exported for the reason the prompts are — the bake-off that picks the ranker's model has to score
 * the schema the tool actually sends, bound included, since that bound is most of what stops a
 * cheap model here from being dangerous.
 */
export const matchIngredientSchema = (candidateCount: number) =>
  z.object({
    matchIndex: z.number().int().min(0).max(Math.max(candidateCount - 1, 0)).nullable().optional()
      .describe("The position of the matching candidate. Left out when none matches."),
    confidence: z.number().min(0).max(1).nullable().optional()
      .describe("How sure you are, 0 to 1. Left out when nothing matches."),
    saveAlias: z.boolean().nullable().optional()
      .describe(
        "true if what the shopper typed is a real word for that food and worth remembering on " +
        "the row — another language, a regional word, a plural, a common misspelling, or a " +
        "brand people shop by. false for a one-off mangling of the word, or anything carrying " +
        "a quantity. Left out when nothing matches.",
      ),
  });

/** What the ranker is shown: the term, and the candidates by position. Never an id. */
export const matchIngredientUserPrompt = (
  { text, candidates = [] }: Pick<SanitizeIngredientInput, "text" | "candidates">,
) =>
  [
    `The shopper typed:\n${text}`,
    `Candidates:\n${candidates.map(({ name }, index) => `${index}. ${name}`).join("\n")}`,
  ].join("\n\n");

// The two compile-time assertions ADR 0010 asks for: the schema and the hand-written types drift
// apart in silence otherwise — a vocabulary gains a value, a lookup gains a field, and the first
// symptom is a row the column rejects at insert time.
type _FactsCheck = z.infer<typeof _modelFactsSchema> extends Omit<
  IngredientFacts,
  "slug" | "names" | "aliases" | "allergens" | "gramsPerPiece" | "gramsPerMl"
>
  ? true
  : never;
// `allergens` leaves the check above because the model no longer writes the column's shape — it
// answers a checklist that `_allergensOf` folds into one. So the thing to pin is that the checklist
// asks about exactly the fourteen the column stores: a key in one and not the other is an allergen
// silently never asked about, which is the failure the checklist exists to make impossible.
type _AllergenCheck = keyof z.infer<typeof _allergenChecklist> extends Allergen
  ? Allergen extends keyof z.infer<typeof _allergenChecklist>
  ? true
  : never
  : never;
type _EvidenceCheck = z.infer<typeof _hitSchema> extends LookupHit ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _factsCheck: _FactsCheck = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _allergenCheck: _AllergenCheck = true;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _evidenceCheck: _EvidenceCheck = true;

/** Every spelling a hit stated for one language, lowercased for comparison. */
const _statedIn = (hits: readonly LookupHit[], locale: Locale) =>
  hits.flatMap((hit) => hit.names[locale] ?? []);

/**
 * The spellings worth STORING as another word for the food — the curated hits' only.
 *
 * **A rule about how a source found its answer, not about how good the source is.** A hit marked
 * `searched` was handed the shopper's words and returned what ranked highest, and neither API is
 * ranking by "is this the same food": Open Food Facts answered `crème de marrons` with `Yaourt
 * brassé crème de marrons 2 x 160 g` — a yogurt — and `Clement Faugier - Vanilla Chestnut Spread,
 * 17.5oz (500g)`, a brand and a package size. USDA answered `pâte de pistache` with `Pastry,
 * Pastelitos de Guava (guava pastries)`. Stored as aliases these reach the search blob through
 * `ingredientRow`, and the catalog starts answering "yaourt" with a jar of chestnut spread.
 *
 * **A score cannot separate them, which is why this is not another threshold.** The yogurt is a
 * different food that CONTAINS this one, so it carries the name in full; the guava pastry rides in
 * on `paste` resembling `pastry` at 0.667. Measured: the pastry scores 0.356 against `pistachio
 * paste` and USDA's own correct `Nuts, pistachio nuts, raw` scores 0.400 — 0.044 apart, so any bar
 * that excludes one excludes both.
 *
 * **The searching sources lose nothing they were doing well.** Their spellings are already spent
 * where they pay: `_fromApis` re-searches the catalog with every one of them before a row is ever
 * written, which is the job those files claim for them. This governs storage alone.
 */
const _vocabularyIn = (hits: readonly LookupHit[], locale: Locale) =>
  _statedIn(hits.filter((hit) => !hit.searched), locale);

/** The names the gates below score against, as `aboutTheSameFood` wants them. */
const _namesByLocale = (facts: z.infer<typeof _modelFactsSchema>) =>
  Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, _catalogName(facts.names[locale])]),
  ) as Record<Locale, string>;

/**
 * How a name in one language got there.
 *
 * `"edited"` for a name a SOURCE stated in that language, `"machine"` for one the model rendered,
 * and the distinction is not cosmetic: `edited` is what forbids replacing a name later with a
 * better translation, so claiming it for a spelling nobody authored freezes an invention. CIQUAL's
 * French and USDA's English are authored; the language neither of them covered is not.
 */
const _statusOf = (name: string, stated: readonly string[]): TranslationStatus =>
  stated.some((spelling) => spelling.toLowerCase() === name.toLowerCase()) ? "edited" : "machine";

/**
 * The name as the catalog writes it: lowercase, trimmed.
 *
 * **Enforced here rather than asked for, because the prompt asks for both.** It says the name is
 * lowercase, and it says to prefer a source's stated spelling — and a food database states
 * "Sauce Worcestershire", capitalised, because that is how a heading is written. The prompt now
 * resolves that in prose too, but a rule a screen depends on should not be a rule a model can
 * decline: five of eight models in a bake-off kept the capital, at every reasoning effort.
 *
 * It reaches the screen, which is why it matters at all — `searchTextOf` lowercases the search
 * blob, so lookup was never affected, and `_statusOf` compares case-insensitively, so provenance
 * is not either. What was affected is a shopping list reading "Sauce Worcestershire" beside
 * "carotte".
 */
const _catalogName = (name: string) => name.trim().toLowerCase();

/**
 * The unit repaired to one the row can actually be weighed in, or `undefined` when it cannot be.
 *
 * Nutrition is stored per 100g, so a line whose unit cannot reach grams contributes NOTHING to a
 * recipe's total — a dish quietly missing its olive oil reads as a health food, with no error
 * anywhere. That rule has not changed; where it is applied has. It used to be a `.refine()` on the
 * facts object, which discarded the ENTIRE row over one missing ratio (see the note there).
 *
 * A volume with no density is repairable and is repaired: water's 1.0 is wrong by at most a third
 * for anything a recipe pours, against a row lost completely, and a spoonful of sauce weighed 15 g
 * instead of 17 g is a rounding error next to an ingredient with no allergens recorded at all.
 *
 * `pcs` with no piece weight is NOT repairable — an onion is 150 g and a bay leaf is 0.1 g, and
 * there is no default between them that is not an invention — so that one still fails, loudly and
 * by name. Written through `toGrams` rather than a hand-listed set of volume units, so the rule and
 * the conversion can never disagree about which unit needs which ratio.
 */
const _weighable = (facts: z.infer<typeof _modelFactsSchema>) => {
  const ratios = {
    gramsPerPiece: facts.gramsPerPiece ?? undefined,
    gramsPerMl: facts.gramsPerMl ?? undefined,
  };

  if (toGrams(facts.defaultQuantity, facts.defaultUnit, ratios) !== undefined) return ratios;

  const repaired = { ...ratios, gramsPerMl: 1 };

  return toGrams(facts.defaultQuantity, facts.defaultUnit, repaired) === undefined
    ? undefined
    : repaired;
};

/**
 * The model's answer as a `SanitizedIngredient`, with everything a lookup MEASURED laid back over
 * the top of it.
 *
 * Pure, and separate from `execute` for that reason: this is the half of the tool that can be
 * wrong in a way no schema catches, and it is testable with no model in the loop.
 *
 * Two merges happen here and they are the same bargain `measuredOver` documents — a modelled value
 * survives only where nothing measured that field:
 *
 * - **nutrition**: `measuredOver`, in source-authority order.
 * - **names**: the model's word wins, because a laboratory description ("carrot, raw, unpeeled")
 *   is not what a shop calls it — but a name it took verbatim from a source is marked as authored,
 *   and every spelling a source stated that it did NOT pick becomes an alias, so the row is still
 *   findable under the dictionary's word.
 */
export const toSanitizedIngredient = (
  raw: unknown,
  hits: readonly LookupHit[] = [],
): SanitizedIngredient => {
  const answer = parseModelOutput(modelIngredientSchema, raw);

  if (answer.verdict !== "ingredient") return { verdict: "refused", reason: answer.verdict };

  // `facts` is absentable, so a row that failed one of the schema's own rules arrives as undefined
  // rather than as a parse error — `_clean` drops it silently. Both mean the same thing to the
  // caller (the model did not produce a usable row) and both are worth another attempt, which is
  // what throwing buys. What the bare throw did NOT buy was any way to tell which rule broke, and
  // an operator reading "no usable row" three times in a log cannot act on it. So the object is
  // re-validated on the way to the error purely to name the field.
  //
  // ⚠️ `null` is answered BEFORE the re-parse, because the re-parse cannot answer it. `facts` is
  // nullable outbound — `providerSchema` requires the key and lets the model write null in it —
  // so "ingredient, and no row" is a shape the model is permitted to emit and does emit. Fed to
  // the non-nullable `_modelFactsSchema`, that reads back as `expected object, received null`,
  // which names a type mismatch this side invented rather than anything the model got wrong.
  if (!answer.facts) {
    const written = (raw as { facts?: unknown } | null)?.facts;
    const broke = written == null ? undefined : _modelFactsSchema.safeParse(written).error;
    const why =
      written === null ? "the model wrote null for facts while answering \"ingredient\""
        : written === undefined ? "facts was missing entirely"
          : broke ? z.prettifyError(broke)
            : "the row parsed here but was dropped on the way in";

    throw new Error(`sanitizeIngredient: verdict was ingredient with no usable row — ${why}`);
  }

  const facts = answer.facts;

  // Repaired rather than rejected: a missing density costs a row nothing now (see `_weighable`).
  const ratios = _weighable(facts);

  if (!ratios)
    throw new Error(
      `sanitizeIngredient: defaultUnit "${facts.defaultUnit}" needs a gramsPerPiece to weigh it, ` +
      "and there is no default weight for one of something",
    );

  const byLocale = _namesByLocale(facts);

  // Everything below reads THIS list rather than `hits`: figures measured on another food are
  // dropped here, so neither `measuredOver` nor `provenanceOf` can be told about them.
  const measured = measuredAboutIt(hits, byLocale);

  const names = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => {
      const name = byLocale[locale];

      // Every hit, Open Food Facts included — deliberately wider than `_vocabularyIn` below,
      // because this asks a different question. Storing a product title as vocabulary is what
      // that list refuses; a product title that matches the name EXACTLY is a person having
      // written this food's name in this language, which is all `edited` claims.
      return [locale, { value: name, status: _statusOf(name, _statedIn(hits, locale)) }];
    }),
  ) as IngredientFacts["names"];

  const aliases = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => {
      const name = byLocale[locale];
      const seen = new Set([name]);
      const kept: string[] = [];

      // Model's own spellings first and FIRST-WINS on a duplicate, so the word it chose is the one
      // stored — a source shouting "CARROTS" must not overwrite the alias the model wrote.
      //
      // **Neither half is scored for resemblance, and that is not an oversight.** A synonym is a
      // fact about language, not about spelling: `zucchini` scores 0.044 against `courgette`,
      // `eggplant` 0.044 against `aubergine`, `arugula` 0.057 against `rocket`. Putting either
      // list through `SAME_FOOD` deletes precisely the aliases that earn their keep — the whole
      // point of storing a synonym is that somebody who types it does not type the name.
      //
      // What keeps junk out here is `_vocabularyIn`, which is a rule about how a source found its
      // answer rather than about how the answer reads. A keyword search never contributes a word,
      // so `Dulce de Leche` cannot arrive; what does arrive was filed under this food by hand, and
      // a curated synonym that looks nothing like the name is the normal case, not the suspect one.
      const offered = [
        ...(facts.aliases[locale] ?? []),
        ..._vocabularyIn(hits, locale),
      ];

      for (const alias of offered) {
        const spelling = alias.trim();
        if (!spelling || seen.has(spelling.toLowerCase())) continue;

        seen.add(spelling.toLowerCase());
        kept.push(spelling);
      }

      return [locale, kept];
    }),
  ) as LocalizedList;

  return {
    verdict: "new",
    facts: {
      names,
      aliases,
      emoji: facts.emoji,
      category: facts.category,
      diet: facts.diet,
      // The fourteen answers folded back into the list the column stores. `madeFrom` is dropped
      // here and nowhere else: it exists to be in the model's context when it answered these two,
      // and it has no meaning once they are answered.
      allergens: _allergensOf(facts.allergens),
      defaultUnit: facts.defaultUnit,
      defaultQuantity: facts.defaultQuantity,
      ...ratios,
      nutrition: measuredOver(facts.nutrition, measured),
    },
    // Decided here rather than by the caller, because it is a claim ABOUT the numbers above and
    // has to be read off the same filtered list they were built from. Computed a second time from
    // the raw hits, it stamped a laboratory's provenance on a row whose figures had just been
    // dropped for belonging to another food (ADR 0011).
    source: provenanceOf(measured),
  };
};

/**
 * What the row-writing call is shown: the term, and everything the cheap steps already learned.
 *
 * Exported so the bake-off scores the prompt the tool actually sends. A copy kept in step by hand
 * is a copy that drifts, and a bake-off measuring a prompt nothing ships answers nothing.
 */
export const sanitizeIngredientUserPrompt = ({ text, hits = [] }: SanitizeIngredientInput) =>
  [
    `The shopper typed:\n${text}`,
    hits.length &&
    `What other sources say about it — names to prefer, figures that will be kept over yours:\n${JSON.stringify(hits, null, 2)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

/**
 * Good enough to hand a shopper a row they did not ask for.
 *
 * Higher than the catalog's own `CONFIDENT`, and deliberately: the candidates reaching here are the
 * ones `resolveIngredient` already declined to link on its score, so a model overruling that has to
 * be sure rather than merely warmer than the search was. Below it the answer is "no match", and the
 * cost of that is one generation — against a wrong link, which puts the wrong food on a shopping
 * list and never announces itself.
 *
 * Exported because the ranker's bake-off has to flag an answer against the SAME bar the tool
 * applies — a 0.8 written out a second time in a test is a bar that moves in one place only.
 */
export const MATCHED = 0.8;

/**
 * A term the catalog could not resolve, turned into an existing row, a new one, or an honest
 * refusal — step 4 of `resolveIngredient`.
 *
 * **Two model calls, cheapest first, and the first may end it.** The ranker is asked whether one of
 * the near-misses the catalog search already found is the same food; only if it is not does the
 * expensive call invent a row. Splitting them is not just about cost: a model that has begun
 * writing facts for a new ingredient will talk itself past a match that was sitting in the list.
 *
 * Nothing is written down — `saveMessages: "none"` on both, for the reason `sanitizeRecipe` gives:
 * this is a transformation, not a conversation, and nothing later needs to recall the word a
 * shopper typed into a search bar.
 *
 * ⚠️ **It writes no row.** It returns facts; `createIngredient` is what inserts one, through
 * `ingredientRow` like every other writer (ADR 0011).
 */
export const sanitizeIngredient = createTool({
  description:
    "Decide what a shopper's unrecognised food term is: a catalog row that already exists under " +
    "another spelling or another language, a new ingredient worth adding — with its names, " +
    "vocabulary and per-100g nutrition — or something that is not an ingredient at all.",
  inputSchema: _inputSchema,
  execute: async (ctx, args): Promise<SanitizedIngredient> => {
    const candidates = args.candidates ?? [];

    if (candidates.length) {
      const matchSchema = matchIngredientSchema(candidates.length);

      const ranked = await retryPromise(() =>
        wrapAgent(rankerAgent).generateObject(
          ctx,
          {},
          {
            system: matchIngredientPrompt(args.locale),
            prompt: matchIngredientUserPrompt(args),
            schema: providerSchema(matchSchema),
            output: "object",
            maxRetries: 2,
          },
          { storageOptions: { saveMessages: "none" } },
        ), 2);

      const match = parseModelOutput(matchSchema, ranked.object);
      const candidate = match.matchIndex === undefined ? undefined : candidates[match.matchIndex];

      if (candidate && (match.confidence ?? 0) >= MATCHED)
        // The one cast in this file, and it is not a model's id: `candidate` came out of the list
        // the caller passed in, so the string is an id the caller already held (ADR 0010).
        return {
          verdict: "existing",
          ingredientId: candidate.id as Id<"ingredients">,
          name: candidate.name,
          // Read strictly as `=== true`, so the two shapes that mean "the model did not say"
          // (absent, and an explicit null) both mean no. See the field's note: a wrong false costs
          // one model call the next time this term is typed, and a wrong true is permanent.
          saveAlias: match.saveAlias === true,
        };
    }

    // **The parse is INSIDE the retry, and that is the point of the closure.** `facts` is nullable
    // outbound, so `{ verdict: "ingredient", facts: null }` satisfies the schema the model
    // generated against — `maxRetries` never sees a failure, because by the provider's reckoning
    // there wasn't one. The only place that shape is refused is `toSanitizedIngredient`, so
    // leaving it outside spent one model call and gave the shopper an error card for a slip the
    // next call would very likely not repeat. Nothing here is stateful: the pure half re-runs on
    // a fresh answer, which is what an attempt is supposed to mean.
    return await retryPromise(async () => {
      const result = await wrapAgent(ingredientsAgent).generateObject(
        ctx,
        {},
        {
          system: sanitizeIngredientPrompt(args.locale),
          prompt: sanitizeIngredientUserPrompt(args),
          schema: providerSchema(modelIngredientSchema),
          output: "object",
          maxRetries: 3,
        },
        { storageOptions: { saveMessages: "none" } },
      );

      // `wrapAgent` erases the schema's type on the way through (it re-types the agent to call the
      // wrapped methods), so the object arrives as JSON. Parsing here is what restores the contract
      // `toSanitizedIngredient` pins — the model already generated against this schema, so it is a
      // cast that cannot silently be wrong.
      return toSanitizedIngredient(result.object, args.hits as LookupHit[] | undefined);
    }, 2);
  },
});
