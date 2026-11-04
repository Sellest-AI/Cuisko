import { v } from "convex/values";

import { loadCook } from "@convex/functions/mcp/loadCook";
import { internalQuery } from "@convex/procedures";

/**
 * Who a verified MCP token acts for.
 *
 * Internal because a tool handler runs in an HTTP action with no `ctx.auth`: the component has
 * already verified the token, and `userId` is the value it verified. Nothing a model sends reaches
 * this argument.
 */
export const _internal = internalQuery({
  args: { userId: v.id("users") },
  handler: loadCook,
});
