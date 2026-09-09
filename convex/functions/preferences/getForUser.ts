import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

type PreferencesCtx = Pick<QueryCtx, "db">;

/**
 * One user's saved preferences, or `null` when they have never answered.
 *
 * `null` is a real answer here rather than a missing one, and callers must not paper over it: it
 * is the difference between "eats anything" and "nobody has asked", and only the second may be
 * silently replaced by defaults. See the note on `userPreferences`.
 *
 * `.unique()` rather than `.first()` on purpose. `by_user` is not a unique index — Convex has
 * none — so one row per user is an invariant `save` upholds rather than one the database does. A
 * second row means the upsert has been bypassed, and `.first()` would answer with whichever row
 * the index reached first: the user would see one of their two answers, chosen arbitrarily and
 * differing between reads, with nothing anywhere reporting a problem.
 */
export const getForUser = async (
  ctx: PreferencesCtx,
  userId: Id<"users">,
): Promise<Doc<"userPreferences"> | null> =>
  ctx.db
    .query("userPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
