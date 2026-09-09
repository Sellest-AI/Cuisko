import { saveDefaults } from "@convex/functions/households/saveDefaults";
import { householdMutation } from "@convex/procedures";
import { vEquipments } from "@convex/schema/cellars";
import { vMealSlots } from "@convex/schema/households";
import { v } from "convex/values";

/**
 * The kitchen and the shape of a usual week, as the tunnel's setup step just answered them.
 *
 * `householdMutation` takes the `householdId` and proves membership before the handler runs, so
 * there is no path here that writes a household the caller does not belong to. No `userId`
 * anywhere: these are the household's answers, not a member's, and nothing on this row records who
 * gave them.
 */
export const authed = householdMutation({
  args: {
    equipments: vEquipments,
    defaultPeople: v.number(),
    defaultSlots: vMealSlots,
    defaultDays: v.number(),
  },
  handler: (ctx, values) => saveDefaults(ctx, ctx.householdId, values),
});
