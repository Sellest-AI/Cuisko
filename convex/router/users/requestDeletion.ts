import { requestDeletion } from "@convex/functions/users/requestDeletion";
import { authMutation } from "@convex/procedures";

/**
 * The caller asks for their own account to be deleted; the answer is the moment it will be.
 *
 * Takes no arguments: the account is the caller's, from `ctx`. Costs nothing, so it carries no rate
 * limit (C16 only looks for operations that reach a model or the storage).
 */
export const authed = authMutation({
  args: {},
  handler: (ctx) => requestDeletion(ctx, ctx.user),
});
