import { reportedRecipeForViewer } from "@convex/functions/recipes/reportedRecipe";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { authMutation } from "@convex/procedures";
import { v } from "convex/values";

/**
 * Records that a cook sent a recipe's link from the share sheet. It writes no row: the event is
 * the whole of it, and product events are sent from the backend, never from the app.
 *
 * `authMutation`, not `ownedMutation`: sharing is reading, and any signed-in cook may read, and so
 * pass on, any recipe (ADR 0014), a favorited catalog one included. There is no write to gate.
 *
 * Not rate-limited: each call schedules one PostHog send and spends no model and no storage, which
 * is what ADR 0018 limits. A client calling it in a loop shows in PostHog as one cook's outlier.
 */
export const authed = authMutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, { id }) => {
    await captureEvent(ctx, {
      event: "recipe shared",
      distinctId: ctx.userId,
      properties: await reportedRecipeForViewer(ctx, id, ctx.userId),
    });

    return null;
  },
});
