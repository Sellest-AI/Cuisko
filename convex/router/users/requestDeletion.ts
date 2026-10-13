import { accountEventOf } from "@convex/functions/users/accountEvent";
import { requestDeletion } from "@convex/functions/users/requestDeletion";
import { captureEvent } from "@convex/lib/posthog/captureEvent";
import { authMutation } from "@convex/procedures";

/**
 * The caller asks for their own account to be deleted; the answer is the moment it will be.
 *
 * Takes no arguments: the account is the caller's, from `ctx`. Costs nothing, so it carries no rate
 * limit (C16 only looks for operations that reach a model or the storage).
 *
 * Reports `account deletion requested` (ADR 0019) for a new request only, so a retry never counts
 * as a second cook leaving.
 */
export const authed = authMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const { deletionDueAt, isNew } = await requestDeletion(ctx, ctx.user);

    const event = isNew ? accountEventOf(ctx.user, "account deletion requested", { deletionDueAt }) : null;
    if (event) await captureEvent(ctx, event);

    return deletionDueAt;
  },
});
