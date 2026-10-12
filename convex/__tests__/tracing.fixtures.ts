import { type FunctionReference, makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { authActionI18n, authMutation, internalAction } from "../procedures";
import type { TraceContext } from "../schema/tracing";

/**
 * Functions built with the traced builders, for `tracing.test.ts` to call through convex-test.
 *
 * The two dots in the filename are what keep them off every deployment: the Convex bundler skips
 * any file whose name has more than one, and so does `_generated/api`, which is why the test
 * reaches them by string reference rather than through `internal`.
 */
export type Seen = { trace: TraceContext | null; argKeys: string[] };

/** Typed `internal`, which `_internal` is: `makeFunctionReference` only ever types a reference public. */
export const calleeRef = makeFunctionReference("__tests__/tracing.fixtures:_internal") as unknown as FunctionReference<
  "action",
  "internal",
  { label: string; __trace?: TraceContext },
  Seen
>;

/** No `trace` option: it only ever has the trace a caller hands it. */
export const _internal = internalAction({
  args: { label: v.string() },
  handler: async (ctx, args): Promise<Seen> => ({ trace: ctx.trace, argKeys: Object.keys(args) }),
});

export const authed = authActionI18n({
  trace: "ingredients/resolve",
  args: { label: v.string() },
  handler: async (ctx, args) => ({
    own: { trace: ctx.trace, argKeys: Object.keys(args) } satisfies Seen,
    traced: await ctx.runTracedAction(calleeRef, { label: "traced" }),
    plain: await ctx.runAction(calleeRef, { label: "plain" }),
    scheduledId: await ctx.scheduleTracedAfter(0, calleeRef, { label: "scheduled" }),
  }),
});

/** The `sendMessage` shape: a mutation starts the trace and schedules the paid action. */
export const authedMutation = authMutation({
  trace: "assistant/sendMessage",
  args: { label: v.string() },
  handler: async (ctx, args) => ({
    own: { trace: ctx.trace, argKeys: Object.keys(args) } satisfies Seen,
    scheduledId: await ctx.scheduleTracedAfter(0, calleeRef, { label: "scheduled" }),
  }),
});
