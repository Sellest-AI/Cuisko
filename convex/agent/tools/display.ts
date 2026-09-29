import { internal } from "@convex/_generated/api";
import { DISPLAY_KINDS, type DisplayCard, type DisplayKind } from "@shared/assistant";
import z from "zod/v4";

import { createTool } from "../utils";

/**
 * How the assistant puts things in front of the cook: it names what, in what order, and the app
 * decides how.
 *
 * **One tool for every way of showing something.** The model's job is choosing — which of the
 * recipes its searches found are worth a tired cook's attention, and in what order. How they are
 * laid out (one large card, a shelf, later a list) is the client's, decided from the kind and the
 * count when the card is drawn. A tool per layout would be a tool per screen shape, each teaching
 * the model a new name for the same act.
 *
 * **The model carries ids here, and that is allowed** (ADR 0010): it passes back ids a search
 * handed it, it does not compose them. What makes that safe is that every one is checked in code
 * before anything is stored, and a bad one THROWS — the model reads the error and retries. Dropping
 * it quietly would show one card fewer while the model believes it showed them all.
 */

/**
 * The most a single card holds. A shelf of six is already a scroll on a phone; more than that is a
 * list nobody reads under a chat answer, and the model is told to choose, not to forward.
 */
const MAX_DISPLAYED = 6;

const _inputSchema = z.object({
  // Optional: a field with one legal value reads to some models as one they need not send (GLM 5.3
  // left it out of 29 calls in a bake-off), and a refusal costs the cook a round trip.
  kind: z
    .enum(DISPLAY_KINDS)
    .optional()
    .describe("What the ids are. \"recipes\" for ids from searchRecipes, and if left out."),
  ids: z
    .array(z.string())
    .min(1)
    .max(MAX_DISPLAYED)
    .describe(
      "The ids to show, best first, exactly as a search returned them. Choose; do not pass " +
      "every result.",
    ),
});

type Input = z.infer<typeof _inputSchema>;

/**
 * The card to store, or the error the model has to act on.
 *
 * Pure, so the rule ADR 0010 hangs on — a bad id throws, it is never dropped — is pinned by a test
 * with no model and no database. Duplicates ARE dropped silently: a repeated id is a harmless slip,
 * not a wrong row, and drawing one recipe twice in a shelf reads as a bug. First occurrence wins so
 * the model's order survives.
 */
export const toDisplayCard = (
  { kind = "recipes", ids }: { kind?: DisplayKind; ids: string[] },
  missing: readonly string[],
): DisplayCard => {
  if (missing.length > 0) {
    throw new Error(
      `These ${kind} ids do not exist: ${missing.join(", ")}. ` +
      "Pass only ids a search returned in this conversation, copied exactly.",
    );
  }

  return { v: 1, kind, ids: [...new Set(ids)] };
};

/**
 * A constant rather than a factory like `searchRecipesTool`: nothing here depends on who is asking.
 * Recipes are readable by any cook (ADR 0014), so existing is the whole check. A kind whose rows
 * are private will need the caller, and becomes a factory then.
 */
export const displayTool = createTool({
  description:
    "Shows the cook the recipes you chose, as cards at this point in your answer, in the order " +
    "you give. Call it once per answer. Never write an id in your text; ids go here only.",
  inputSchema: _inputSchema,
  execute: async (ctx, input: Input): Promise<DisplayCard> => {
    // One kind so far; a second one branches here on `input.kind`.
    const missing = await ctx.runQuery(internal.router.recipes.missingIds._internal, { ids: input.ids });

    return toDisplayCard(input, missing);
  },
});
