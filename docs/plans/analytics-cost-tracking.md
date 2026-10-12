---
slice: analytics-cost-tracking
branch: feat/analytics-cost-tracking
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# Tracing and cost per route

After this lands, PostHog shows what one call to each paid route costs on average (and at p95), per
model and per cook, next to how people move through the app.

---

## 1. Problem

**What is broken or missing.** Nothing measures what the backend spends. A route like
`ingredients/resolve` can make up to four model calls across `internal.*` actions, and an import adds
Replicate and RunPod on top. Whether one costs a tenth of a cent or five cents is unknown, and so is
whether the rate limits in `lib/rateLimits.ts` are set against a real bill. The app itself has no
product analytics.

**How we would know it worked.** In PostHog LLM analytics, filtering `$ai_generation` by the
`operation` property gives one row per route (`ingredients/resolve`, `recipes/importOne`…), and the
average `$ai_total_cost_usd` summed per `$ai_trace_id` matches the OpenRouter dashboard to within a
few percent over one day of dev use. The app sends `$screen` events with the expo-router path,
identified with the same distinct id as the backend.

**Product fit.** Operator tooling, so it touches PRODUCT.md only through privacy: no prompt or
answer text leaves Convex (tokens, cost, model and step names only). The store privacy labels
change: Product Interaction plus Other Usage Data, for Analytics, linked to the user. No ATT, no ad
SDK.

---

## 2. Architecture

**Tables** — none. PostHog holds the events; Convex holds nothing new.

**Operations** — no new router surface. Transport is the official `@posthog/convex` component:
`posthog.capture(ctx, …)` schedules the component's own action, which POSTs to PostHog.

**The trace context.** What travels is a trace, not a meter: cost is the first thing recorded
against it, and spans can be later without changing what travels.

```ts
type TraceContext = { traceId: string; operation: Operation; distinctId: string | null };
```

It rides in a **hidden argument**, `__trace`, the technique `convex-tracer` uses (we take the
technique, not the component: its builders would replace ours, it stores spans in its own tables,
and it cannot export to PostHog).

- Every **mutation and action** builder in `procedures.ts` (auth, admin, owned, server, internal,
  I18n variants) gains one customization layer that puts a trace on `ctx.trace`. **Only the
  internal builders accept `__trace`** (`v.optional(vTraceContext)`, stripped before the handler
  runs). Every builder reached from outside only starts one, and its validator refuses the arg:
  otherwise a client could file what it spends on another cook's profile or another route
  (decided 2026-10-12, from review). Traced hops only ever target internal functions.
- **Queries do not get it.** A query never spends, and an argument that differs on every call would
  defeat the query cache.
- A function called **without** `__trace` starts a new trace. Its `operation` comes from the
  builder option `trace: "ingredients/resolve"`. Without that option the trace is `null`, and
  `recordGeneration` sends nothing on a `null` trace and only logs it, because tracing never fails
  the cook's operation (C17 makes the gap a red commit, since nothing at run time will).
- Propagation is explicit, never automatic: `ctx.runTracedAction`, `ctx.runTracedMutation` and
  `ctx.scheduleTracedAfter` add `__trace` to the args. Plain `ctx.runAction` is left alone, because
  injecting into every call would also inject into component functions (`components.rateLimiter`)
  whose validators refuse the unknown arg.
- **The import cycle (ADR 0001, ADR 0018).** `procedures.ts` may not import `_generated/api`, and
  sending needs `components.posthog`. So the builder layer touches only the trace (data in, data
  out, and the three run helpers built on `ctx`). Sending lives in `functions/tracing/`, which may
  import `_generated/api`, and is called with the `ctx` the builder already shaped.

**Flow** — `ingredients/resolve`, a miss:

```
client ──► router/ingredients/resolve.authed   (authActionI18n, trace: "ingredients/resolve")
             builder: no __trace in args → ctx.trace = { traceId: new, operation, distinctId: userId }
             ├─ ask.ts (Jev)                  → recordGeneration(ctx, { span: "jev.nearMiss", … })
             ├─ ctx.runTracedMutation(internal…_internal_create, args)    ← __trace injected
             └─ ctx.runTracedAction(internal…writer, args)                ← __trace injected
                  builder: __trace present → ctx.trace = the same trace
                  └─ wrapAgent(agent).generateText(ctx, …)   ← sets usageHandler: traceUsageHandler(ctx)
                                                │
   every recordGeneration ─► posthog.capture(ctx, $ai_generation) ─► scheduler ─► component ─► PostHog
```

- **Sent per call, never buffered.** A buffer flushed in `finally` loses every call of a run whose
  action times out or is killed, and that is the expensive run. One scheduler write per paid call
  is the price, and the cook never waits on it.
- One `$ai_generation` per paid call: `$ai_trace_id` = traceId, `$ai_span_name` = the step,
  `$ai_model`, `$ai_provider`, `$ai_input_tokens`, `$ai_output_tokens`, `$ai_total_cost_usd`,
  `$ai_latency`, `$ai_is_error`, plus `operation` and `estimated`. `uuid` and `timestamp` are set
  when the call is recorded, not when it is sent: PostHog deduplicates on `uuid`, and the
  timestamp is when the money was spent, not when the scheduler got to it.
- Grouping by route reads `operation` on each event, so it never depends on a closing event.
- A mutation that schedules the paid action (`sendMessage`) uses `ctx.scheduleTracedAfter`, so the trace
  survives the hop. A mutation never records; only actions spend. It also could not: inside a
  mutation `Date.now()` is frozen at the mutation's start, so `latencyMs` would read 0 and every
  `timestamp` would be the same instant. An action's clock runs, so latency and timestamp are
  measured there.
- **Only a call made with the action's `ctx` records.** A Jev judge (`judgeMatch`, `askTypeSafe`)
  hands its usage to a `report` callback and never records itself. That keeps it ctx-free, which
  is what lets the `*.manual.test.ts` bake-offs call it directly: they have no trace and no
  scheduler, so they cannot send an event. An agent tool already takes the ctx, so `wrapAgent`
  records its calls itself, from `ctx.trace`, and takes `usageHandler` out of its signature so no
  caller can switch that off (agreed 2026-10-12). The bake-offs call the AI SDK directly, never
  `wrapAgent`.
- OpenRouter calls ask for `usage: { include: true }`, so cost is OpenRouter's number, not ours.
  Replicate and RunPod are run seconds × a rate in `lib/costRates.ts`, sent with `estimated: true`.
- Env: `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST`, declared in `defineApp({ env })` and bound to the
  component with `app.use(posthog, { env })`, and validated in `convex/env.ts` (the component
  itself returns silently when the token is missing).

**Cascade** — none.

---

## 3. Program design

**Files created or changed:**

```
convex/env.ts                                + POSTHOG_PROJECT_TOKEN, POSTHOG_HOST (Zod, no default)
convex/convex.config.ts                      defineApp({ env }) + app.use(posthog, { env })
convex/lib/posthog/client.ts                 the one PostHog instance over components.posthog
convex/lib/costRates.ts                      COST_RATES: per-second USD per Replicate / RunPod model
convex/schema/tracing.ts                     vTraceContext, OPERATIONS, Operation
convex/procedures.ts                         tracing layer on every mutation + action builder
convex/functions/tracing/recordGeneration.ts recordGeneration, traceUsageHandler
convex/agent/agents.ts                       drop the `// usageHandler` stubs (per call instead)
convex/agent/utils/wrapAgent.ts              sets every call's usageHandler from ctx.trace; callers cannot pass one
convex/agent/config/models.ts                usage: { include: true } on every model, through one `openrouter.chat` helper
convex/lib/typesafe/ask.ts                   hands usage to an optional `report` callback (the judges pass it through `Input`)
convex/lib/openrouter/transcribe.ts          returns usage alongside the text
convex/lib/replicate/node.ts                 returns predict_time
convex/lib/runpod/removeBackground.ts        returns executionTime
every rate-limited / @costly router file     trace: "<route>" option; runAction → runTracedAction on paid paths
scripts/checks/c17-traces.mjs                see Tests
src/providers/posthog.tsx                    (exists) PostHogProvider, EU host
src/lib/posthog/useScreenTracking.ts         usePathname() → posthog.screen(path)
src/modules/auth/_hooks/useAuth.ts           identify(userId) on sign-in, reset() on sign-out
docs/adr/0019-a-paid-call-is-traced.md       the rule C17 enforces
```

**Signatures** — the seam:

```ts
// schema/tracing.ts: every traced route, so a typo is a type error and PostHog never sees two spellings
export const OPERATIONS = ["assistant/sendMessage", "assistant/classify", "ingredients/resolve", /* … */] as const;
export type Operation = (typeof OPERATIONS)[number];

// procedures.ts: a builder option, and what the handler receives
authActionI18n({ trace?: Operation, args, handler })
ctx.trace: TraceContext | null
ctx.runTracedAction(ref, args)          // ctx.runAction(ref, { ...args, __trace: ctx.trace })
ctx.runTracedMutation(ref, args)
ctx.scheduleTracedAfter(delayMs, ref, args)  // ctx.scheduler.runAfter, same injection

// functions/tracing/recordGeneration.ts
recordGeneration(ctx: TracedActionCtx, call: {
  span: string; provider: "openrouter" | "replicate" | "runpod"; model: string;
  inputTokens?: number; outputTokens?: number;
  costUsd: number | null;               // null = the provider did not say; sent as estimated, never as 0
  estimated: boolean; latencyMs?: number; isError?: boolean;   // an agent's usage handler cannot time the call
}): Promise<void>                       // schedules one capture; a scheduler failure is logged, never thrown
traceUsageHandler(ctx: TracedActionCtx): UsageHandler   // wrapAgent sets it on every generateText / generateObject
```

**Tests**

```
procedures tracing           called without __trace + trace option → new trace with that operation and the caller's id
                             called with __trace → ctx.trace is that one, traceId unchanged
                             __trace never reaches the handler's args
                             runTracedAction / scheduleTracedAfter pass the same traceId to the callee
                             a query builder's validator has no __trace
                             two calls to a mutation that starts a trace get two different traceIds
recordGeneration.test.ts     schedules one $ai_generation carrying operation + traceId
                             traceUsageHandler maps providerMetadata.openrouter.usage.cost to $ai_total_cost_usd
                             a missing cost is sent as estimated, never as 0
                             a null trace is logged, sends nothing, and never throws
resolve.test.ts (existing)   a miss schedules captures with operation "ingredients/resolve", one traceId
c17 __tests__                a router file reaching a PAID lib without a `trace:` option fails
                             a file calling a @costly internal with plain runAction fails
```

**Decisions I am least confident about**

1. **The cycle workaround.** Answered by the slice 2 prototype: the runners wrap
   `ctx.runAction` / `ctx.runMutation` / `ctx.scheduler` and need no reference from
   `_generated/api`. Three things it taught:
   - `withTrace` must be the outermost wrapper (`withTrace(withI18n(…))`), because `withI18n`
     calls its inner Mod with an empty `extra` and would swallow the `trace` option.
   - A customization that adds an arg makes convex-helpers throw at module load for a function
     with no `args:`. Every `internalAction` and `authActionI18n` declares one today; slice 3
     must re-check every builder it wraps.
   - The runners only accept a reference whose args declare `__trace`, so handing one a
     component's function is a compile error, pinned by a `@ts-expect-error` test.
2. **Propagation is opt-in.** A paid internal action reached with plain `ctx.runAction` starts a
   trace with no operation, and its cost is lost to the route. C17 is what catches that, so C17
   lands with the first traced route rather than at the end.
3. **Sending from Convex rather than keeping a ledger.** PostHog becomes the only record, so a
   dropped POST is a hole in the averages. posthog-node retries 3 times (3 s apart), then
   **swallows** the error: the component's `capture` action always succeeds, so nothing logs the
   loss and `@convex-dev/action-retrier` would never see a failure to retry. Acceptable for
   averages. If the OpenRouter comparison shows a gap, the fix is local to `recordGeneration`: our
   own capture action that throws, run through action-retrier. Every event already carries a
   `uuid` minted at record time, so that retry cannot count a call twice. A Convex table can also
   be added later without changing the trace.
4. **`distinctId` is the Convex `users` id**, used both by the backend and by the app's `identify`.
   That makes PostHog data "linked to the user" on the store labels. Hashing it would unlink it, and
   would stop backend cost from joining app behaviour.

**Deferred, on purpose.** `withSpan(ctx, name, fn)` for steps that cost nothing. The trace
context is shaped for it, but nothing is built for it until a step needs to be seen.

---

## 4. Slices

- [x] 1. env + `@posthog/convex` installed and bound + `lib/posthog/client.ts` → one event visible in PostHog
- [x] 2. prototype: the tracing layer on `authActionI18n` and `internalAction` only, with its tests → the cycle question answered
- [x] 3. the layer on every mutation and action builder; `recordGeneration` + tests; `usage: { include: true }`
- [x] 4. `ingredients/resolve` traced end to end, with C17 → first real trace in PostHog
      (2026-10-12, `liquide vaisselle`, refused: Jev near-miss $0.000026, Jev measured-food
      $0.000028, row writer $0.00076, one trace. OpenRouter returns `cost` on `/systemone` too, so
      Jev is billed, not estimated. C17's PENDING lists the 15 files slice 5 empties.)
- [ ] 5. the rest of the rate-limited and `@costly` routes, Replicate / RunPod at estimated rates.
      **Also `seed:catalog`, which reaches paid code through no route**: `import-catalog.ts` calls
      `suggestDishes._internal` and `importOne._internal` directly. It passes its own
      `__trace: { traceId, operation: "seed/catalog", distinctId: null }`, one `traceId` per dish,
      rather than those actions taking a `trace:` option, which would file a cook's import under
      the seed whenever a route forgot `runTracedAction` instead of logging the gap. (The `refreshRecipe`
      migration is not a gap: it is a mutation and spends nothing.) From slice 4 on,
      `resolveWithAgent` records, and `recordGeneration` only logs on a null trace: **tracing never
      throws** (decided 2026-10-12, reversing the throw agreed earlier that day, because a throw
      after a billed Jev call was retried, paying twice, or swallowed, dropping the judged figures).
      Until this slice lands, the recipe imports and the seed work but are recorded nowhere. Every agent tool
      (`sanitizeRecipe`, `translateRecipe`, …) already records through `wrapAgent`, so this slice
      edits routes and hops, never a tool.
- [ ] 6. ADR 0019, plus its row in `docs/adr/README.md` and "(ADR 0019)" on C17's row of the
      enforcement table in `docs/ARCHITECTURE.md`
- [ ] 7. app: screen tracking, identify / reset
- [ ] 8. privacy labels and the privacy policy page (user, outside the repo)

---

## Landing

- [ ] `pnpm verify` green
- [ ] Reviewer subagent clean, or its findings approved
- [ ] Decisions worth keeping promoted to an ADR or to [CONVENTIONS.md](../CONVENTIONS.md)
- [ ] **This file deleted** — the slice is not done while it exists
