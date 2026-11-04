import { components } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";

type RevokeCtx = Pick<MutationCtx, "runQuery" | "runMutation">;

/**
 * Revokes every connection `userId` gave an assistant, with their tokens.
 *
 * `purgeUser` does this by hand because `CASCADE` cannot: the component keeps connections under a
 * plain string, not a `v.id()`. Both calls take the id directly, so this runs from a scheduled job
 * with no session. The list stops at 200, so it reads again until nothing comes back.
 *
 * `loadUser` already refuses an anonymized account, so this removes the row rather than stops the
 * access: nothing that names the cook's assistants stays behind.
 */
export const revokeConnectionsOf = async (ctx: RevokeCtx, userId: Id<"users">): Promise<void> => {
  let connections = await ctx.runQuery(components.mcp.grants.list, { userId });

  while (connections.length > 0) {
    for (const { _id } of connections) {
      await ctx.runMutation(components.mcp.grants.revoke, { userId, grantId: _id });
    }

    connections = await ctx.runQuery(components.mcp.grants.list, { userId });
  }
};
