import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

import { sortAllergens } from "@shared/allergens";
import { strictestDietOf } from "@shared/diets";
import type { PlanningSeed, PreferenceValues } from "@shared/preferences";

import { getForUser } from "./getForUser";

type SeedCtx = Pick<QueryCtx, "db">;

/**
 * What a user who has never answered contributes, and what the tunnel opens on for them.
 *
 * `omnivore` / `[]` / `[]` is the reading of a missing row, and it is deliberately the identity of
 * both aggregations below: an unanswered member widens nothing and excludes nothing. It means
 * *unsaid*, not *unconstrained* — see the note on the `userPreferences` table.
 */
const UNSAID: PreferenceValues = { diet: "omnivore", avoids: [], seeks: [] };

/**
 * Everything the planning tunnel needs to open already answered: the caller's own row, the union
 * of everybody else's, and the household's kitchen and plan defaults.
 *
 * ⚠️ **`others` excludes the caller.** Not a tidiness: with the caller folded in, a chip they hold
 * alone would come back marked as inherited, and unticking it would leave their own row untouched
 * — the constraint they just switched off returning on the next run with no way to remove it.
 * The toggle table's rows three and five both turn on this exclusion.
 *
 * ⚠️ **Nothing here says WHO.** `others` is a union with no name and no id attached, which is the
 * difference between reporting what this table cannot eat and reporting a housemate's health data
 * to whoever opens the tunnel. The screen says "someone in your household" because that is
 * genuinely all this returns.
 *
 * One index read per member, which is a fan-out proportional to household size — a household is a
 * handful of people, and the alternative is a `by_household` denormalisation of preferences that
 * every `save` would then have to keep in step across a table it does not own.
 */
export const getPlanningSeed = async (
  ctx: SeedCtx,
  householdId: Id<"households">,
  userId: Id<"users">,
): Promise<PlanningSeed> => {
  const household = await ctx.db.get(householdId);

  const memberships = await ctx.db
    .query("householdUsers")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();

  const others = memberships.filter((membership) => membership.userId !== userId);

  const rows = await Promise.all(others.map((membership) => getForUser(ctx, membership.userId)));

  /** A member with no row is skipped rather than counted as `omnivore` / `[]`: same answer, and it keeps the reduce over people who actually answered. */
  const answered = rows.filter((row) => row !== null);

  const mine = await getForUser(ctx, userId);

  return {
    mine: mine ? { diet: mine.diet, avoids: mine.avoids, seeks: mine.seeks } : UNSAID,
    others: {
      diet: strictestDietOf(answered.map((row) => row.diet)),
      avoids: sortAllergens(answered.flatMap((row) => row.avoids)),
    },
    household: {
      equipments: household?.equipments,
      defaultPeople: household?.defaultPeople,
      defaultSlots: household?.defaultSlots,
      defaultDays: household?.defaultDays,
    },
  };
};
