import type { UsageHandler } from "@convex-dev/agent";

import { posthog } from "@convex/lib/posthog/client";
import type { ReportUsage } from "@convex/lib/typesafe/ask";
import type { TracedActionCtx } from "@convex/procedures";

/**
 * The ctx `recordGeneration` needs. `trace` is optional in the TYPE only so a helper typed with a
 * plain `ActionCtx` (the recipe pipeline's) can pass the ctx it holds: at run time every mutation
 * and action builder puts a `trace` on ctx, and an absent one is treated like a `null` one.
 */
export type RecordingCtx = Pick<TracedActionCtx, "scheduler"> & { trace?: TracedActionCtx["trace"] };

/** One paid call, as the step that made it describes it. */
export type Generation = {
  /** The step, as PostHog shows it in `$ai_span_name`: `jev.nearMiss`, an agent's name. */
  span: string;
  provider: "openrouter" | "replicate" | "runpod";
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** `null` when the provider did not say. Sent as missing and `estimated`, never as 0. */
  costUsd: number | null;
  /** The cost is ours (run seconds × a rate), not the provider's bill. */
  estimated: boolean;
  /** Absent when the caller cannot time the call: an agent's usage handler is told only the usage. */
  latencyMs?: number;
  isError?: boolean;
};

/**
 * Sends one `$ai_generation` to PostHog for a paid call, against the trace the action carries.
 *
 * **Never throws: tracing is an add-on, and the cook's operation must not depend on it.** A `null`
 * trace is logged and nothing is sent, because a call without one has no route to be averaged
 * under; C17 is what keeps that from happening, as a red commit rather than a runtime failure. A
 * throw here used to fail a judgment that was already billed, which its caller then retried (and
 * paid for again) or swallowed (and dropped what it judged).
 *
 * `uuid` and `timestamp` are set here rather than when the component sends: PostHog deduplicates on
 * `uuid`, so a retried send cannot count a call twice, and the timestamp is when the money was
 * spent. Both are safe here because only actions record, and an action's clock runs.
 *
 * Scheduling the send can fail too; that is logged the same way.
 */
export const recordGeneration = async (ctx: RecordingCtx, call: Generation): Promise<void> => {
  const { trace } = ctx;
  if (!trace) {
    console.error(
      `[tracing] ${call.span} ran without a trace, so its cost is recorded nowhere: give the route a ` +
        "`trace:` option, or reach this action with ctx.runTracedAction / ctx.scheduleTracedAfter.",
    );
    return;
  }

  try {
    await posthog.capture(ctx, {
      // PostHog needs a distinct id. A trace with no caller gets its own, and no person profile.
      distinctId: trace.distinctId ?? trace.traceId,
      event: "$ai_generation",
      uuid: crypto.randomUUID(),
      timestamp: new Date(),
      properties: {
        $ai_trace_id: trace.traceId,
        $ai_span_name: call.span,
        $ai_provider: call.provider,
        $ai_model: call.model,
        $ai_input_tokens: call.inputTokens,
        $ai_output_tokens: call.outputTokens,
        $ai_total_cost_usd: call.costUsd ?? undefined,
        // PostHog reads `$ai_latency` in seconds.
        $ai_latency: call.latencyMs === undefined ? undefined : call.latencyMs / 1000,
        $ai_is_error: call.isError ?? false,
        operation: trace.operation,
        estimated: call.estimated || call.costUsd === null,
        ...(trace.distinctId ? {} : { $process_person_profile: false }),
      },
    });
  } catch (error) {
    console.error(`[tracing] could not schedule $ai_generation for ${trace.operation} / ${call.span}`, error);
  }
};

/**
 * A `report` for one Jev judgment, named for the step that asks it. The judge stays ctx-free and
 * hands its usage here; this is where the action's trace is attached.
 */
export const traceTypeSafe =
  (ctx: RecordingCtx, span: string): ReportUsage =>
  (usage) =>
    recordGeneration(ctx, {
      span,
      provider: "openrouter",
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
      estimated: usage.costUsd === null,
      latencyMs: usage.latencyMs,
    });

/** What OpenRouter puts in `providerMetadata` when the model asked for usage accounting. */
type OpenRouterMetadata = { usage?: { cost?: number } };

/**
 * A usage handler for one `agent.generateText` / `generateObject` call. `wrapAgent` sets it as
 * every call's `usageHandler` option, built from the ctx the call is made with. Per call rather
 * than on the `Agent`, because the agent's own handler is handed the agent's ctx, which carries no
 * trace.
 */
export const traceUsageHandler =
  (ctx: RecordingCtx): UsageHandler =>
  async (_agentCtx, { agentName, usage, providerMetadata, model }) => {
    const cost = (providerMetadata?.openrouter as OpenRouterMetadata | undefined)?.usage?.cost;

    await recordGeneration(ctx, {
      span: agentName ?? model,
      provider: "openrouter",
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: cost ?? null,
      estimated: cost === undefined,
    });
  };
