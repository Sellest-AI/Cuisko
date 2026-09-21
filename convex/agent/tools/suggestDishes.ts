import type { ToolCtx } from "@convex-dev/agent";
import { CUISINES } from "@shared/cuisines";
import { VEGETARIAN_DIETS, type VegetarianDiet } from "@shared/diets";
import { retryPromise } from "@shared/helpers";
import { foldAccents } from "@shared/translations";
import z from "zod/v4";

import { defaultAgent } from "../agents";
import { suggestDishesPrompt, suggestDishesUserPrompt } from "../config/prompts/suggestDishes";
import {
  type AssertTrue,
  createTool,
  type Exact,
  parseModelOutput,
  providerSchema,
  type WithoutNulls,
  wrapAgent,
} from "../utils";

/**
 * Dish names for one cuisine, for the catalog import to search Marmiton with.
 *
 * Only a name and an intended diet come back. The diet is what the model believes the usual
 * recipe is, recorded in the ledger for the coverage print, and nothing else reads it: the
 * recipe's real facets are computed from its ingredients at import (`deriveRecipeFields`).
 */

/** The most dishes one call returns: enough for a run to fill a batch, few enough to read. */
const _MAX_COUNT = 20;

const _modelDishesSchema = z.object({
  dishes: z.array(
    z.object({
      name: z.string().describe("The dish's name in French, as a Marmiton cook would title it."),
      diet: z
        .enum(VEGETARIAN_DIETS)
        .nullable()
        // Optional too, so a null, or a diet outside the two, drops the diet and keeps the dish.
        .optional()
        .describe("What the dish's USUAL recipe is suitable for, or null when it has meat or fish."),
    }),
  ),
});

export type SuggestedDish = { name: string; diet?: VegetarianDiet };

/** Both ways round, so the schema and `SuggestedDish` cannot drift apart (ADR 0010). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a compile-time assertion, read by tsc alone
type _Pinned = AssertTrue<
  Exact<WithoutNulls<z.infer<typeof _modelDishesSchema>>["dishes"][number], SuggestedDish>
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
 * name in `avoid`, and cut to `count`.
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

  for (const { name, diet } of parseModelOutput(_modelDishesSchema, raw).dishes) {
    const trimmed = name.trim();
    const keys = _keysOf(trimmed);
    if (!keys.length || keys.some((key) => seen.has(key))) continue;

    keys.forEach((key) => seen.add(key));
    dishes.push(diet ? { name: trimmed, diet } : { name: trimmed });
  }

  return dishes.slice(0, count);
};

const _inputSchema = z.object({
  cuisine: z.enum(CUISINES).describe("The cuisine to suggest dishes from."),
  count: z.number().int().min(1).max(_MAX_COUNT).describe("How many dishes to return."),
  avoid: z
    .array(z.string())
    .describe("Dish names already searched for this cuisine. None of them is returned again."),
});

const _suggest = async (ctx: ToolCtx, args: z.infer<typeof _inputSchema>): Promise<SuggestedDish[]> => {
  // The schema's bounds guard the MODEL's call; nothing parses a direct `run`, which is how the
  // router calls this, so they are stated again where a bad count would otherwise be paid for.
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > _MAX_COUNT) {
    throw new Error(`suggestDishes: count must be an integer from 1 to ${_MAX_COUNT}.`);
  }

  const result = await retryPromise(() =>
    wrapAgent(defaultAgent).generateObject(
      ctx,
      {},
      {
        system: suggestDishesPrompt(args.cuisine, args.count),
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
    "Suggests French dish names from one cuisine to search a recipe site for, skipping the ones " +
    "already searched. Each comes with the diet its usual recipe suits, when it is vegan or " +
    "vegetarian.",
  inputSchema: _inputSchema,
  execute: _suggest,
});
