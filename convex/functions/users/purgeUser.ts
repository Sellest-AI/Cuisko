import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import { deleteConversationsOf } from "../assistant/deleteConversationsOf";
import { cascadeDelete } from "../cascade";
import { scheduleImageTreeDeletion } from "../media/imageTree";
import { deleteSignIns } from "./deleteSignIns";

/** What the purge did: nothing (not due, or already done), the tombstone, or nothing left at all. */
export type PurgeOutcome = "skipped" | "anonymized" | "erased";

/**
 * Removes a person from the database while keeping what they cooked and stocked, anonymously.
 *
 * Runs at `deletionDueAt`, scheduled by `requestDeletion`, and checks the date again here because
 * nothing cancels the job: signing in only clears the date. A job that wakes up to find the date
 * unset, or moved later by a fresh request, does nothing.
 *
 * - The `users` row stays as a tombstone: its id is what every statistic joins on. Everything on it
 *   that names a person is cleared, and `usersExtended.deletedAt` makes `loadUser` refuse it.
 * - A household they shared loses their membership and nothing else. A household where they were
 *   the only member keeps its membership (the one thing tying its cellar and plans to an id) and
 *   loses its name and invite code, the first because it can name someone, the second so nobody
 *   walks into it.
 * - Their sign-ins go (`deleteSignIns`), so the address is free to register again, and so do their
 *   conversations with the assistant (`deleteConversationsOf`).
 * - Their photos go, whole trees. Recipes, favorites and preferences stay.
 *
 * `force` is for a bot or a spammer, run by hand: no date check, and the person is erased instead.
 * Their solo households are deleted outright, their recipes archived and detached (a recipe is never
 * removed, ADR 0017), and the account itself goes through `CASCADE.users`, so no row names them.
 *
 * @limitation One transaction. A cook with a very large kitchen or recipe book could exceed a
 * mutation's read and write budget. The fix is to schedule one batch per household, and no caller
 * would change.
 */
export const purgeUser = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  { force }: { force: boolean },
): Promise<PurgeOutcome> => {
  const now = Date.now();
  const extended = await ctx.db
    .query("usersExtended")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  const isDue =
    extended?.deletedAt === undefined &&
    extended?.deletionDueAt !== undefined &&
    extended.deletionDueAt <= now;

  if (!force && !isDue) return "skipped";

  // Read before anything is cleared: the failed-attempt counters are keyed by this address.
  const user = await ctx.db.get(userId);

  await deleteSignIns(ctx, userId, user?.email);
  await deleteConversationsOf(ctx, userId);
  await _leaveHouseholds(ctx, userId, { force, now });
  await _deletePhotos(ctx, userId);

  const formerMemberships = await ctx.db
    .query("householdFormerMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const row of formerMemberships) await ctx.db.delete(row._id);

  if (force) {
    // Archived, never removed (ADR 0017): another household may have planned or cooked one, and its
    // meal points at the row. Archiving takes them off every list; `CASCADE.users` then detaches
    // every recipe of theirs, archived before or now, so none points at a deleted user.
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user_and_is_archived", (q) => q.eq("userId", userId).eq("isArchived", false))
      .collect();
    for (const recipe of recipes) await ctx.db.patch(recipe._id, { isArchived: true, updatedAt: now });

    await cascadeDelete(ctx, "users", userId);
    return "erased";
  }

  await ctx.db.patch(userId, {
    name: undefined,
    image: undefined,
    email: undefined,
    emailVerificationTime: undefined,
    phone: undefined,
    phoneVerificationTime: undefined,
  });

  // `isDue` proved the row exists; the check only narrows the type.
  if (extended) {
    await ctx.db.patch(extended._id, {
      deletedAt: now,
      deletionDueAt: undefined,
      currentHouseholdId: undefined,
      updatedAt: now,
    });
  }

  return "anonymized";
};

/**
 * Leaves every household. A shared one keeps its other members and loses only this one; a solo
 * one is archived without a name (anonymize) or deleted with everything in it (force).
 */
const _leaveHouseholds = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  { force, now }: { force: boolean; now: number },
) => {
  const memberships = await ctx.db
    .query("householdUsers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  for (const membership of memberships) {
    // Two rows answer the only question asked: is anyone besides this person in it?
    const members = await ctx.db
      .query("householdUsers")
      .withIndex("by_household", (q) => q.eq("householdId", membership.householdId))
      .take(2);
    const isShared = members.some((member) => member.userId !== userId);

    if (isShared) await ctx.db.delete(membership._id);
    else if (force) await cascadeDelete(ctx, "households", membership.householdId);
    else await ctx.db.patch(membership.householdId, { name: "", inviteCode: undefined, updatedAt: now });
  }
};

/**
 * A photo of a fridge or a face. No recipe holds one, so the whole tree goes.
 *
 * This is also what removes the photos sent to the assistant: `saveQuestion` only accepts an image
 * the cook claims here, and `deleteConversationsOf` leaves the files alone.
 */
const _deletePhotos = async (ctx: MutationCtx, userId: Id<"users">) => {
  const photos = await ctx.db
    .query("userImages")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .collect();

  for (const photo of photos) {
    await scheduleImageTreeDeletion(ctx, photo.imageId);
    await ctx.db.delete(photo._id);
  }
};
