import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { CellarChange, CellarChangeLine } from "@shared/assistant";
import { isAppError } from "@shared/errors";
import { type Unit, UNITS } from "@shared/ingredients";
import { ConvexError } from "convex/values";
import z from "zod/v4";

import { createTool } from "../utils";

/**
 * How the assistant puts food in the cellar or takes it out: "ajoute 500 g de patates et 3
 * tomates", "retire 2 carottes de mon cellier".
 *
 * **One mutation per line, through the same ones the groceries screen uses**, so the assistant
 * cannot move stock in a way the list does not. That makes a call able to half-apply, and the output
 * says so rather than hiding it: `lines` holds what landed, `failed` what did not and why. The card
 * and its undo cover `lines` only; the model reads `failed` and tells the cook.
 *
 * **The model passes ingredient ids searchIngredients handed it** (ADR 0010). They are checked
 * before anything is written, and an unknown one throws the whole call: nothing moved yet, and the
 * model retries with ids it really holds.
 */

/** A shop's worth, well past any list typed or dictated in one go. */
const MAX_ITEMS = 20;

const _inputSchema = z.object({
  items: z
    .array(z.object({
      ingredientId: z.string().describe("The id of the ingredient, from searchIngredients."),
      quantity: z.number().positive().describe("How much, in `unit`."),
      unit: z.enum(UNITS).describe("The unit the cook said, or \"pcs\" for a count (\"3 tomates\")."),
    }))
    .min(1)
    .max(MAX_ITEMS)
    .describe("One entry per ingredient, in the order the cook listed them."),
});

type Input = z.infer<typeof _inputSchema>;

export type CellarItem = { ingredientId: string; quantity: number; unit: Unit };

/**
 * The lines to write, or the error the model has to act on.
 *
 * Pure, so the rules are pinned with no model and no database: an unknown id throws, naming it; the
 * same ingredient twice in the same unit is one line, its quantities summed, since "2 tomates… et
 * encore 1 tomate" is three tomatoes, not two writes to one row.
 */
export const toCellarItems = (items: readonly CellarItem[], missing: readonly string[]): CellarItem[] => {
  if (missing.length > 0) {
    throw new Error(
      `These ingredient ids do not exist: ${missing.join(", ")}. ` +
      "Pass only ids searchIngredients returned in this conversation, copied exactly.",
    );
  }

  const merged = new Map<string, CellarItem>();

  for (const item of items) {
    const key = `${item.ingredientId}|${item.unit}`;
    const seen = merged.get(key);

    merged.set(key, seen ? { ...seen, quantity: seen.quantity + item.quantity } : { ...item });
  }

  return [...merged.values()];
};

/** What the model reads for a line that failed: the server's own words, which name the cellar's units. */
const _reasonOf = (error: unknown): string => {
  if (error instanceof ConvexError && typeof error.data?.message === "string") return error.data.message;
  return error instanceof Error ? error.message : String(error);
};

type Caller = {
  /** The household whose cellar this is: the one `sendMessage` checked the cook belongs to. */
  householdId: Id<"households">;
};

/** A purchase is reported as the cook's (ADR 0019), so adding needs to know whose turn this is. */
type Cook = Caller & { userId: Id<"users"> };

/** Which way the stock moves, with what that way needs: only an add has a cook to report. */
type Move = ({ action: "add" } & Cook) | ({ action: "remove" } & Caller);

/** Both tools, told apart only by which way the stock moves. */
const _cellarTool = (description: string) => (move: Move) =>
  createTool({
    description,
    inputSchema: _inputSchema,
    execute: async (ctx, { items }: Input): Promise<CellarChange> => {
      const missing = await ctx.runQuery(internal.router.ingredients.missingIds._internal, {
        ids: [...new Set(items.map((item) => item.ingredientId))],
      });

      const lines: CellarChangeLine[] = [];
      const absent: string[] = [];
      const failed: CellarChange["failed"] = [];

      for (const item of toCellarItems(items, missing)) {
        const args = { ...item, householdId: move.householdId, ingredientId: item.ingredientId as Id<"ingredients"> };

        try {
          if (move.action === "add") {
            const { cellarItemId, struck } = await ctx.runMutation(internal.router.cellars.addToCellar._internal, {
              ...args,
              actor: move.userId,
            });
            lines.push({ ...item, cellarItemId, restoreToList: struck });
          } else {
            const { cellarItemId, unit, removed } = await ctx.runMutation(internal.router.cellars.removeFromCellar._internal, args);

            // A row at 0 gave nothing: that is none of it held, and a line at 0 would make the
            // chat drop this whole change, card and undo, with every line that did move.
            if (removed > 0) lines.push({ ingredientId: item.ingredientId, cellarItemId, unit, quantity: removed });
            else absent.push(item.ingredientId);
          }
        } catch (error) {
          // None of it on the shelf is the cellar lagging behind the kitchen, not a failure: there
          // was nothing to take, and nothing for the cook to answer.
          if (move.action === "remove" && isAppError(error) && error.data.code === "NOT_FOUND") absent.push(item.ingredientId);
          else failed.push({ ingredientId: item.ingredientId, reason: _reasonOf(error) });
        }
      }

      return { v: 1, action: move.action, householdId: move.householdId, lines, absent, failed };
    },
  });

const _addTool = _cellarTool(
  "Puts ingredients in the cook's cellar (the food they own at home), several at once, and shows " +
  "the cook what was added with a button to undo it. Call it when the cook asked for it, or said " +
  "yes when you offered. Pass ingredient ids from searchIngredients. Lines in " +
  "`failed` were not added: tell the cook which, and why. Never say something was added unless it " +
  "is in `lines`, and never list the lines in your text: the card shows them.",
);

const _removeTool = _cellarTool(
  "Takes ingredients out of the cook's cellar (the food they own at home), several at once, and " +
  "shows the cook what was removed with a button to undo it. Call it when the cook asked for it, " +
  "or said yes when you offered. Pass ingredient ids from " +
  "searchIngredients. A line's quantity is what was really removed, which is less than asked when " +
  "the cellar held less. Ids in `absent` were not in the cellar at all: that is normal, not an " +
  "error, so do not apologise for it. Lines in `failed` were not removed: the reason says what the " +
  "cellar holds, so ask the cook how much that is rather than converting between grams and pieces " +
  "yourself. Never list the lines in your text: the card shows them.",
);

/** Factories, like `searchRecipesTool`: whose cellar it writes to is not the model's to state. */
export const addToCellarTool = (cook: Cook) => _addTool({ action: "add", ...cook });
export const removeFromCellarTool = (caller: Caller) => _removeTool({ action: "remove", ...caller });
