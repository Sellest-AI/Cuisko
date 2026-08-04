import { v } from "convex/values";

import { loadUser } from "@convex/functions/users/loadUser";
import { internalQuery } from "@convex/procedures";

const args = { userId: v.id("users") };

/**
 * Resolves the merged identity for a user id.
 *
 * Action contexts have no `ctx.db`, so `procedures.ts` hops through this query to authenticate
 * an action. It references this function by STRING path (`makeFunctionReference`) to stay out
 * of the `_generated/api` type cycle — which means moving or renaming this file breaks that
 * reference with no compiler error. `__tests__/getAccount.test.ts` guards the path.
 */
export const _internal = internalQuery({
  args,
  handler: (ctx, { userId }) => loadUser(ctx, userId),
});
