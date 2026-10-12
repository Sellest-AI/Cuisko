import type { ToolCtx } from "@convex-dev/agent";
import * as z from "zod/v4";

import type { IngredientFacts } from "@convex/functions/ingredients/ingredientRow";
import {
  measuredAboutIt,
  measuredOver,
  NUTRITION_FIELDS,
  provenanceOf,
  curatedSpellingsIn,
  type LookupHit,
} from "@convex/functions/ingredients/lookup/lookupHit";
import type { LocalizedList, TranslationStatus } from "@convex/schema/i18n";
import { ALLERGENS, type Allergen } from "@shared/allergens";
import { CATEGORIES } from "@shared/categories";
import { DIETS } from "@shared/diets";
import { retryPromise } from "@shared/helpers";
import {
  INGREDIENT_SOURCES,
  RECIPE_UNITS,
  toGrams,
  UNITS,
  type GramWeights,
  type IngredientSource,
  type RecipeUnit,
} from "@shared/ingredients";
import { SUPPORTED_LOCALES, type Locale } from "@shared/translations";

import { ingredientsAgent } from "../agents";
import { sanitizeIngredientPrompt } from "../config/prompts/sanitizeIngredient";
import { createTool, modelText, parseModelOutput, providerSchema, wrapAgent } from "../utils";

/**
 * What the agent made of a term nothing could resolve: a new row's facts, or an honest refusal.
 *
 * Whether the term is a row the catalog already holds is decided before this runs, by
 * `resolveWithAgent`, so no id crosses this boundary in either direction (ADR 0010).
 */
export type SanitizedIngredient =
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
 * `"true"` / `"false"` in any case and padding, from a provider that quotes its booleans, as the
 * boolean it quotes. Anything else passes through untouched for `z.boolean()` to refuse.
 */
const _unquoted = (value: unknown) => {
  const word = typeof value === "string" ? value.trim().toLowerCase() : undefined;

  return word === "true" ? true : word === "false" ? false : value;
};

/** One allergen's answer: a boolean, quoted or not, and nothing else. */
const _yesOrNo = (description: string) => z.preprocess(_unquoted, z.boolean()).describe(description);

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
 * **Strict per key, NOT the `.nullable().optional()` the rest of the file uses.** Elsewhere a
 * malformed field costs that field; here it costs the call. A `"yes"`, an `"ok"`, a `null` or a
 * missing key has no safe reading — a no prints "gluten-free" on barley malt vinegar, a yes prints
 * a warning nobody claimed — so the SDK's validation refuses it and `retryPromise` asks again.
 * Only a quoted boolean is read, because it is still a yes or a no.
 *
 * The outbound type is a plain `boolean`, never `boolean | null`: nullable, the fourteen keys were
 * fourteen of the 21 union-typed parameters that made Anthropic refuse the schema outright (its
 * limit is 16). A preprocess rather than `.catch(false)`, which emits `"default": false` — a
 * keyword strict structured output is not documented to accept, and a silent "no" on the one
 * field where a wrong "no" prints "gluten-free".
 */
const _allergenChecklist = z.object(
  Object.fromEntries(
    ALLERGENS.map((allergen) => [
      allergen,
      _yesOrNo(`true if this ingredient contains ${allergen}, false if it does not.`),
    ]),
  ) as { [K in Allergen]: ReturnType<typeof _yesOrNo> },
);

/** The checklist as the column stores it. */
const _allergensOf = (checklist: z.infer<typeof _allergenChecklist>): Allergen[] =>
  ALLERGENS.filter((allergen) => checklist[allergen]);

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
      "Per language, every other spelling of THIS product someone would plausibly write — the " +
      "form in each word order (\"en poudre\", \"moulu\", \"dried\"), the shop's word, the " +
      "regional word, the plural, the common misspelling. A missing spelling becomes a duplicate " +
      "row later. Never a neighbouring product, and NOT translations; those are the names.",
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
      `The unit a recipe writes this in. "tbsp" and "tsp" are the metric tablespoon and teaspoon, ` +
      '15 ml and 5 ml; "pcs" is a countable single thing AS SOLD — a loaf, a head of garlic. ' +
      "A row is stocked in what the shop hands over, never in slices. What a cook would write, " +
      "not what converts most neatly.",
    ),
    defaultQuantity: z.number().positive().describe("How much one recipe line typically calls for."),
    gramsPerPiece: z.number().positive().nullable().optional().describe(
      "What ONE of them weighs, in grams — 150 for an onion, 5 for a garlic clove, 250 for a " +
      "baguette. Left out for anything there is no single one of (flour, oil, milk).",
    ),
    gramsPerSlice: z.number().positive().nullable().optional().describe(
      "What ONE SLICE of it weighs, in grams — 35 for a slice of baguette, 30 for a slice of " +
      "cheese, 20 for a slice of ham. Only for something sold whole and eaten cut; left out for " +
      "anything nobody slices (an onion, garlic, a spice, a liquid).",
    ),
    gramsPerMl: z.number().positive().nullable().optional().describe(
      "The density — 0.91 for oil, 1.42 for honey. Left out for anything nobody measures by " +
      "volume (a chicken, a carrot).",
    ),
    edibleShare: z.number().positive().nullable().optional().describe(
      "The share of the weight AS SOLD that is eaten, between 0 and 1 — 0.4 for mussels in their " +
      "shells, 0.7 for a bone-in chicken thigh, 0.7 for a whole chicken. 1 for anything eaten " +
      "whole or sold already trimmed, which is most foods.",
    ),
    shelfLifeDays: z.number().positive().nullable().optional().describe(
      "Days it keeps UNOPENED, in the form a shop usually sells it and stored the normal way — " +
      "365 for canned chopped tomatoes (a tin), 90 for milk (a UHT carton), 7 for fresh " +
      "tomatoes, 730 for dried pasta. The short end of the real range, not shorter.",
    ),
    openedShelfLifeDays: z.number().positive().nullable().optional().describe(
      "Days it keeps once OPENED or cut — 5 for that tin of tomatoes, 3 for the milk, 2 for a " +
      "cut tomato, 365 for opened dried pasta. Never more than shelfLifeDays.",
    ),
    nutrition: _nutritionSchema.describe(
      "Per 100g of the RAW part that is EATEN — the meat, not the shell or the bone: calories in " +
      "kcal, the rest in grams, and sodium in MILLIGRAMS — sodium, not salt, which is 2.5x more.",
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
  // permission to read a missing key — so `parseModelOutput` drops a refused or invalid row as an
  // absent key, the way every other absentable field here goes absent. Nullable alone would keep
  // it as `null` instead.
  facts: _modelFactsSchema.nullable().optional()
    .describe("The catalog row. null unless the verdict is \"ingredient\"."),
});

/**
 * The evidence the three cheap steps of `resolveIngredient` already gathered, mirrored in zod.
 *
 * A mirror rather than the type itself because `createTool` needs a runtime schema, and
 * `_evidenceCheck` below is what stops the mirror drifting: `LookupHit` gaining a field the tool
 * never sees would otherwise be silent.
 */
const _titleSchema = z.object({ name: z.string(), locale: z.enum(SUPPORTED_LOCALES).optional() });

const _measuredSchema = z.object(
  Object.fromEntries(
    NUTRITION_FIELDS.map((field) => [field, z.number().optional()]),
  ) as { [K in (typeof NUTRITION_FIELDS)[number]]: z.ZodOptional<z.ZodNumber> },
);

const _hitSchema = z.object({
  source: z.enum(INGREDIENT_SOURCES),
  names: _perLocale(z.array(z.string()).optional()),
  untagged: z.array(z.string()).optional(),
  searched: z.boolean().optional(),
  // Not decoration: `_inputSchema` PARSES what the tool is handed, and zod drops what it does not
  // declare. Omitted here, `measuredAs` would arrive as undefined however carefully the lookups
  // filled it, and `measuredAboutIt` would read every hit as one its source vouched for.
  measuredAs: z.array(_titleSchema).optional(),
  nutrition: _measuredSchema.optional(),
  // Declared for the reason `measuredAs` is: dropped, `measuredAboutIt` would re-judge on spelling
  // the figures Jev already picked. Set by `pickMeasuredFood`, whose caller is `resolveWithAgent`.
  // A source's `candidates` are not declared: the page is judged before the tool, never in it.
  judged: z.boolean().optional(),
});

const _inputSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES).describe("The language the shopper typed in."),
  text: z.string().describe("What the shopper typed, verbatim."),
  hits: z
    .array(_hitSchema)
    .optional()
    .describe("What the taxonomy, CIQUAL and the two live APIs said about this term."),
  units: z
    .array(z.enum(RECIPE_UNITS))
    .optional()
    .describe(
      "The unit(s) the recipe line(s) that asked for this row are written in. The row must be " +
      "weighable in each of them, not only in its own defaultUnit. Empty for a shopper's typing.",
    ),
});

/** Everything the tool is handed. Named because the two prompt builders below both take it. */
export type SanitizeIngredientInput = z.infer<typeof _inputSchema>;

/** Every spelling a hit stated for one language, lowercased for comparison. */
const _statedIn = (hits: readonly LookupHit[], locale: Locale) =>
  hits.flatMap((hit) => hit.names[locale] ?? []);

// The two compile-time assertions ADR 0010 asks for: the schema and the hand-written types drift
// apart in silence otherwise — a vocabulary gains a value, a lookup gains a field, and the first
// symptom is a row the column rejects at insert time.
type _FactsCheck = z.infer<typeof _modelFactsSchema> extends Omit<
  IngredientFacts,
  | "slug" | "names" | "aliases" | "allergens" | "gramsPerPiece" | "gramsPerSlice" | "gramsPerMl"
  | "edibleShare" | "shelfLifeDays" | "openedShelfLifeDays"
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
 * The ratios the row can be weighed with in every unit it has to answer, or the first unit it
 * cannot be weighed in.
 *
 * Nutrition is stored per 100g, so a line whose unit cannot reach grams contributes NOTHING to a
 * recipe's total — a dish quietly missing its olive oil reads as a health food, with no error
 * anywhere. That rule has not changed; where it is applied has. It used to be a `.refine()` on the
 * facts object, which discarded the ENTIRE row over one missing ratio (see the note there).
 *
 * **Every unit in `units` is required, not only `defaultUnit`.** No lookup source ever supplies a
 * ratio — the taxonomy, CIQUAL and the two APIs ship names and per-100g figures — so the model is
 * the only place a piece weight or a density ever comes from, and it used to be asked only about
 * the unit it had chosen itself. A row invented for `1 tsp garam masala` was therefore born in `g`
 * with no density, and the line that paid for it could not be weighed; 49 of 74 recipes on dev
 * had one such line. The caller that knows the line's unit hands it in, and the row is not usable
 * until it can weigh that unit too.
 *
 * A volume with no density is repairable and is repaired: water's 1.0 is wrong by at most a third
 * for anything a recipe pours, against a row lost completely, and a spoonful of sauce weighed 15 g
 * instead of 17 g is a rounding error next to an ingredient with no allergens recorded at all.
 *
 * `pcs` with no piece weight is NOT repairable — an onion is 150 g and a bay leaf is 0.1 g, and
 * there is no default between them that is not an invention — so that one still fails, loudly and
 * by name. `slice` with no slice weight fails the same way, for the same reason: a slice of ham and
 * a slice of bread share nothing. Written through `toGrams` rather than a hand-listed set of volume
 * units, so the rule and the conversion can never disagree about which unit needs which ratio.
 */
const _weighable = (
  facts: z.infer<typeof _modelFactsSchema>,
  units: readonly RecipeUnit[],
): { ratios: GramWeights } | { unweighable: RecipeUnit } => {
  const stated: GramWeights = {
    gramsPerPiece: facts.gramsPerPiece ?? undefined,
    gramsPerSlice: facts.gramsPerSlice ?? undefined,
    gramsPerMl: facts.gramsPerMl ?? undefined,
  };
  const required: RecipeUnit[] = [...new Set<RecipeUnit>([facts.defaultUnit, ...units])];
  const failing = (ratios: GramWeights) =>
    required.find((unit) => toGrams(1, unit, ratios) === undefined);

  if (failing(stated) === undefined) return { ratios: stated };

  // The net, never a default: a stated density survives it.
  const repaired = { ...stated, gramsPerMl: stated.gramsPerMl ?? 1 };
  const unweighable = failing(repaired);

  return unweighable === undefined ? { ratios: repaired } : { unweighable };
};

/**
 * The two shelf lives as the row stores them: whole days, and opened never above sealed.
 *
 * **Repaired rather than refused**, for the reason `_weighable` repairs a density: a date is a
 * rough hint about what to cook first, and losing a row's allergens over one is the wrong trade.
 * So a 3.5 rounds to 4 (never below 1), and an opened figure above the sealed one is clamped down
 * to it — opening a pack never makes it keep longer, and the sealed figure is the one a model is
 * more often right about. A figure the model left out stays out: an undated purchase reads as
 * "not urgent", which is what it should read as when nobody knows.
 */
const _shelfLifeOf = (
  facts: z.infer<typeof _modelFactsSchema>,
): Pick<IngredientFacts, "shelfLifeDays" | "openedShelfLifeDays"> => {
  const days = (value: number | null | undefined) =>
    value == null ? undefined : Math.max(1, Math.round(value));

  const shelfLifeDays = days(facts.shelfLifeDays);
  const opened = days(facts.openedShelfLifeDays);

  return {
    shelfLifeDays,
    openedShelfLifeDays:
      opened !== undefined && shelfLifeDays !== undefined ? Math.min(opened, shelfLifeDays) : opened,
  };
};

/**
 * The share of the row that is eaten, as the column stores it: a number below 1, or absent.
 *
 * **Absent rather than refused**, for the reason `_shelfLifeOf` repairs a date: absent is the whole
 * of it, which is what every row counted before shares existed, so a share the model left out or
 * got wrong costs the row only the shells it keeps counting. Zero and below never arrive here (the
 * schema's `.positive()` drops them); above 1 is dropped here, because more eaten than bought is a
 * slip — most likely a percentage — and guessing which is an invention. Exactly 1 is written as
 * absent too, so "all of it" has one spelling on every row, seeded or not.
 */
const _edibleShareOf = (
  facts: z.infer<typeof _modelFactsSchema>,
): Pick<IngredientFacts, "edibleShare"> => {
  const share = facts.edibleShare;

  return { edibleShare: share != null && share < 1 ? share : undefined };
};

/**
 * The ratio a unit that cannot be repaired is missing, for the error that names it. Only `pcs` and
 * `slice` reach here: a volume is repaired with water's density before it can fail.
 */
const _ratioFor = (unit: RecipeUnit): keyof GramWeights =>
  unit === "slice" ? "gramsPerSlice" : "gramsPerPiece";

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
  units: readonly RecipeUnit[] = [],
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
  const weighed = _weighable(facts, units);

  if ("unweighable" in weighed)
    throw new Error(
      `sanitizeIngredient: unit "${weighed.unweighable}" needs a ${_ratioFor(weighed.unweighable)} ` +
      "to weigh it, and there is no default weight for one of something",
    );

  const { ratios } = weighed;

  const byLocale = _namesByLocale(facts);

  // Everything below reads THIS list rather than `hits`: figures measured on another food are
  // dropped here, so neither `measuredOver` nor `provenanceOf` can be told about them.
  const measured = measuredAboutIt(hits, byLocale);

  const names = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => {
      const name = byLocale[locale];

      // Every hit, Open Food Facts included — deliberately wider than `curatedSpellingsIn` below,
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
      // What keeps junk out here is `curatedSpellingsIn`, which is a rule about how a source found
      // its answer rather than about how the answer reads. A keyword search never contributes a
      // word, so `Dulce de Leche` cannot arrive; what does arrive was filed under this food by hand,
      // and a curated synonym that looks nothing like the name is the normal case, not the suspect.
      const offered = [
        ...(facts.aliases[locale] ?? []),
        ...curatedSpellingsIn(hits, locale),
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
      ..._edibleShareOf(facts),
      ..._shelfLifeOf(facts),
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
export const sanitizeIngredientUserPrompt = ({ text, hits = [], units = [] }: SanitizeIngredientInput) =>
  [
    `The shopper typed:\n${text}`,
    hits.length &&
    `What other sources say about it — names to prefer, figures that will be kept over yours:\n${JSON.stringify(hits, null, 2)}`,
    units.length &&
    `A recipe line writes this in: ${[...new Set(units)].join(", ")}. The row MUST carry the ` +
    "ratio that weighs each of these units, whatever defaultUnit you choose.",
  ]
    .filter(Boolean)
    .join("\n\n");

/**
 * A term nothing could resolve, turned into a new row's facts or an honest refusal — the last half
 * of step 4 of `resolveIngredient`.
 *
 * **Only a row, and only once nothing else answered.** By the time this runs `resolveWithAgent`
 * has asked Jev whether a near-miss in the catalog is already the food, and which of each source's
 * search results its figures were measured on (`matchIngredient`, `pickMeasuredFood`). Keeping the
 * match out is not just about cost: a model that has begun writing facts for a new ingredient will
 * talk itself past a match that was sitting in the list.
 *
 * Nothing is written down — `saveMessages: "none"` on the row call, for the reason `sanitizeRecipe` gives:
 * this is a transformation, not a conversation, and nothing later needs to recall the word a
 * shopper typed into a search bar.
 *
 * ⚠️ **It writes no row.** It returns facts; `createIngredient` is what inserts one, through
 * `ingredientRow` like every other writer (ADR 0011).
 */
export const sanitizeIngredient = createTool({
  description:
    "Decide what a shopper's unrecognised food term is: a new ingredient worth adding — with its " +
    "names, vocabulary and per-100g nutrition — or something that is not an ingredient at all.",
  inputSchema: _inputSchema,
  execute: async (ctx: ToolCtx, args): Promise<SanitizedIngredient> =>
    // **The parse is INSIDE the retry, and that is the point of the closure.** `facts` is nullable
    // outbound, so `{ verdict: "ingredient", facts: null }` satisfies the schema the model
    // generated against — `maxRetries` never sees a failure, because by the provider's reckoning
    // there wasn't one. The only place that shape is refused is `toSanitizedIngredient`, so
    // leaving it outside spent one model call and gave the shopper an error card for a slip the
    // next call would very likely not repeat. Nothing here is stateful: the pure half re-runs on
    // a fresh answer, which is what an attempt is supposed to mean.
    await retryPromise(async () => {
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
      return toSanitizedIngredient(result.object, args.hits as LookupHit[] | undefined, args.units);
    }, 2),
});
