import { EQUIPMENTS } from "@shared/equipments";
import { defineTable } from "convex/server";
import { v } from "convex/values";

const vEquipments = v.union(...EQUIPMENTS.map(v.literal));

export const households = defineTable({
  name: v.string(),
  equipments: v.array(vEquipments),
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
