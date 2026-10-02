import { v } from "convex/values";

import { purgeUser } from "@convex/functions/users/purgeUser";
import { internalMutation } from "@convex/procedures";

/**
 * Anonymizes an account whose deletion is due. Scheduled by `requestDeletion` for the due date;
 * internal, so no client can reach it.
 *
 * `force` erases instead, at once, for a bot or a spammer, and only from a terminal or the dashboard:
 *
 *   npx convex run router/users/purge:_internal '{"userId":"<id>","force":true}' --prod
 */
export const _internal = internalMutation({
  args: { userId: v.id("users"), force: v.optional(v.boolean()) },
  handler: (ctx, { userId, force }) => purgeUser(ctx, userId, { force: force ?? false }),
});
