---
id: 0019
applies_to: ["convex/router/**/*.ts", "convex/functions/**/*.ts", "convex/agent/**/*.ts", "convex/lib/**/*.ts", "convex/procedures.ts", "convex/schema/tracing.ts", "scripts/database/**/*.ts"]
status: accepted
supersedes: []
---

# A paid call is traced to the route it was made for

MUST: pass `trace: "<operation>"` to the builder of every `anon`, `authed`, `admin` or `server`
      mutation or action that reaches a paid service or a `@costly` action. The operation is one of
      `OPERATIONS` in [convex/schema/tracing.ts](../../convex/schema/tracing.ts), named by the
      route's router path (`recipes/importOne`).
MUST: hand the trace on at every hop to a `@costly` action, with `ctx.runTracedAction`,
      `ctx.runTracedMutation` or `ctx.scheduleTracedAfter`, never `ctx.runAction` or
      `ctx.scheduler.runAfter` / `runAt`.
MUST: record every paid call with the ctx of the action that made it:
      - an agent call goes through `wrapAgent`, which sets its `usageHandler` from `ctx.trace`;
      - a call to a ctx-free library (Jev, Replicate, RunPod, a transcription) takes an optional
        `report` and is handed `traceOpenRouter(ctx, span)` or `traceRun(ctx, span)` from
        [recordGeneration.ts](../../convex/functions/tracing/recordGeneration.ts);
      - a direct agent stream (`answerTurn`) passes `usageHandler: traceUsageHandler(ctx)` itself.
MUST: type the ctx of every tool that spends as `TracedToolCtx`, and of every helper that records or
      hands a trace on as `TracedActionCtx` / `TracedMutationCtx`, so an untraced ctx is a compile
      error.
MUST: price a provider that returns no cost (Replicate, RunPod) in
      [convex/lib/costRates.ts](../../convex/lib/costRates.ts), sent as `estimated`. A provider that
      returns its own cost (OpenRouter) is sent that cost, never an estimate.
MUST: pass `__trace: scriptTrace("<operation>")` from a script under `scripts/database/` that calls a
      paid internal action, with a `seed/…` or `restore/…` operation, one trace per call.
MUST NOT: throw from tracing. A missing trace is logged and nothing is sent; a failure to send is
          logged. The cook's operation never depends on it.
MUST NOT: accept a `__trace` from outside. Only `internalMutation` / `internalAction` take one; every
          builder a client or a server reaches starts its own trace, and its validator refuses the
          argument.
MUST NOT: record from a mutation, and MUST NOT give a query a trace.
MUST NOT: send a prompt or an answer. An event carries the step, model, provider, tokens, cost and
          latency, and nothing the cook wrote or read.
MAY: list a router file in C17's `PENDING` with the reason, as a known gap in the cost data.

## Why

Nothing measured what a route spent. One `ingredients/resolve` makes up to four model calls across
`internal.*` actions, and an import adds Replicate and RunPod, so whether a route costs a tenth of a
cent or five cents was unknown, and so was whether the limits in `RATE_LIMITS`
([0018](./0018-an-expensive-operation-is-rate-limited.md)) were set against a real bill. Each paid
call now sends one `$ai_generation` to PostHog carrying the route's `operation`, and the average
cost of a route is a PostHog query.

**The trace rides in ctx, in a hidden `__trace` argument.** A builder starts it from its `trace:`
option, with the caller's `users` id as `distinctId`, the id the app identifies with, so cost joins
behaviour. It is data only: `procedures.ts` may not import `_generated/api`
([0001](./0001-convex-procedures-only.md)), so sending lives in `functions/tracing/` and is handed
the ctx the builder shaped. Propagation is explicit because injecting into every `runAction` would
also reach component functions, whose validators refuse an unknown argument.

**Only internal functions join a trace** because a client choosing its own could file what it spends
on another cook's profile, or under another route's average.

**Tracing never throws** because a throw after the money is spent is the worst of both: the Jev
callers retry a failed judgment (paying twice) or swallow it (dropping what was judged). A gap in
the data is a log line; C17 is what keeps it from shipping.

**A mutation never records** because its clock is frozen at its start: every latency would read 0
and every timestamp would be the same instant. A mutation that schedules the paid work hands the
trace on instead (`sendMessage`).

**The libraries stay ctx-free** (`report` rather than a ctx) so a `*.manual.test.ts` bake-off can
call them directly with no trace and no scheduler, and so cannot send an event.

@limitation PostHog is the only record. `@posthog/convex` retries a failed POST three times, then
swallows the error, so a dropped event is a hole in the averages with nothing logged. **Accepted
because** the data feeds averages, and a capture path of our own, with its retries, costs more than
an occasional dropped event skews them. **Until fixed**, compare a day's total against the OpenRouter dashboard. **The fix** is a capture
action of our own that throws, run through action-retrier; every event already carries a `uuid`
minted at record time, so a retry cannot count a call twice.

@limitation The rates in `costRates.ts` are list prices read by hand, written for the one size and
thinking level each image model renders at. A provider changing its price, or a render changing
size, leaves the estimate wrong with nothing to say so. **Accepted because** each model renders at
one fixed size today, so pricing from the returned megapixels would add code and change no figure.
**Until fixed**, re-read them when
either changes. **The fix** is to price a Replicate render from the megapixels it returned.

## Verify

```bash
pnpm check:traces   # C17 — a route reaching a paid service or a @costly action starts a trace; no hop to a @costly action drops it
pnpm typecheck      # TracedToolCtx / RecordingCtx: a tool or helper reached with an untraced ctx does not compile
pnpm test           # the trace layer (tracing.test.ts), recordGeneration, wrapAgent, and each route's events
```

**What the checks can and cannot do.** C17 shares C16's reachability (`scripts/checks/_costs.mjs`),
so the two cannot disagree on what costs money, and it proves a paid route starts a trace and that no
hop to a `@costly` action drops it. It cannot prove that a paid call inside the route records: a
library called without its `report` sends nothing, and only that route's test sees the missing event
(`assistant/classify` shipped that way once, and its test now pins it). The types close most of that
gap for agent calls, which cannot be made without `wrapAgent`'s traced ctx, and none of it for a
`report` left out.

## See also

[0001](./0001-convex-procedures-only.md): why sending is not in the builder ·
[0018](./0018-an-expensive-operation-is-rate-limited.md): the `@costly` marker this reuses, and the
limits these costs are measured against
