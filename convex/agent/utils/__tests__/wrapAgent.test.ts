import type { Agent, ToolCtx, UsageHandler } from "@convex-dev/agent";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { TraceContext } from "@convex/schema/tracing";

import { wrapAgent } from "../wrapAgent";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

const TRACE: TraceContext = { traceId: "trace-1", operation: "recipes/importOne", distinctId: "user-1" };

/** What the SDK hands a usage handler after a call: here, translating one recipe. */
const USAGE = {
  agentName: "Cuisko Translator",
  model: "openai/gpt-6-luna",
  provider: "openrouter.chat",
  usage: { inputTokens: 900, outputTokens: 400 },
  providerMetadata: { openrouter: { usage: { cost: 0.0021 } } },
};

/** An agent that records what it was called with and bills the way the SDK does. */
const billingAgent = () => {
  const generateObject = vi.fn(async (...args: unknown[]) => {
    const options = args[3] as { usageHandler: UsageHandler };
    await options.usageHandler({} as never, USAGE as never);
    return { object: {} };
  });

  return { agent: { generateObject, generateText: generateObject } as unknown as Agent, generateObject };
};

const ctxWith = (trace: TraceContext | null) => ({ scheduler: {}, trace }) as unknown as ToolCtx;

beforeEach(() => capture.mockReset());

describe("wrapAgent", () => {
  test("records each call under the trace of the ctx it is given", async () => {
    const { agent } = billingAgent();

    await wrapAgent(agent).generateObject(ctxWith(TRACE), {}, { prompt: "Translate: oeufs brouillés" });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]![1].properties).toMatchObject({
      $ai_trace_id: "trace-1",
      $ai_span_name: "Cuisko Translator",
      $ai_total_cost_usd: 0.0021,
      operation: "recipes/importOne",
    });
  });

  test("keeps the caller's own options beside the handler", async () => {
    const { agent, generateObject } = billingAgent();

    await wrapAgent(agent).generateText(
      ctxWith(TRACE),
      {},
      { prompt: "Translate: oeufs brouillés" },
      { storageOptions: { saveMessages: "none" } },
    );

    expect(generateObject.mock.calls[0]![3]).toMatchObject({ storageOptions: { saveMessages: "none" } });
  });

  test("a ctx with no trace still answers: the call goes unrecorded, the cook is not failed", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { agent } = billingAgent();

    await expect(
      wrapAgent(agent).generateObject(ctxWith(null), {}, { prompt: "Translate: oeufs brouillés" }),
    ).resolves.toEqual({ object: {} });
    expect(capture).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  test("a caller cannot switch the recording off", () => {
    const { agent } = billingAgent();
    const call = () =>
      wrapAgent(agent).generateObject(
        ctxWith(TRACE),
        {},
        { prompt: "Translate: oeufs brouillés" },
        // @ts-expect-error the handler is wrapAgent's to set; a call recorded nowhere is a cost in no route.
        { usageHandler: undefined },
      );

    expect(call).toBeTypeOf("function");
  });
});
