import { defineTable } from "convex/server";
import { v } from "convex/values";

import { MEAL_SLOTS } from "@shared/mealSlots";

import { vEquipments } from "./cellars";

/** S11 — the shared vocabulary produces the runtime validator, so the two cannot drift. */
export const vMealSlot = v.union(...MEAL_SLOTS.map(v.literal));
export const vMealSlots = v.array(vMealSlot);

/**
 * The kitchen, and what it usually plans for. Never how a person eats: that follows them between
 * households and lives on [`userPreferences`](./preferences.ts).
 *
 * ⚠️ **`equipments` and the three defaults are optional, and the `undefined` is doing work.** The
 * household row always exists, so unlike `userPreferences` it cannot use row absence to mean
 * "never asked" — and without that distinction an empty `equipments` reads identically to a
 * kitchen nobody has described yet. The tunnel's setup step needs to tell those apart: one is an
 * answer to prefill, the other is a default to offer. This is what
 * [`shared/allergens.ts`](../../shared/allergens.ts) already insists on for `ingredients.allergens`
 * and for the same reason, `[]` earns a claim that silence does not.
 *
 * They are defaults rather than the plan itself: what a generated week actually used belongs to
 * that week, and overwriting these is how the next run opens on the last run's answers.
 */
export const households = defineTable({
  name: v.string(),
  equipments: v.optional(vEquipments),
  defaultPeople: v.optional(v.number()),
  defaultSlots: v.optional(vMealSlots),
  defaultDays: v.optional(v.number()),
  /**
   * What another cook types to join. Unset once the last member leaves: an empty household is kept
   * as an archive, and nobody holding an old code may walk into its cellar.
   */
  inviteCode: v.optional(v.string()),
  updatedAt: v.number(), // S5
}).index("by_invite_code", ["inviteCode"]);

/**
 * Who belongs to which household.
 *
 * No `updatedAt` (S5b): there is nothing on the row but the two ids, so a membership is inserted or
 * deleted, never edited — the field would record the moment of the insert and never change again.
 */
export const householdUsers = defineTable({
  householdId: v.id("households"),
  userId: v.id("users"),
})
  .index("by_household", ["householdId"])
  .index("by_user", ["userId"])
  .index("by_household_and_user", ["householdId", "userId"]);

/**
 * Who used to belong to which household and is not there now: at most one row per person and
 * household. Leaving writes it, rejoining deletes it, so `_creationTime` is always their latest
 * departure and a cook who comes and goes is one entry, not one per trip.
 *
 * A table of its own rather than a `leftAt` on `householdUsers`, so a membership row keeps meaning
 * "a member right now" and no read of it has to learn to skip the ones that ended — the read that
 * forgot would let someone who left keep reading the cellar. No `updatedAt` (S5b): a row is written
 * or deleted, never edited.
 *
 * `by_household_and_user` also answers "everyone who left this household" through its prefix, so
 * there is no separate `by_household`.
 */
export const householdFormerMembers = defineTable({
  householdId: v.id("households"),
  userId: v.id("users"),
})
  .index("by_household_and_user", ["householdId", "userId"])
  .index("by_user", ["userId"]);
