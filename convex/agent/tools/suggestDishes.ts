import { CUISINES } from "@shared/cuisines";
import { CONSTRAINT_TIMES } from "@shared/cookingTimes";
import { CONSTRAINT_DIETS, type ConstraintDiet } from "@shared/diets";
import { retryPromise } from "@shared/helpers";
import { EXCLUSIVE_PREFERENCES, MAX_CONSTRAINT_SEEKS, NUTRITION_PREFERENCES } from "@shared/preferences";
import { foldAccents } from "@shared/translations";
import z from "zod/v4";

import type { DishConstraints } from "@convex/schema/recipePayloads";

import { catalogAgent } from "../agents";
import { suggestDishesPrompt, suggestDishesUserPrompt } from "../config/prompts/suggestDishes";
import {
  type AssertTrue,
  createTool,
  type Exact,
  parseModelOutput,
  providerSchema,
  type WithoutNulls,
  wrapAgent,
  type TracedToolCtx,
} from "../utils";

/**
 * Dish names for one cuisine, for the catalog import to search Marmiton with.
 *
 * Main plates of a lunch or a dinner only, since that is what the planner fills a week with. Only a
 * name (in French for Marmiton, and in English for BBC Good Food's slugs) and an intended diet
 * come back. The diet is what the model believes the usual
 * recipe is, recorded in the ledger for the coverage print, and checked by the script against
 * the diet an ask names (`fitsDiet`). Nothing else reads it: the recipe's real facets are computed
 * from its ingredients at import (`deriveRecipeFields`).
 */

/** The most dishes one call returns: enough for a run to fill a batch, few enough to read. */
const _MAX_COUNT = 20;

const _modelDishesSchema = z.object({
  dishes: z.array(
    z.object({
      name: z.string().describe("The dish's name in French, as a Marmiton cook would title it."),
      nameEn: z
        .string()
        .describe("The same dish's name in English, as BBC Good Food would title it."),
      veganEn: z
        .string()
        .nullable()
        .optional()
        .describe("The English name of a vegan version of the dish when one is the same dish in spirit, else null."),
      main: z
        .boolean()
        .describe("Whether the dish is served as the main plate of a lunch or a dinner."),
      diet: z
        .enum(CONSTRAINT_DIETS)
        .nullable()
        // Optional too, so a null, or a diet outside the three, drops the diet and keeps the dish.
        .optional()
        .describe("What the dish's USUAL recipe is suitable for, or null when it has meat."),
    }),
  ),
});

export type SuggestedDish = { name: string; nameEn: string; veganEn?: string; diet?: ConstraintDiet };

/**
 * Both ways round, so the schema and `SuggestedDish` cannot drift apart (ADR 0010). `main` is left
 * out by name: it is a filter `toSuggestedDishes` applies, and every dish it returns is a main.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a compile-time assertion, read by tsc alone
type _Pinned = AssertTrue<
  Exact<Omit<WithoutNulls<z.infer<typeof _modelDishesSchema>>["dishes"][number], "main">, SuggestedDish>
>;

const _wordsOf = (name: string) => name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * The two keys a name is compared by. Two names are one dish when EITHER key matches.
 *
 * Never one key with both folds applied: accents and a plural "s" are each harmless to drop and
 * wrong to drop together. "pâtes" and "pâté" differ by exactly those two things, so a single
 * key merged pasta and a terrine. Apart, each fold catches its own case: accents for "pad thaï"
 * and "Pad Thai", the plural for "lasagne" and "lasagnes".
 */
const _keysOf = (name: string): string[] => {
  const words = _wordsOf(name);
  if (!words.length) return [];

  return [
    `accents:${words.map(foldAccents).join(" ")}`,
    `plural:${words.map((word) => (word.length > 3 ? word.replace(/[sx]$/, "") : word)).join(" ")}`,
  ];
};

/**
 * The model's answer as the list the script can search: trimmed, deduplicated, stripped of any
 * name in `avoid`, and cut to `count`. A dish already vegan loses its `veganEn`: there is no vegan
 * version of it to look for. A dish the model itself marks as not a main plate is dropped: the
 * catalog plans lunches and dinners, and a tiramisu is a whole import spent on neither.
 *
 * The prompt already forbids all three. They are checked here too because a repeat is the one
 * mistake that costs a search with nothing gained, and it is the one a model makes most on a
 * long `avoid` list. Only spellings are caught ("lasagne" / "Lasagnes"). The same dish under
 * another name gets through and is absorbed by the ledger, which is keyed by URL.
 *
 * Fewer than `count` is returned rather than thrown on: the script asks again for the next
 * cuisine, and a short answer is still a useful one.
 */
export const toSuggestedDishes = (
  raw: unknown,
  { count, avoid }: { count: number; avoid: readonly string[] },
): SuggestedDish[] => {
  const seen = new Set(avoid.flatMap(_keysOf));
  const dishes: SuggestedDish[] = [];

  for (const { name, nameEn, veganEn, main, diet } of parseModelOutput(_modelDishesSchema, raw).dishes) {
    if (!main) continue;

    const trimmed = name.trim();
    const keys = _keysOf(trimmed);
    if (!keys.length || keys.some((key) => seen.has(key))) continue;

    keys.forEach((key) => seen.add(key));
    const vegan = diet === "vegan" ? undefined : veganEn?.trim();
    dishes.push({
      name: trimmed,
      nameEn: nameEn.trim() || trimmed,
      ...(vegan && { veganEn: vegan }),
      ...(diet && { diet }),
    });
  }

  return dishes.slice(0, count);
};

const _constraintsSchema = z
  .object({
    time: z.enum(CONSTRAINT_TIMES).optional().describe("A ceiling in minutes the usual recipe fits."),
    diet: z.enum(CONSTRAINT_DIETS).optional().describe("A diet the usual recipe suits."),
    seeks: z
      .array(z.enum(NUTRITION_PREFERENCES))
      .max(MAX_CONSTRAINT_SEEKS)
      .optional()
      .describe("Nutrition goals the usual recipe meets, all of them."),
  })
  // A dish both light and substantial is no dish: the model would invent one rather than say so.
  .refine(({ seeks = [] }) => !EXCLUSIVE_PREFERENCES.every((exclusive) => seeks.includes(exclusive)), {
    message: `seeks cannot hold both ${EXCLUSIVE_PREFERENCES.join(" and ")}.`,
  });

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a compile-time assertion, read by tsc alone
type _ConstraintsPinned = AssertTrue<Exact<z.infer<typeof _constraintsSchema>, DishConstraints>>;

const _inputSchema = z.object({
  cuisine: z.enum(CUISINES).describe("The cuisine to suggest dishes from."),
  count: z.number().int().min(1).max(_MAX_COUNT).describe("How many dishes to return."),
  avoid: z
    .array(z.string())
    .describe("Dish names already searched for this cuisine, or that missed what is asked. None of them is returned again."),
  constraints: _constraintsSchema
    .optional()
    .describe("What every dish must fit besides the cuisine. None means any main plate of it."),
});

const _suggest = async (ctx: TracedToolCtx, args: z.infer<typeof _inputSchema>): Promise<SuggestedDish[]> => {
  // The schema's bounds already guard both doors: `createTool` parses a direct `run`, which is how
  // the router calls this, against `_inputSchema` too. Stated again where a bad count would
  // otherwise be paid for.
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > _MAX_COUNT) {
    throw new Error(`suggestDishes: count must be an integer from 1 to ${_MAX_COUNT}.`);
  }

  const result = await retryPromise(() =>
    wrapAgent(catalogAgent).generateObject(
      ctx,
      {},
      {
        system: suggestDishesPrompt(args.cuisine, args.count, args.constraints),
        prompt: suggestDishesUserPrompt(args.avoid),
        schema: providerSchema(_modelDishesSchema),
        output: "object",
        maxRetries: 3,
      },
      { storageOptions: { saveMessages: "none" } },
    ), 2);

  return toSuggestedDishes(result.object, args);
};

export const suggestDishes = createTool({
  description:
    "Suggests dish names from one cuisine, in French and in English, to search recipe sites for, skipping the ones " +
    "already searched. Each comes with the diet its usual recipe suits, when it is vegan or " +
    "vegetarian.",
  inputSchema: _inputSchema,
  execute: _suggest,
});
