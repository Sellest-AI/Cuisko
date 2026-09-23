import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import { createHousehold } from "../households/createHousehold";

type CreatedCtx = Pick<MutationCtx, "db">;

/**
 * Everything a new account needs beside the row @convex-dev/auth wrote: our `usersExtended` sibling,
 * and a household of its own.
 *
 * `loadUser` returns null when a user has no `usersExtended` row, and every authenticated procedure
 * treats null as unauthenticated, so without this a freshly registered user would sign in and then
 * be rejected by every query. The household matters the same way one layer down: every screen
 * past the home one is scoped by a `householdId`.
 *
 * The order is load-bearing. The existing-row check comes first, because the auth callback is not
 * guaranteed to run exactly once and a second run must not hand out a second household. The
 * household comes before the `usersExtended` insert so that row is born pointing at it: one insert
 * rather than an insert and a patch. The membership can be written ahead of it because the `users`
 * row already exists by the time the callback runs.
 */
export const onUserCreated = async (ctx: CreatedCtx, userId: Id<"users">): Promise<void> => {
  const existing = await ctx.db
    .query("usersExtended")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  if (existing) return;

  const householdId = await createHousehold(ctx, userId);

  await ctx.db.insert("usersExtended", {
    userId,
    role: "USER",
    currentHouseholdId: householdId,
    updatedAt: Date.now(),
  });
};
