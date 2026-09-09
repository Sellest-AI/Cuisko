import { save } from "@convex/functions/preferences/save";
import { authMutation } from "@convex/procedures";
import { vAllergens, vDiet, vNutritionPreferences } from "@convex/schema/preferences";

/**
 * Upserts the caller's own preferences. Last answer wins.
 *
 * No `userId` argument, so the row written is always `ctx.userId`'s — a screen that displays a
 * household's constraints has no way to write anybody else's row, whatever it was showing.
 *
 * Called at the end of the tunnel rather than per step, and **folds into the generate mutation
 * when that lands**: one round trip, atomic with the generation, and no client left deciding what
 * to do when the save succeeds and the plan does not. The logic already lives in
 * `functions/preferences/`, so that move is a two-line change here.
 */
export const authed = authMutation({
  args: { diet: vDiet, avoids: vAllergens, seeks: vNutritionPreferences },
  handler: (ctx, values) => save(ctx, ctx.userId, values),
});
