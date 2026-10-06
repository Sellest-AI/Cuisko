/**
 * The assistant shapes that cross a function boundary and are never a row.
 *
 * Nothing here has a table behind it, and that is the point of the file: the assistant judges, it
 * does not store. It sits under `convex/schema/` for the reason `ingredientPayloads.ts` does — a
 * payload in flight is described where the vocabulary it is built from lives.
 */

import { v } from "convex/values";

/**
 * `Intent`, as a validator.
 *
 * **The type is NOT inferred from this one**, which reverses this folder's usual direction (see
 * `i18n.ts`, where `Infer` makes the validator the source). It has to: `Intent` is declared in
 * `shared/inputIntent.ts` because `readIntent` runs on the client, and `src/**` may not import
 * Convex (ADR 0002). A validator cannot live there, and the union cannot move here.
 *
 * So this mirrors it, and the mirror is pinned rather than trusted: `router/assistant/classify.ts`
 * annotates its handler with `Infer<typeof vIntent>`, so a reason added to one and not the other is
 * a typecheck failure at the seam rather than a runtime rejection in front of a shopper.
 */
export const vIntent = v.union(
  v.object({
    kind: v.literal("chat"),
    reason: v.union(
      v.literal("trigger"),
      v.literal("question"),
      v.literal("sentence"),
      v.literal("model"),
    ),
  }),
  v.object({ kind: v.literal("ingredient") }),
  v.object({ kind: v.literal("recipe") }),
  v.object({ kind: v.literal("unknown") }),
);

/**
 * The recipe a question was asked from, as the cooking screen sends it with the question.
 *
 * The validator is the source of `CookingRecipe` (`functions/assistant/recipeBrief.ts`), the
 * folder's usual direction. `step` and `servings` are only typed here; what counts as a step the
 * method has, or a number of people, is `recipeBrief`'s to judge, since it is the one holding the
 * recipe to judge them against.
 */
export const vCookingRecipe = v.object({
  id: v.id("recipes"),
  step: v.optional(v.number()),
  servings: v.optional(v.number()),
});
