import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Unit } from "@shared/ingredients";
import { foldSpelling } from "@shared/ingredientMatch";
import { ConvexError } from "convex/values";

/** Every product wears this for now. Stored per row so products can get their own emoji later. */
const PRODUCT_EMOJI = "📦";

const MAX_NAME_LENGTH = 80;

/**
 * The word a quantity leaves behind: "500 ml of shampoo" reaches here as "of shampoo". Only the
 * partitives go, in French and English, and only one. A wider list of articles would eat the brands
 * the classifier allows, and "The Body Shop" would lose its first word.
 *
 * @limitation A brand starting with one of these still loses it: "de buyer" is stored as "buyer",
 * since the server is handed the name alone and cannot tell whether a quantity came before it.
 * Accepted because such brands are rare and the fix is a parser on the client, see `input.tsx`.
 */
const LEADING_PARTITIVE = /^(?:(?:de\s+l|d)['’]\s*|(?:de\s+la|de|du|des|of)(?:\s+|$))/i;

const _cleanName = (name: string) => name.trim().replace(LEADING_PARTITIVE, "").trim().replace(/\s+/g, " ");

/** Falls back to the name because the fold keeps only a-z and 0-9, and an empty key would merge every other script. */
const _nameKey = (name: string) => foldSpelling(name) || name.toLowerCase();

type Args = {
  householdId: Id<"households">;
  name: string;
  unit: Unit;
  quantity: number;
};

/**
 * Puts a non-food product on a household's list, merging into the row of the same name and unit.
 *
 * Touches nothing but `groceryProducts`: a product is never owned, so no cellar, recently-used or
 * ingredient row comes of it, and the plan's numbers never see it.
 *
 * Merging asks for the exact unit, where `addToGroceryList` climbs a ladder: a product is typed by
 * hand and has no claims to keep whole, so "1 l" then "500 ml" drawing two cards is worth less than
 * a second copy of that ladder.
 */
export const addGroceryProduct = async (
  ctx: MutationCtx,
  args: Args,
): Promise<{ id: Id<"groceryProducts">; merged: boolean }> => {
  const name = _cleanName(args.name);

  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid product name." });
  }

  if (!Number.isFinite(args.quantity) || args.quantity <= 0) {
    throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid product quantity." });
  }

  const nameKey = _nameKey(name);
  const rows = await ctx.db
    .query("groceryProducts")
    .withIndex("by_household_and_name_key", (q) => q.eq("householdId", args.householdId).eq("nameKey", nameKey))
    .collect();

  const row = rows.find((candidate) => candidate.unit === args.unit);

  if (row) {
    await ctx.db.patch(row._id, { quantity: row.quantity + args.quantity, updatedAt: Date.now() });

    return { id: row._id, merged: true };
  }

  const id = await ctx.db.insert("groceryProducts", {
    householdId: args.householdId,
    name,
    nameKey,
    emoji: PRODUCT_EMOJI,
    unit: args.unit,
    quantity: args.quantity,
    updatedAt: Date.now(),
  });

  return { id, merged: false };
};
