import { v } from "convex/values";

import { accountEventOf } from "@convex/functions/users/accountEvent";
import { type PurgeOutcome, purgeUser } from "@convex/functions/users/purgeUser";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { internalMutation } from "@convex/procedures";

/**
 * Anonymizes an account whose deletion is due. Scheduled by `requestDeletion` for the due date;
 * internal, so no client can reach it.
 *
 * `force` erases instead, at once, for a bot or a spammer, and only from a terminal or the dashboard:
 *
 *   npx convex run router/users/purge:_internal '{"userId":"<id>","force":true}' --prod
 *
 * Reports `account deleted` with its `outcome` (ADR 0019) when the purge ran; a job that woke to a
 * cleared or later date skipped, and reports nothing.
 */
export const _internal = internalMutation({
  args: { userId: v.id("users"), force: v.optional(v.boolean()) },
  handler: async (ctx, { userId, force }): Promise<PurgeOutcome> => {
    const purged = await purgeUser(ctx, userId, { force: force ?? false });
    if (purged.outcome === "skipped") return purged.outcome;

    const event = accountEventOf(purged.user, "account deleted", { outcome: purged.outcome });
    if (event) await captureEvent(ctx, event);

    return purged.outcome;
  },
});
