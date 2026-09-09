import { defineTable } from "convex/server";
import { v } from "convex/values";

import { ALLERGENS } from "@shared/allergens";
import { DIETS } from "@shared/diets";
import { NUTRITION_PREFERENCES } from "@shared/preferences";

/** S11 — the shared vocabulary produces the runtime validator, so the two cannot drift. */
export const vDiet = v.union(...DIETS.map(v.literal));
export const vAllergens = v.array(v.union(...ALLERGENS.map(v.literal)));
export const vNutritionPreferences = v.array(v.union(...NUTRITION_PREFERENCES.map(v.literal)));

/**
 * How one person eats — the constraints that follow them between households.
 *
 * On the user rather than on `householdUsers` because a membership ends and an allergy does not:
 * someone who leaves a flatshare takes their gluten with them, and a preference re-answered on
 * arrival is the friction this table exists to delete.
 *
 * Not on `usersExtended` either, which `loadUser` merges into `AppUser` on every authenticated
 * request. That row is *identity*, and this is domain data — the household aggregate must not have
 * to read four people's `role` to learn who avoids gluten.
 *
 * ⚠️ **A missing row means "never asked", and reads as `omnivore` / `[]` / `[]`.** So there is no
 * create-on-signup hook, and nothing to backfill. It means unsaid, not unconstrained: a member who
 * has never answered contributes nothing to their household's aggregate, and no table shape can
 * fix that — what keeps it honest is that the tunnel SHOWS the aggregate rather than applying it
 * invisibly.
 *
 * `seeks` is deliberately not aggregated with the rest and is never rendered as a verdict — see
 * [`NUTRITION_PREFERENCES`](../../shared/preferences.ts).
 */
export const userPreferences = defineTable({
  userId: v.id("users"),
  diet: vDiet,
  avoids: vAllergens,
  seeks: vNutritionPreferences,
  updatedAt: v.number(), // S5
}).index("by_user", ["userId"]);
