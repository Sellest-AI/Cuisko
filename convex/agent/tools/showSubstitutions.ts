import { internal } from "@convex/_generated/api";
import type { IngredientSwap, SubstitutionsCard } from "@shared/assistant";
import z from "zod/v4";

import { createTool } from "../utils";

/**
 * How the assistant shows a swap it suggests: one row per ingredient replaced, "carrot → tomato",
 * each side drawn with the ingredient's picture, or its emoji when it has none.
 *
 * **The model passes ingredient ids a search handed it, and nothing else** (ADR 0010). The name,
 * emoji and image are resolved when the card is drawn, so the model cannot write a wrong one, and
 * every id is checked before the card is stored: a bad one THROWS and the model retries.
 */

/** More swaps than this is a different recipe, not a substitution. */
const MAX_SWAPS = 6;

const _inputSchema = z.object({
  swaps: z
    .array(z.object({
      from: z.string().describe("The id of the ingredient being replaced, from searchIngredients."),
      to: z.string().describe("The id of the ingredient replacing it, from searchIngredients."),
    }))
    .min(1)
    .max(MAX_SWAPS)
    .describe("One entry per ingredient replaced, in the order the cook asked."),
});

type Input = z.infer<typeof _inputSchema>;

/**
 * The card to store, or the error the model has to act on.
 *
 * Pure, so the rules are pinned with no model and no database: an unknown id throws, naming it; an
 * ingredient swapped for itself throws, since a row "milk → milk" tells the cook nothing; a repeated
 * swap is dropped, first occurrence kept, the same harmless slip `display` forgives in a repeated id.
 */
export const toSubstitutionsCard = (
  swaps: readonly IngredientSwap[],
  missing: readonly string[],
): SubstitutionsCard => {
  if (missing.length > 0) {
    throw new Error(
      `These ingredient ids do not exist: ${missing.join(", ")}. ` +
      "Pass only ids searchIngredients returned in this conversation, copied exactly.",
    );
  }

  const same = swaps.find(({ from, to }) => from === to);
  if (same) throw new Error(`A swap replaces ${same.from} with itself. Pass two different ingredients.`);

  const seen = new Set<string>();

  return {
    v: 1,
    swaps: swaps
      .filter(({ from, to }) => {
        const key = `${from}>${to}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ from, to }) => ({ from, to })),
  };
};

/** A constant, like `displayTool`: the catalog is reference data, so who is asking changes nothing. */
export const showSubstitutionsTool = createTool({
  description:
    "Shows the cook the ingredient swaps you suggest, one row per swap with each ingredient's " +
    "picture, at this point in your answer. Call it whenever you suggest replacing an ingredient, " +
    "including when you offer several alternatives to one: each alternative is a swap. Pass " +
    "ingredient ids from searchIngredients; never write one in your text, and never list the " +
    "swaps in your text.",
  inputSchema: _inputSchema,
  execute: async (ctx, { swaps }: Input): Promise<SubstitutionsCard> => {
    const missing = await ctx.runQuery(internal.router.ingredients.missingIds._internal, {
      ids: [...new Set(swaps.flatMap(({ from, to }) => [from, to]))],
    });

    return toSubstitutionsCard(swaps, missing);
  },
});
