import { beforeEach, describe, expect, test, vi } from "vitest";

import type { TraceContext } from "../../../schema/tracing";
import { recordGeneration, traceUsageHandler } from "../recordGeneration";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

const trace: TraceContext = { traceId: "trace-1", operation: "ingredients/resolve", distinctId: "user-1" };
const ctxWith = (t: TraceContext | null) => ({ trace: t, scheduler: {} as never });

/** The resolver's Jev near-miss call: a real OpenRouter bill of a tenth of a cent. */
const nearMiss = {
  span: "jev.nearMiss",
  provider: "openrouter" as const,
  model: "jev",
  inputTokens: 420,
  outputTokens: 12,
  costUsd: 0.0011,
  estimated: false,
  latencyMs: 840,
};

/** The `properties` of the one event `capture` was handed. */
const sentProperties = () => capture.mock.calls[0]![1].properties as Record<string, unknown>;

beforeEach(() => capture.mockReset());

describe("recordGeneration", () => {
  test("schedules one $ai_generation carrying the route and the trace", async () => {
    await recordGeneration(ctxWith(trace), nearMiss);

    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0]![1]).toMatchObject({ event: "$ai_generation", distinctId: "user-1" });
    expect(sentProperties()).toMatchObject({
      $ai_trace_id: "trace-1",
      $ai_span_name: "jev.nearMiss",
      $ai_total_cost_usd: 0.0011,
      $ai_latency: 0.84,
      operation: "ingredients/resolve",
      estimated: false,
    });
  });

  test("gives every event its own uuid and the time it was recorded", async () => {
    await recordGeneration(ctxWith(trace), nearMiss);
    await recordGeneration(ctxWith(trace), nearMiss);

    const [first, second] = capture.mock.calls.map(([, event]) => event);
    expect(first.uuid).not.toBe(second.uuid);
    expect(first.timestamp).toBeInstanceOf(Date);
  });

  test("a missing cost is sent as estimated, never as 0", async () => {
    await recordGeneration(ctxWith(trace), { ...nearMiss, costUsd: null });

    expect(sentProperties().$ai_total_cost_usd).toBeUndefined();
    expect(sentProperties().estimated).toBe(true);
  });

  test("a trace with no caller sends no person profile", async () => {
    await recordGeneration(ctxWith({ ...trace, distinctId: null }), nearMiss);

    expect(capture.mock.calls[0]![1].distinctId).toBe("trace-1");
    expect(sentProperties().$process_person_profile).toBe(false);
  });

  // Tracing is an add-on: a missing trace is a gap in the cost data, never a failed operation for
  // the cook. A throw here used to fail a Jev judgment after it was billed, which its caller then
  // retried (billed again) or swallowed (and dropped the figures it judged).
  test("a null trace is logged and nothing is sent, but it never throws", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(recordGeneration(ctxWith(null), nearMiss)).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(expect.stringMatching(/jev\.nearMiss.*without a trace/));
    logged.mockRestore();
  });

  test("a failure to schedule the send is logged, not thrown", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    capture.mockRejectedValueOnce(new Error("scheduler down"));

    await expect(recordGeneration(ctxWith(trace), nearMiss)).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});

describe("traceUsageHandler", () => {
  const agentCall = {
    userId: undefined,
    threadId: undefined,
    agentName: "sanitizeIngredient",
    model: "openai/gpt-6-luna",
    provider: "openrouter.chat",
    usage: { inputTokens: 1800, outputTokens: 350, totalTokens: 2150 },
  };

  test("sends OpenRouter's own cost, read from providerMetadata", async () => {
    await traceUsageHandler(ctxWith(trace))({} as never, {
      ...agentCall,
      providerMetadata: { openrouter: { usage: { cost: 0.0042 } } },
    } as never);

    expect(sentProperties()).toMatchObject({
      $ai_span_name: "sanitizeIngredient",
      $ai_model: "openai/gpt-6-luna",
      $ai_input_tokens: 1800,
      $ai_output_tokens: 350,
      $ai_total_cost_usd: 0.0042,
      estimated: false,
    });
  });

  test("without usage accounting in the reply, the cost is left to PostHog and marked estimated", async () => {
    await traceUsageHandler(ctxWith(trace))({} as never, { ...agentCall, providerMetadata: undefined } as never);

    expect(sentProperties().$ai_total_cost_usd).toBeUndefined();
    expect(sentProperties().estimated).toBe(true);
  });
});
