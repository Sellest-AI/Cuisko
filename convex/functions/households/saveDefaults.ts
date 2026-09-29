import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import { EQUIPMENTS, type Equipment } from "@shared/equipments";
import { MEAL_SLOTS, type MealSlot } from "@shared/mealSlots";

type Defaults = {
  equipments: Equipment[];
  defaultPeople: number;
  defaultSlots: MealSlot[];
  defaultDays: number;
};

/**
 * What the household usually plans for, upserted onto the row. Last answer wins.
 *
 * The companion to `preferences/save`, split from it because the two answer different questions
 * about different owners: an allergy follows the person, an oven stays in the kitchen. Both are
 * written at the end of the tunnel, and **both fold into the generate mutation when that lands** —
 * one round trip, atomic with the generation, and no client left deciding what to do when one of
 * the two writes succeeds.
 *
 * ⚠️ **Every field is overwritten, including with an empty list.** That is what makes the
 * tunnel's answer the answer: a household that unticks its last appliance means it, and a merge that
 * preserved the old value would leave the kitchen holding a machine the user just said was gone.
 * The column is optional so that *never having answered* stays distinguishable from answering
 * nothing — see `convex/schema/households.ts` — and this is the only writer that can end that
 * silence.
 */
export const saveDefaults = async (
  ctx: MutationCtx,
  householdId: Id<"households">,
  values: Defaults,
): Promise<void> => {
  /**
   * Both lists are stored in their vocabulary's own order, deduplicated — the argument
   * `preferences/save` makes for `avoids`, applied here for the same reason: two identical answers
   * must compare equal as arrays, or a prefilled chip row reshuffles itself between runs.
   */
  await ctx.db.patch(householdId, {
    equipments: EQUIPMENTS.filter((equipment) => values.equipments.includes(equipment)),
    defaultPeople: Math.min(10, Math.max(1, values.defaultPeople)),
    defaultSlots: MEAL_SLOTS.filter((slot) => values.defaultSlots.includes(slot)),
    defaultDays: Math.min(14, Math.max(1, values.defaultDays)),
    updatedAt: Date.now(),
  });
};
