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

export const householdUsers = defineTable({
  householdId: v.id("households"),
  userId: v.id("users"),
  updatedAt: v.number(), // S5
})
  .index("by_household", ["householdId"])
  .index("by_user", ["userId"])
  .index("by_household_and_user", ["householdId", "userId"]);
