import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../procedures";

/**
 * The identity every authenticated procedure receives: the auth-owned `users` row and our
 * `usersExtended` row merged into one object.
 *
 * `_id` and `_creationTime` come from `users`; the extended row's id is preserved as
 * `_idExtended` so a handler that needs to patch app fields still can.
 */
export type AppUser = Omit<Doc<"usersExtended">, "_id" | "_creationTime"> &
  Doc<"users"> & { _idExtended: Id<"usersExtended"> };

/**
 * Only `db` is required, so this is callable from a query, a mutation, or an internal
 * query invoked on behalf of an action.
 */
type ReaderCtx = Pick<QueryCtx, "db">;

export const loadUser = async (
  ctx: ReaderCtx,
  userId: Id<"users">,
): Promise<AppUser | null> => {
  const [base, extended] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("usersExtended")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first(),
  ]);

  // A user with no extended row is a half-created account, not a valid identity.
  if (!base || !extended) return null;

  // `base` last: its `_id` / `_creationTime` are the ones callers expect.
  return { ...extended, ...base, _idExtended: extended._id };
};
