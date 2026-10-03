import * as z from "zod/v4";

import { CUISINES, type Cuisine } from "@shared/cuisines";
import {
  DIFFICULTIES,
  DIFFICULTY_LEVELS,
  type DifficultyLevel,
  type InstructionGroup,
  type InstructionStep,
  toInstructionGroups,
  wholeTimingsOf,
} from "@shared/recipes";
import { EQUIPMENTS, type Equipment } from "@shared/equipments";
import { SUPPORTED_LOCALES } from "@shared/translations";
import { AUTHORED_TAGS, type AuthoredTag } from "@shared/tags";
import { FAT_USES, type FatUse, RECIPE_UNITS, type RecipeUnit } from "@shared/ingredients";
import { retryPromise } from "@shared/helpers";

import {
  type AssertTrue,
  createTool,
  type Exact,
  parseModelOutput,
  providerSchema,
  type WithoutNulls,
  wrapAgent,
} from "../utils";
import { recipesAgent } from "../agents";
import { sanitizeRecipePrompt } from "../config/prompts/sanitizeRecipe";

/**
 * A recipe in ONE language, with its ingredients unresolved.
 *
 * Deliberately not a `Doc<"recipes">`: everything localized here is a bare string rather than a
 * `vLocalized`, and every ingredient is a *name* rather than an id. Both differences are the point
 * of the slice — translation is a separate agent, and turning a name into a catalog row is an
 * algorithm (`functions/recipes/resolveRecipeIngredients.ts`), not a generation. A model asked for a
 * document id invents one that parses.
 *
 * `quantity` is not optional, and that is the whole of rule 1 in the prompt: nutrition is per 100g,
 * so a line with no number is not an incomplete recipe, it is a recipe with no nutrition.
 */
export type SanitizedRecipe = {
  title: string;
  description: string;
  servings: number;
  difficulty: DifficultyLevel;
  cuisine: Cuisine;
  tags: AuthoredTag[];
  equipments: Equipment[];
  timings: { preparation?: number; cooking?: number; resting?: number };
  instructions: InstructionGroup[];
  /** `fatUse` only on a cooking fat partly left in the pan or the fryer: see `FAT_USE_SHARE`. */
  ingredients: { name: string; quantity: number; unit: RecipeUnit; fatUse?: FatUse }[];
};

/**
 * The shape the model is constrained to, built from the same vocabularies the schema validates
 * against — never a bare `z.string()`. `.describe()` puts each field's rule next to the field,
 * where the model reads it at generation time, rather than only in the system prompt fifty lines
 * above it.
 *
 * This schema is also read on the way back, by `parseModelOutput`: a field marked
 * `.nullable().optional()` is one it is allowed to drop, so `"none"`, `"45 minutes"` and a missing
 * key all resolve to an absent field instead of a thrown generation. `.positive()` on the timings
 * is how "never 0" is enforced — the rule is in the schema, not in a normalizer below it.
 *
 * ⚠️ This schema is NOT what the model is handed — `providerSchema` rewrites it first, because a
 * provider will reject a document it cannot convert and blame the wrong field while doing it.
 * `difficulty` is the one that bit: a numeric `enum`, which Google AI Studio refuses outright, and
 * it refused with `schema at top-level requires unspecified property 'title'`. So keep writing this
 * schema for the APP — vocabularies, `.positive()`, `.nullable().optional()` — and let the rewrite
 * worry about what a provider tolerates. Nothing here may be loosened to please one: this is the
 * schema the answer is validated against on the way back, and the parser can only omit a key the
 * schema lets it omit.
 */
export const modelRecipeSchema = z.object({
  title: z.string().describe(
    `What a cook would call the dish. No "Recipe for", no serving count. Name only what the ` +
    `finished dish actually holds: a "with …" clause must name a component the recipe really ` +
    `produces, never an ingredient borrowed from another part of it — a pear grated into the ` +
    `marinade does not make a pear sauce.`,
  ),
  description: z.string()
    .describe("One or two sentences: what it tastes like, and when you would make it."),
  servings: z.number().describe("How many people the quantities listed below actually feed."),
  difficulty: z.literal(DIFFICULTY_LEVELS)
    .describe(`1 to 5, where 1 is ${DIFFICULTIES[0]} and 5 is ${DIFFICULTIES[4]}.`),
  cuisine: z.enum(CUISINES)
    .describe(`Exactly one. "other" only when none fits — never as a default.`),
  tags: z.array(z.enum(AUTHORED_TAGS)).describe(
    "Walk the list group by group — course, form, effort, occasion, character — and ask of each " +
    "what is TRUE of this recipe, then write it. Omitting a true tag is the same error as " +
    `inventing a false one. A tag is a fact, not a compliment, so an unflattering one is as ` +
    `required as a flattering one: chilli, harissa or gochujang is "spicy"; a marinade or a dough ` +
    `resting overnight is "make-ahead". And a fact is not a wish — no "quick" on an hour. The ` +
    `character group asks what the dish is LIKE: "fresh" is raw, crisp or bright rather than ` +
    `merely light, and "veggie-forward" is a dish vegetables carry rather than garnish. Diet and ` +
    "nutrition are not yours to answer: vegetarian, gluten-free, high-protein, high-fibre and " +
    "iron-rich are all computed from the ingredients you return, which is why none of them is in " +
    "this list.",
  ),
  equipments: z.array(z.enum(EQUIPMENTS)).describe(
    "Every appliance the recipe can be made with, the alternatives its own steps offer " +
    `included — "in the slow cooker, or covered in the oven" carries both, because the cook ` +
    "needs any ONE of them. An appliance the recipe says it can do without is not one. A pan, " +
    "a bowl or a knife is not equipment. An empty list is a normal answer.",
  ),
  timings: z.object({
    preparation: z.number().positive().nullable().optional()
      .describe(
        "Hands-on minutes that do NOT happen while something is cooking. Work done during a " +
        "boil or a bake already lives inside `cooking` — do not count it twice.",
      ),
    cooking: z.number().positive().nullable().optional()
      .describe(
        "Elapsed minutes from the first thing reaching the heat to the last leaving it. Two " +
        "things cooking at once count once: onions and pasta side by side are 15, not 25.",
      ),
    resting: z.number().positive().nullable().optional()
      .describe(
        "Minutes the cook is not working at all: rising, marinating, chilling. Never overlaps.",
      ),
  }).describe(
    "Elapsed minutes as the cook lives them in the order you wrote, not the sum of the steps. " +
    "A timing the recipe does not have is null or left out, never 0.",
  ),
  instructions: z.array(
    z.object({
      title: z.string().nullable().optional().describe(
        `What the group is for — the component being made ("Sauce", "Pasta") or the moment ` +
        `("Assembly"). Never "Step 3", never a restatement of its first step. null when the ` +
        "recipe is one single run of steps.",
      ),
      steps: z.array(
        z.object({
          instruction: z.string().describe(
            `One action, written as an instruction ("Preheat the oven to 180°C"), with no ` +
            "leading number, dash or bullet. An amount named inside a step uses the same unit " +
            "as the ingredient list, and one ingredient's amounts across every step add up to " +
            "the total listed there.",
          ),
          // Absentable at both levels, because "no hints" is the answer the model gives most and
          // it spells it every way: null, a missing key, "none", or [""]. `toInstructionGroups` (shared/recipes) turns
          // every one of those into []. A required list would throw on the first of them.
          hints: z.array(z.string().nullable().optional()).nullable().optional().describe(
            "Tips shown beside this step while the cook is at the hob, one short sentence each. " +
            "Every hint the cook wrote (a line starting with `>` under a step) is kept, on the " +
            "same step. Add one of your own ONLY when the step genuinely needs it: a technique a " +
            "home cook is likely to get wrong, a sign that tells them it is done, a safe shortcut. " +
            "Most steps have none, and an empty list is the normal answer. Never restate the " +
            "instruction, never pad.",
          ),
        }),
      ),
    }),
  ).describe(
    "Groups of steps, in the order the cook will actually work: the longest unattended thing " +
    "started first, every wait filled with the next preparation. A recipe that is one run of " +
    "steps is ONE group with no title, not five groups of one step.",
  ),
  ingredients: z.array(
    z.object({
      name: z.string().describe(
        `The ingredient alone, singular, lowercase, with no quantity, brand or preparation — ` +
        `"onion", not "3 onions, thinly sliced"; "japanese mayonnaise", not "Kewpie". Keep an ` +
        `adjective only when it changes what you would buy: "smoked paprika" yes, "fresh ` +
        `coriander" no. It is matched against a catalog by this name.`,
      ),
      quantity: z.number()
        .describe(`Always a number. Estimate it when the cook wrote "to taste" or "a drizzle".`),
      unit: z.enum(RECIPE_UNITS).describe(
        `"tbsp" and "tsp" are the metric tablespoon and teaspoon, 15 ml and 5 ml. "pcs" is the ` +
        "piece a RECIPE counts — a clove of garlic, not the head it is sold in; a bay leaf, not " +
        'the jar. "slice" is a cut of something sold whole and eaten sliced — bread, cheese, ' +
        'ham, a round of lemon — never "pcs", which would count loaves. Pick what a cook would ' +
        "write, never what converts most neatly: the catalog knows what one piece, one slice " +
        "and one millilitre of each ingredient weigh, so a spoonful reaches grams as exactly as " +
        "a gram does. Reaching for a weight to be safe makes the line harder to read and no " +
        "more exact.",
      ),
      // A preset, never a number: the share each one stands for is `FAT_USE_SHARE`, tuned in code.
      // Absentable, because "not a frying fat" is the answer for nearly every line.
      fatUse: z.enum(FAT_USES).nullable().optional().describe(
        `Only on a fat food is cooked IN, and only when part of it is left behind. "fried": food ` +
        `is fried in it and lifted out, or the pan is wiped or drained after. "deepFried": food is ` +
        "submerged in it. Left out whenever the fat ends up on the plate — a dressing, a sauce, a " +
        "marinade, a dough, a drizzle, and a sear whose pan goes into the dish. Left out on " +
        "anything that is not a fat.",
      ),
    }),
  ).describe(
    "One entry per ingredient, never the same ingredient twice — quantities added together.",
  ),
});

/**
 * The model's answer as a `SanitizedRecipe`.
 *
 * Absence needs no normalizer: `parseModelOutput` reads the schema above to know which fields are
 * allowed to be absent, so `"null"`, `"45 minutes"`, a `0` that fails `.positive()` and a key the
 * model left out are all handled by the four `.optional()` already written up there. A cuisine
 * outside `CUISINES` still throws.
 *
 * The one thing done after parsing is rounding the timings. It cannot live in the schema — `.int()`
 * would DROP a `7.5` rather than round it — and the app only ever reads and writes whole minutes.
 *
 * `_Pinned` below is what pins the contract, in both directions — a vocabulary that drifts between
 * `modelRecipeSchema` and `SanitizedRecipe` is a compile error here, rather than a recipe the
 * database rejects at insert time, or a value the model is never offered.
 */
export const toSanitizedRecipe = (raw: unknown): SanitizedRecipe => {
  const recipe = parseModelOutput(modelRecipeSchema, raw);
  return {
    ...recipe,
    timings: wholeTimingsOf(recipe.timings),
    instructions: toInstructionGroups(recipe.instructions),
  };
};

/** The model's instruction groups, after `parseModelOutput` has dropped every way of saying "none". */
type _ModelRecipe = WithoutNulls<z.infer<typeof modelRecipeSchema>>;

/**
 * The return annotation above only checks one way: the schema's type fitting `SanitizedRecipe`.
 * A tag added to the hand-written type and forgotten in the schema would still compile, and the
 * model would never be offered it. ADR 0010's Verify runs these lines.
 *
 * `instructions` is pinned apart from the rest because it is the one field the model answers in a
 * looser shape than the app reads — `hints` may be absent — and `toInstructionGroups` is what closes that gap.
 * Everything else about a step still has to match exactly.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a compile-time assertion, read by tsc alone
type _Pinned = AssertTrue<Exact<Omit<_ModelRecipe, "instructions">, Omit<SanitizedRecipe, "instructions">>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a compile-time assertion, read by tsc alone
type _PinnedStep = AssertTrue<
  Exact<Omit<_ModelRecipe["instructions"][number]["steps"][number], "hints">, Omit<InstructionStep, "hints">>
>;

const _inputSchema = z.object({
  locale: z
    .enum(SUPPORTED_LOCALES)
    .describe("The language every field of the result is written in."),
  title: z
    .string()
    .optional()
    .describe("The cook's own title for the dish, if they gave one. Use it as written rather than inventing one."),
  description: z
    .string()
    .optional()
    .describe(
      "The cook's own description, if they gave one. Use it as written rather than inventing one.",
    ),
  servings: z
    .number()
    .optional()
    .describe(
      "How many people the cook says the quantities feed, when they said it outside the free " +
      "text. Return it unchanged and read every quantity as written for it. Absent means they " +
      "never said, and only then is the number yours to estimate.",
    ),
  ingredients: z
    .array(z.string())
    .describe(`Free text, one ingredient line per entry — "200g de pâtes", "2 onions, chopped".`),
  instructions: z
    .string()
    .describe("Free text. A paragraph, a numbered list, whatever the cook pasted."),
  outdated: modelRecipeSchema
    .nullable()
    .describe(
      "The recipe being edited. null on creation — a recipe here is what makes this an edit.",
    ),
});

/**
 * What the model is shown. The already-sanitized recipe comes first when there is one, because it
 * is the thing being edited and the free text is the change to apply to it.
 */
const _userPrompt = (
  { title, description, servings, ingredients, instructions, outdated }: z.infer<typeof _inputSchema>,
) =>
  [
    outdated && `The recipe as it stands:\n${JSON.stringify(outdated, null, 2)}`,
    title && `The cook's own title — use it as written (or improve it):\n${title}`,
    description && `The cook's own description — use it as written (or improve it):\n${description}`,
    servings !== undefined &&
      `How many the cook says it feeds — return this number, do not re-estimate it:\n${servings}`,
    `Ingredients, as the cook wrote them:\n${ingredients.join("\n")}`,
    `Instructions, as the cook wrote them:\n${instructions}`,
  ]
    .filter(Boolean)
    .join("\n\n");

/**
 * A pile of free text into a complete recipe, in one model call and one language.
 *
 * Nothing is written down: `saveMessages: "none"` is what keeps the exchange out of the thread.
 * This is a transformation, not a conversation — nothing later needs to recall the paragraph the
 * cook pasted, and keeping it would make every subsequent turn in a real thread carry it as
 * context.
 *
 * `wrapAgent` supplies whatever the component asserts on. On the router path the ctx carries a
 * userId and `saveMessages` is doing all of the work; on the import path it carries neither, and
 * the wrapper answers the assert with a constant rather than a thread — there is nothing to save
 * either way.
 */
export const sanitizeRecipe = createTool({
  description:
    "Turn a cook's free-text ingredient lines and instructions into a complete structured " +
    "recipe: every field filled in, steps grouped and ordered, every ingredient carrying a " +
    "quantity and a unit. Returns ingredient names, not catalog ids.",
  inputSchema: _inputSchema,
  execute: async (ctx, args): Promise<SanitizedRecipe> => {
    const result = await retryPromise(() =>
      wrapAgent(recipesAgent).generateObject(
        ctx,
        {},
        {
          system: sanitizeRecipePrompt(args.locale),
          prompt: _userPrompt(args),
          schema: providerSchema(modelRecipeSchema),
          output: "object",
          maxRetries: 3,
        },
        { storageOptions: { saveMessages: "none" } },
      ), 2);

    // `wrapAgent` erases the schema's type on the way through (it re-types the agent to call the
    // wrapped methods), so the object arrives as JSON. Parsing here is what restores the contract
    // `toSanitizedRecipe` pins — the model already generated against this schema, so it is a cast that
    // cannot silently be wrong.
    return toSanitizedRecipe(result.object);
  },
});
