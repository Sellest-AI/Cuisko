import { v } from "convex/values";

import { COOKING_TIMES } from "@shared/cookingTimes";

/**
 * How long the cook has this week, as `getDraft` accepts it.
 *
 * ⚠️ Never a column, and that is a rule rather than an omission — see
 * [`cookingTimes.ts`](../../shared/cookingTimes.ts). How long somebody had to cook this week is
 * not a fact about how they eat, so `commitPreferences` must not learn it.
 *
 * Built from the same literals the tunnel draws, so an option the screen offers cannot be one the
 * server rejects.
 */
export const vCookingTime = v.union(...COOKING_TIMES.map(v.literal));
