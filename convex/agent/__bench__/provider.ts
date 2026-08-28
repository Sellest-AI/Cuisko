/**
 * The one place a bake-off talks to OpenRouter.
 *
 * Deliberately NOT `wrapAgent`: a Convex `ToolCtx` and a thread to delete afterwards are not part
 * of the question a bake-off asks, and routing a benchmark through the agent layer would measure
 * the agent layer too.
 */
import { generateText, Output } from "ai";
import type { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Straight from the file, not through `../utils` — the barrel pulls in `wrapAgent` and with it the
// whole Convex agent layer, which is exactly what this folder does not want to load.
import { providerSchema } from "../utils/providerSchema";
import type { Answer, Attempt, Effort, ProviderRouting } from "./types";

/**
 * How long one generation may take before it is abandoned.
 *
 * A bake-off is a field, not a model: one entrant that never answers used to hold the pool slot
 * open forever and take the other thirty-five calls — and the judge, and the transcript — down
 * with it. A timeout turns that entrant into one FAIL row, which is the honest result anyway: a
 * model that cannot answer in five minutes is not a model this tool can ship.
 *
 * Five minutes rather than something tighter because a high-effort reasoning entrant on a slow
 * provider legitimately takes minutes, and a timeout that fires on a working model is a worse
 * failure than the one it prevents.
 */
export const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * The same, for the judge, and deliberately twice as long.
 *
 * The judge is not an entrant and its budget should not be read off one: it gets a single prompt
 * containing every answer from every run — thirty-six of them on a field this size — and it always
 * runs at `high` effort, because it is the one call whose own quality is not what is being
 * measured. Holding it to an entrant's five minutes is the timeout firing on a working model,
 * which is the failure the number exists to avoid.
 *
 * It is also the most expensive call to lose. Everything else has already been paid for by the
 * time it starts, and it throwing takes the whole run with it.
 */
export const DEFAULT_JUDGE_TIMEOUT_MS = 600_000;

export type Chat = ReturnType<ReturnType<typeof createOpenRouter>["chat"]>;

/**
 * Throughput-sorted with fallbacks, minus the three providers that have misreported usage or
 * mangled structured output on this workload. A caller can replace any of it through
 * `BakeOff.provider`.
 */
const DEFAULT_ROUTING: ProviderRouting = {
  sort: "throughput",
  ignore: ["open-inference", "morph", "digitalocean"],
  allow_fallbacks: true,
};

/**
 * The provider options for one call: the caller's routing, plus the two settings the harness keeps
 * for itself.
 *
 * Candidates are not pinned to reasoning-off — each entrant brings its own effort, which is what
 * makes "is it worth spending more tokens" a question a bake-off can answer. The judge is separate
 * and always runs at `high`: it is read once, and it is the one call whose own quality is not what
 * is being measured.
 */
/**
 * A number is a token budget and a string is a level — OpenRouter takes them under different keys,
 * and sending both is how you get a provider to ignore whichever it likes least.
 */
const _reasoning = (effort: Effort) => {
  if (effort === false) return { enabled: false };
  // Some models do not support reasoning overrides. `auto` is a hint to the provider to use its own default, which is usually high.
  if (effort === "auto") return { enabled: true, effort: "high" };

  return typeof effort === "number"
    ? { enabled: true, max_tokens: effort }
    : { enabled: true, effort };
};

export const routing = (effort: Effort, override?: ProviderRouting) => ({
  openrouter: {
    reasoning: _reasoning(effort),
    provider: { ...DEFAULT_ROUTING, ...override },
    // Usage accounting, which is what makes the cost column real money rather than an estimate.
    // OpenRouter reports what the call ACTUALLY cost — at the provider it actually routed to,
    // after any cache discount — so nothing here has to multiply tokens by a price list that
    // `sort: "throughput"` has already made a guess at. It is a documented no-cost flag, and it is
    // not overridable: a bake-off whose cost column is an estimate is not worth running.
    usage: { include: true },
  },
});

/**
 * What the call actually cost, in USD, as OpenRouter reported it — or `undefined` when it did not.
 *
 * `undefined` rather than 0, and the table prints it as "n/a" rather than "$0.0000", because those
 * are opposite facts and a benchmark that shows a free row for a model that quietly stopped
 * reporting is worse than one that shows nothing. Usage accounting is requested in `routing`;
 * a provider can still omit it.
 *
 * The cast is narrow on purpose: `providerMetadata` is typed as an open bag of JSON values, so
 * reading a known path out of it is a cast rather than an `any`, and the `typeof` guard below is
 * what actually makes it true.
 */
export const reportedCost = (metadata: unknown): number | undefined => {
  const cost = (metadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined)?.openrouter
    ?.usage?.cost;

  return typeof cost === "number" ? cost : undefined;
};

/** The parts of a `generateText` result a bake-off measures, whatever the output mode was. */
type Measured = {
  usage?: { totalTokens?: number; outputTokenDetails?: { reasoningTokens?: number } };
  // `finalStep.providerMetadata`, not `result.providerMetadata` — the latter is the same value
  // through a deprecated alias.
  finalStep: { providerMetadata?: unknown };
};

const _measure = (
  result: Measured,
  output: unknown,
  flags: readonly string[] | undefined,
  started: number,
): Attempt => ({
  ok: true,
  ms: Date.now() - started,
  tokens: result.usage?.totalTokens ?? 0,
  reasoning: result.usage?.outputTokenDetails?.reasoningTokens ?? 0,
  cost: reportedCost(result.finalStep.providerMetadata),
  flags: [...(flags ?? [])],
  output,
});

/**
 * One generation, measured, never thrown.
 *
 * A model that fails is a result — the tool cannot ship a model that throws — so the error becomes
 * a row in the table rather than an exception that takes the whole bake-off down with it. That
 * covers the caller's `parse` and `check` too: both run inside the same `try`, so a parser the
 * answer does not satisfy fails that run and nothing else.
 */
export const attempt = async <Raw, Parsed>(
  model: Chat,
  effort: Effort,
  task: {
    system: string;
    prompt: string;
    answer?: Answer<Raw, Parsed>;
    provider?: ProviderRouting;
    timeoutMs?: number;
  },
): Promise<Attempt> => {
  const started = Date.now();
  const timeoutMs = task.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // One signal for the whole attempt, retries included — the budget is on the answer, not on each
  // HTTP request, so two retries cannot quietly triple it. An aborted call is not retried: the
  // signal is already spent by the time the SDK considers a second try.
  const signal = AbortSignal.timeout(timeoutMs);
  const call = {
    model,
    system: task.system,
    prompt: task.prompt,
    providerOptions: routing(effort, task.provider),
    maxRetries: 2,
    abortSignal: signal,
  };

  try {
    const answer = task.answer;

    if (!answer) {
      const result = await generateText(call);

      return _measure(result, result.text, undefined, started);
    }

    // `providerSchema`, not the caller's schema: an `.optional()` field is a key missing from
    // `required`, and a provider running strict structured output rejects the request rather than
    // the field — which reads as "this model cannot do the task" in the table when it is the
    // schema, not the model. The caller's own `parse` still sees the shape it wrote.
    const result = await generateText({
      ...call,
      output: Output.object({ schema: providerSchema(answer.schema) }),
    });

    // With no `parse`, the parsed answer IS the raw one — `Answer<Raw, Parsed = Raw>` says so at
    // every call site. The compiler cannot see that from in here, where `Parsed` is still open, so
    // the identity is asserted once rather than pushed onto every caller as a type parameter.
    const parsed = answer.parse
      ? answer.parse(result.output)
      : (result.output as unknown as Parsed);

    return _measure(result, parsed, answer.check?.(parsed), started);
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      // The abort is checked on the signal rather than on the error, because what the SDK throws
      // for a cancelled call varies by provider and version — and "timed out" read in a table is
      // a different fact from whatever wrapper reached us.
      error: signal.aborted
        ? `timed out after ${Math.round(timeoutMs / 1000)}s`
        : error instanceof Error
          ? error.message
          : String(error),
    };
  }
};
