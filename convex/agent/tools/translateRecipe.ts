import { SUPPORTED_LOCALES, type Locale } from "@shared/translations";
import z from "zod/v4";
import { modelRecipeSchema } from "./sanitizeRecipe";
import { type InstructionGroup, toInstructionGroups } from "@shared/recipes";
import { createTool, parseModelOutput, providerSchema, wrapAgent, type TracedToolCtx } from "../utils";
import { retryPromise } from "@shared/helpers";
import { translatorAgent } from "../agents";
import { translateRecipePrompt } from "../config/prompts/translateRecipe";
import { TAGS } from "@shared/tags";

/**
 * One optional string per supported locale, keyed by the locale.
 *
 * The keys are derived from `SUPPORTED_LOCALES` rather than written out, so adding a language does
 * not leave this shape silently one column short — the same reason `convex/schema/i18n.ts` guards
 * its own `perLocale` with a compile-time check.
 *
 * A `z.object` and not a `z.record` keyed by an enum: `providerSchema` walks `object`, `array`,
 * `optional` and `nullable` and passes everything else through untouched, so a record would reach
 * the provider with its children un-rewritten and as `additionalProperties`/`propertyNames`, which
 * OpenAI's strict structured output refuses.
 *
 * Every locale is `.optional()` because the catalog this is filled from stores its names that way
 * — `vLocalized.values` is one optional string per locale — so a name the catalog has never been
 * translated into is genuinely absent, not empty.
 */
const _localizedName = z.object(
  Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, z.string().optional()]),
  ) as { [K in Locale]: z.ZodOptional<z.ZodString> },
);

/**
 * One recipe rendered into one target language. The locale travels WITH the recipe rather than
 * beside it in a parallel array: the model returns the languages in whatever order it worked
 * through them, and a caller matching by index would silently file a German recipe under `fr`.
 *
 * `L` is the set of locales that were ASKED for. A caller that named them — `run(ctx, { locales:
 * ["fr"] })` — gets `TranslatedRecipe<"fr">` back and can read `.locale` as the literal it passed,
 * so a `switch` over the result is exhaustive at the two locales it requested rather than at every
 * locale the app supports. It defaults to `Locale` for the model-driven path, where the locales are
 * only known at run time.
 */
export type TranslatedRecipe<L extends Locale = Locale> = {
  locale: L;
  recipe: {
    title: string;
    description: string;
    instructions: InstructionGroup[];
  };
};

/**
 * The recipe as translation is HANDED it: `modelRecipeSchema`, with its ingredient list swapped for
 * one that is already multilingual.
 *
 * The base schema is `sanitizeRecipe`'s output, where an ingredient is `{ name, quantity, unit }` in
 * whatever language the cook wrote. That is the right shape coming out of sanitizing and the wrong
 * one going into translating: a model reading a French ingredient list has to guess the English
 * word for every ingredient a step mentions, and it guesses differently in step two than in step
 * five. The catalog already knows those words — `ingredients.name` is a `vLocalized` — so the
 * caller resolves them once and passes them in as fact.
 *
 * The names sit TOGETHER on one row rather than as one list per locale (`{ en: [...], fr: [...] }`),
 * because a row is one ingredient and a per-locale list is the same ingredient counted twice.
 *
 * NO QUANTITY, AND NO UNIT, and that is the whole point of this shape rather than an oversight.
 * A row's quantity is the recipe's TOTAL for that ingredient, which is not the number any one step
 * names — gochujang totalling 4 tbsp is 3 tbsp in one step and 1 tbsp in another. Sending it beside a
 * list the prompt calls the authority is an invitation, and the bake-off took it: two unrelated
 * models rewrote "3 cda de gochujang" as 4, in four runs, and `CHECKS` caught every one. A rule
 * saying "ignore this field" competes with the field being there and loses; deleting the field
 * does not. The unit goes for the same reason and buys nothing either way — a step that names a
 * unit already carries it inline, and a step that names none must not gain one.
 *
 * What is left is a glossary: look the word up, write the word down.
 */
export const modelRecipeSchemaExtended = modelRecipeSchema.extend({
  tags: z.array(z.enum(TAGS)),
  ingredients: z.array(
    z.object({
      names: _localizedName.describe(
        "What this ingredient is called in each language, as resolved from the catalog. This is " +
        "the authority: a step naming this ingredient uses the word listed here for the language " +
        "it is being written in, not a word chosen on the spot. A language missing from this " +
        "object is one the catalog has no name for — translate that one yourself, and use the " +
        "same word every time it appears. " +
        "Add the original language's name too, so the model can see what it is translating from.",
      ),
    }),
  ).describe(
    "The ingredient list as a GLOSSARY of names, already translated. It carries no quantity and " +
    "no unit: every number and every unit comes from the step being translated. It is CONTEXT, " +
    "not something to return — it is here so that the steps and the list a cook sees beside them " +
    "agree on what each ingredient is called.",
  ),
});

/** The three fields translation touches. Everything else about a recipe is language-independent. */
const outputRecipeSchema = modelRecipeSchema.pick({
  title: true,
  description: true,
  instructions: true,
})

/**
 * The WHOLE recipe, which is more than translation returns — and deliberately so.
 *
 * Only three fields carry language on the way OUT, so only three come back. The rest go IN as
 * context: the ingredient list is what names an ingredient a step refers to, and a model that
 * cannot see it translates "les oignons nouveaux" as spring onions in one step and scallions in
 * the next, next to a catalog row that says one of the two. Cuisine and tags set the register a
 * dish is written in. None of it is free — it is tokens on every recipe, once per language — and
 * it buys agreement between the steps and the list beside them.
 *
 * The list arriving already multilingual is what turns that agreement from a hope into a lookup:
 * the model is not choosing the English word for "cebolleta", it is reading it.
 */
export type TranslatableRecipe = z.infer<typeof modelRecipeSchemaExtended>;

/**
 * The shape the model is constrained to, for one specific set of target languages.
 *
 * A function of `locales` rather than a constant, and that is what makes the narrowing real: the
 * enum admits exactly the locales that were asked for, so an answer carrying a supported-but-not-
 * requested language is rejected at the parse rather than stored under a language nobody wanted.
 *
 * The array is wrapped in an object because a bare array cannot be a root schema — OpenAI's
 * structured output requires the root to be of type `object` and refuses anything else outright.
 *
 * The ingredient list is NOT in here, and that is the point of handing it in already translated:
 * every language's word for every ingredient is settled before the call, so asking for it back
 * would be paying a model to restate what the catalog already said — and giving it the chance to
 * say something else.
 */
export const modelTranslationsSchema = <L extends Locale>(locales: readonly L[]) => z.object({
  translations: z.array(z.object({
    locale: z.enum(locales).describe("The locale this entry is the translation into."),
    recipe: outputRecipeSchema,
  }))
    .describe(`One entry per requested locale — ${locales.join(", ")} — in any order.`)
    // Counting is enough BECAUSE of the enum above: every locale in the array is already one that
    // was asked for, so as many entries as there are locales, no two the same, can only be all of
    // them. Without this a model answering in one language out of two produces a recipe that is
    // silently missing a translation — the one failure downstream cannot detect, because nothing
    // else knows the recipe was supposed to exist in that language.
    .refine(
      (translations) =>
        translations.length === locales.length &&
        new Set(translations.map(({ locale }) => locale)).size === translations.length,
      { message: `Expected exactly one translation per requested locale: ${locales.join(", ")}.` },
    ),
})

/**
 * The model's raw answer as one translation run over the locales that were asked for.
 *
 * `locales` is required, and there is no "any supported locale" default: the parse now enforces
 * that every requested language came back, and a caller that cannot say what it requested cannot
 * be told whether the answer is complete. Defaulting it to `SUPPORTED_LOCALES` would not have been
 * the lenient reading it looks like — it would demand a translation into every language the app
 * supports.
 *
 * The cast is on `WithoutNulls<L>` and nothing else: with `L` still generic TypeScript cannot see
 * that stripping `null` from a union of string literals leaves that union untouched, so the parsed
 * type is right and unprovable. Everything the parse actually enforces — the locale being one of
 * `locales`, one entry each, the recipe's shape — is checked at run time by the same schema the
 * model generated against.
 */
export const toTranslatedRecipes = <const L extends Locale>(
  raw: unknown,
  locales: readonly L[],
): TranslatedRecipe<L>[] =>
  parseModelOutput(modelTranslationsSchema(locales), raw).translations.map(({ locale, recipe }) => ({
    locale: locale as L,
    recipe: { ...recipe, instructions: toInstructionGroups(recipe.instructions) },
  }));

const _inputSchema = z.object({
  locales: z
    .array(z.enum(SUPPORTED_LOCALES))
    .min(1)
    .describe("The languages the recipe should be translated into. One or more of the supported locales."),
  recipe: modelRecipeSchemaExtended.describe(
    "The recipe to translate, in full. Its title, description and instructions are what come " +
    "back translated; the other fields are context — an ingredient named in a step takes the " +
    "word the ingredient list already gives for that language, rather than one chosen on the spot.",
  ),
});

/**
 * The recipe itself, as the user message.
 *
 * Exported because the bake-off in `__tests__/translateRecipe.manual.test.ts` scores the REAL
 * prompt — a benchmark that rebuilds the user message by hand starts agreeing with the tool and
 * ends measuring a prompt the app does not send.
 */
export const translateRecipeUserPrompt = (recipe: TranslatableRecipe) =>
  `The recipe to translate:\n\n\`\`\`json\n${JSON.stringify(recipe, null, 2)}\n\`\`\``;

/** The tool's input, with `locales` narrowed to whatever a direct caller actually passed. */
type _Input<L extends Locale> = Omit<z.infer<typeof _inputSchema>, "locales"> & {
  locales: readonly L[];
};

/**
 * `const L` is what makes the narrowing reach the call site: without it a literal
 * `["fr"]` widens to `Locale[]` at the boundary and the return type learns nothing.
 */
const _translate = async <const L extends Locale = Locale>(
  ctx: TracedToolCtx,
  args: _Input<L>,
): Promise<TranslatedRecipe<L>[]> => {
  // The `.min(1)` on `locales` already refuses an empty list on both doors: `createTool` parses a
  // direct `run` against `_inputSchema` too. Stated again here because an empty list is the
  // difference between a clear error and `z.enum([])` rejecting every answer a model could give.
  if (!args.locales.length) throw new Error("translateRecipe: no target locale to translate into.");

  /**
   * nvidia/nemotron-3-super-120b-a12b:free (5,000 reasoning tokens)
   * deepseek/deepseek-v4-flash-0731 (no reasoning)
   * both strong candidates
   *  */
  const result = await retryPromise(() =>
    wrapAgent(translatorAgent).generateObject(
      ctx,
      {},
      {
        system: translateRecipePrompt(args.locales),
        prompt: translateRecipeUserPrompt(args.recipe),
        schema: providerSchema(modelTranslationsSchema(args.locales)),
        output: "object",
        maxRetries: 3,
      },
      { storageOptions: { saveMessages: "none" } },
    ), 2);

  // `wrapAgent` erases the schema's type on the way through (it re-types the agent to call the
  // wrapped methods), so the object arrives as JSON. Parsing here is what restores the contract
  // `toTranslatedRecipes` pins — the model already generated against this schema, so it is a cast
  // that cannot silently be wrong.
  return toTranslatedRecipes(result.object, args.locales);
};

const _tool = createTool<_Input<Locale>, TranslatedRecipe<Locale>[], TracedToolCtx>({
  description:
    "Translate a structured recipe into one or more supported languages. Its ingredient list " +
    "arrives already named in every language, and the steps are written to agree with it. Returns " +
    "one entry per requested locale, each carrying the locale it was translated into alongside " +
    "the translated title, description and instructions.",
  inputSchema: _inputSchema,
  execute: _translate,
});

/**
 * `run` is re-declared over the one `createTool` copies off `execute`, because that copy is typed
 * at the tool's INPUT — `Locale[]`, which is all a model can ever supply. The tool half stays
 * exactly that; only the direct-call half keeps the generic.
 */
export const translateRecipe = _tool as Omit<typeof _tool, "run"> & { run: typeof _translate };
