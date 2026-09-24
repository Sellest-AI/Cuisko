import { v } from "convex/values";

import { joinHousehold } from "@convex/functions/households/joinHousehold";
import { authMutation } from "@convex/procedures";

/**
 * Joins the household a code belongs to. `authMutation`, not `householdMutation`: the caller is
 * not a member yet, and the code is the credential. An unknown code throws `NOT_FOUND`.
 */
export const authed = authMutation({
  args: { code: v.string() },
  handler: (ctx, { code }) => joinHousehold(ctx, ctx.user, code),
});
