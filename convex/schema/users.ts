import { defineTable } from "convex/server";
import { v } from "convex/values";

/** S11 — one declaration produces the runtime validator AND the TypeScript type. */
export const ROLES = ["USER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];
const vRole = v.union(...ROLES.map(v.literal));

/**
 * App-owned fields for an authenticated user.
 *
 * `users` itself belongs to @convex-dev/auth and is rewritten by the component on every
 * sign-in, so nothing of ours may live there. `procedures.ts` merges the two rows into a
 * single `AppUser` before any handler runs, so callers never see the split.
 */
export const usersExtended = defineTable({
  userId: v.id("users"),
  role: vRole,
  /**
   * The household the app shops for. Optional because an account created before households were
   * made at sign-up has none; the reads fall back to the oldest membership when it is unset.
   */
  currentHouseholdId: v.optional(v.id("households")),
  /**
   * Set while a deletion is pending: the moment the purge will anonymize the account, unless the
   * cook signs back in first. Unset is a normal account. Not a scheduled function's id, which
   * would be an unindexable foreign key to a system table (C4): the purge re-reads this when it
   * fires and does nothing if it was cleared or moved, so cancelling is a plain patch.
   */
  deletionDueAt: v.optional(v.number()),
  /**
   * Set once the account has been anonymized. The row is then a tombstone: `loadUser` returns null
   * for it, so no procedure can act as it, and every statistic that means "active cooks" filters on
   * this being unset. The `users` row and the content that points at it stay (`functions/users/purgeUser.ts`,
   * docs/ARCHITECTURE.md § Identity).
   */
  deletedAt: v.optional(v.number()),
  updatedAt: v.number(), // S5
})
  .index("by_user", ["userId"])
  .index("by_current_household", ["currentHouseholdId"]);
