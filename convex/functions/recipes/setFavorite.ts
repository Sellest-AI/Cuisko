import { ConvexError } from "convex/values";

import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

type SetCtx = Pick<MutationCtx, "db">;

type Args = {
  userId: Id<"users">;
  recipeId: Id<"recipes">;
  /** The state the caller wants, not a request to flip whatever is there — see below. */
  liked: boolean;
};

/**
 * Sets the caller's favorite state for one recipe, and echoes the state it ensured.
 *
 * **A set, not a toggle, on purpose.** The client reads `isFavorited` off its reactive `getOne`
 * payload and sends the state it wants. Two fast taps before that payload catches up both read
 * `false`, both send `true`, and the recipe ends up favorited once — one effective action. A
 * server-side toggle would have inverted the state twice and quietly unfavorited it. The cost is
 * that concurrent opposing writes are last-write-wins, which is what a set means.
 *
 * Any existing recipe may be favorited, whoever wrote it — catalog rows with no `userId` included.
 * That is the point: the shelf is where a cook keeps recipes that are not theirs to edit. The one
 * refusal is a recipe that does not exist, so a stale link cannot leave a row nothing will ever
 * cascade away.
 *
 * The index should hold at most one row per pair. `liked: true` keeps the oldest and deletes any
 * others rather than returning early on the first: if a race ever left two, this is the write that
 * heals it rather than the read that has to cope with it. The oldest is the one kept so that
 * favoriting an already-favorited recipe does not move it to the front of the shelf.
 */
export const setFavorite = async (
  ctx: SetCtx,
  { userId, recipeId, liked }: Args,
): Promise<{ liked: boolean }> => {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe) throw new ConvexError({ code: "NOT_FOUND", message: "Recipe not found" });

  const [kept, ...duplicates] = await ctx.db
    .query("recipeFavorites")
    .withIndex("by_user_and_recipe", (q) => q.eq("userId", userId).eq("recipeId", recipeId))
    .collect();

  const stale = liked ? duplicates : kept ? [kept, ...duplicates] : [];
  await Promise.all(stale.map((row) => ctx.db.delete(row._id)));

  if (liked && !kept) await ctx.db.insert("recipeFavorites", { userId, recipeId });

  return { liked };
};
