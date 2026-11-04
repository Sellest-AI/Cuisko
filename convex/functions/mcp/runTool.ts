import type { ToolCtx } from "@convex-dev/mcp";
import { ConvexError } from "convex/values";
import * as z from "zod/v4";

import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ActionCtx } from "@convex/procedures";

import { enforceRateLimit } from "../rateLimits/enforceRateLimit";
import type { McpCook } from "./loadCook";

const RATE_LIMITED = "Too many calls to Cuisko. Stop and try again in a bit.";

const _isRateLimited = (data: unknown) =>
  typeof data === "object" && data !== null && "code" in data && data.code === "RATE_LIMITED";

/**
 * The one gate every MCP tool goes through: it resolves the cook behind the token, spends the rate
 * limit, and shapes what a model reads when it fails.
 *
 * The limit sits here, in a tool handler with a verified identity, because that is the entry point:
 * a tool handler is to `/mcp` what an `authed` export is to the app (ADR 0018). A refusal is as bare
 * as any other, with no limit and no wait.
 *
 * The component shows a model a `ConvexError`'s text and a generic failure for anything else. So a
 * refusal becomes a sentence, and so does a schema failure inside a tool's `.run`, since that is the
 * model's own input to fix. Anything else stays generic on purpose: nobody wrote it for a model.
 *
 * @limitation The component has no hook ahead of the tool, so a refused call still costs the token
 * check, this read and the limiter's mutation, and `tools/list` is not counted. The limit bounds the
 * work a loop can do; a model that ignores the refusal still makes requests.
 */
export const runTool = async <Result>(
  ctx: ToolCtx,
  user: { userId: Id<"users"> },
  run: (cook: McpCook) => Promise<Result>,
): Promise<Result> => {
  const cook = await ctx.runQuery(internal.router.users.getMcpUser._internal, { userId: user.userId });

  try {
    // The component types its ctx over no schema. An action has no `db`, so the schema changes nothing.
    const appCtx = ctx as unknown as ActionCtx;
    await enforceRateLimit({ ...appCtx, userId: cook.userId, user: { role: cook.role } }, "mcpCall");

    return await run(cook);
  } catch (error) {
    if (error instanceof z.ZodError) throw new ConvexError(`Invalid arguments: ${error.message}`);
    if (error instanceof ConvexError && _isRateLimited(error.data)) throw new ConvexError(RATE_LIMITED);
    throw error;
  }
};
