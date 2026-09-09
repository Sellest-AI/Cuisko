import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

import { sortAllergens } from "@shared/allergens";
import { NUTRITION_PREFERENCES, type PreferenceValues } from "@shared/preferences";

import { getForUser } from "./getForUser";

/**
 * The caller's own preferences, upserted. Last answer wins.
 *
 * **One write path, and no conditional variant of it.** An earlier design had a `seedIfAbsent`
 * beside this, to stop the tunnel writing a household's inherited constraints back as the caller's
 * own answer. The tunnel's merged constraint list removed the need: what the caller ticks is
 * theirs by construction, and what they inherit is never folded into "mine", so the only thing
 * that ever reaches here is an assertion the caller actually made.
 *
 * ⚠️ **It writes exactly one row, the caller's.** Every argument except `userId` is a value, never
 * an id, so there is no shape of input that could reach a housemate's row — which is what makes
 * unticking a shared constraint safe to do from a screen that shows other people's answers.
 *
 * The mutually exclusive pair (`low-calorie` / `high-calorie`) is NOT rejected here — see
 * `EXCLUSIVE_PREFERENCES`. The screen unticks one when the other is ticked; a validator that
 * refused the pair would turn a stale client into a write that fails rather than a screen that
 * corrects itself, and the pair is unsatisfiable rather than dangerous.
 */
export const save = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  values: PreferenceValues,
): Promise<void> => {
  const existing = await getForUser(ctx, userId);

  /**
   * Both lists are stored in their vocabulary's own order, deduplicated. A set arriving in the
   * order the user happened to tick it would make two identical answers compare unequal as arrays
   * and reshuffle a chip row between renders — the argument `sortAllergens` already makes, applied
   * to the other list by filtering the vocabulary rather than sorting the input.
   */
  const answer = {
    diet: values.diet,
    avoids: sortAllergens(values.avoids),
    seeks: NUTRITION_PREFERENCES.filter((preference) => values.seeks.includes(preference)),
    updatedAt: Date.now(),
  };

  if (existing) {
    await ctx.db.patch(existing._id, answer);
    return;
  }

  await ctx.db.insert("userPreferences", { userId, ...answer });
};
