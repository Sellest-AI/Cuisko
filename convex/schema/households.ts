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
  inviteCode: v.string(),
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
