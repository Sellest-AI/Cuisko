---
id: 0018
applies_to: ["convex/router/**/*.ts", "convex/functions/**/*.ts", "convex/lib/rateLimits.ts"]
status: accepted
supersedes: []
---

# An operation that costs money is rate limited per caller

MUST: call `enforceRateLimit(ctx, kind)` (or `withRateLimit(ctx, kind, () => …)`) from
      [convex/functions/rateLimits/enforceRateLimit.ts](../../convex/functions/rateLimits/enforceRateLimit.ts)
      in every `authed` or `admin` operation that reaches a model or the storage, after the caller is known and
      before the paid work runs.
MUST: apply it below the router when the paid work is decided there. `updateOne` does it first in
      `regenerateRecipe`, on every save: even an edit that never reaches the agent re-resolves every
      ingredient line, and a line that never linked is walked again against two live APIs and a model.
MUST: keep every limit as an entry of `RATE_LIMITS` in
      [convex/lib/rateLimits.ts](../../convex/lib/rateLimits.ts), and no limit number anywhere else.
MUST: mark an `internalAction` that costs money with `@costly` in its doc comment. An `authed`
      operation that calls a `@costly` action through `internal.*` is rate limited like one that
      imports the cost.
MUST NOT: rate limit from an `_internal` export. It carries no identity, and the `authed` entry
          that scheduled or called it has already been limited.
MUST NOT: exempt admins. They get `ADMIN_MULTIPLIER` times the limit, so a leaked admin session is
          still bounded.
MUST NOT: tell a caller which limit they hit or when it resets. `RATE_LIMITED` carries no other
          field, and every surface says "try again in a bit".
MAY: list a router file in C16's `ALLOWLIST` when it reaches a model client without calling it, with
     the reason.

## Why

Every `authed` operation that reaches the agent, TypeSafe, Replicate or RunPod costs money on a
third party, and so does one that fills our storage (the image uploads). Nothing bounded how often
one signed-in cook could do either. A scripted or leaked
session was a bill without a ceiling.

The limit exists to stop abuse, so the refusal hands an attacker nothing: not the limit, not the
kind, not the wait. A `retryAfter` would turn every refusal into a measurement of the bucket, and
the cook has no use for the number: "try again in a bit" is what they act on.

The call is explicit rather than a builder because `procedures.ts` may not import `_generated/api`
([0001](./0001-convex-procedures-only.md)) and the limiter needs `components` from it. A builder
would reach the limiter through a string reference, and double every builder across the I18n and
household variants. The cost of an explicit call is that it can be forgotten, which is what C16
exists for.

Two algorithms, picked by how the call is used. A token bucket for what a cook does in bursts
(assistant, classify, ingredient resolve, image upload): `capacity` is the burst and `rate` per `period` the
long-run speed. A fixed window for a daily budget (recipe write, recipe import). A fixed window with
no `start` begins at a random offset per user, so "10 a day" does not reset at midnight.

A batch takes one token per item (`count`), so one request cannot carry a hundred images past a
limit meant for one. A batch bigger than the whole capacity is refused outright, as bare as any
other refusal.

In a mutation the limit is applied in the same transaction as the write, and a refusal rolls both
back: a refused `sendMessage` saves no question and schedules no answer. In an action it is its own
committed step.

@limitation Design choice: an action that takes a token and then fails is not refunded. A model
outage costs the cook part of their allowance, which the limits are generous enough to absorb.
**Until fixed**, they wait for the tokens to come back. **The fix** is a second round trip to give
the token back, wrapped around every body that can throw.

## Verify

```bash
pnpm check:ratelimits   # C16 — an authed operation reaching a model also reaches enforceRateLimit, and every RATE_LIMITS entry is applied
pnpm test             # the limiter refuses at capacity, per user and per kind; each endpoint refuses before its model runs
```

**What the check can and cannot do.** C16 follows static value imports, so it proves
`enforceRateLimit` is in the operation's own graph, not that it runs first or on every branch: that
is each endpoint's refusal test. A call through `internal.*` is invisible to imports, so it is found
by the marker instead: C16 requires every `internalAction` in `router/` that imports a paid service
to carry `@costly`, and every `authed` file that calls a `@costly` export to carry the guard itself.
Two things it cannot see: an action that is paid but reaches its cost without importing a listed
service, which has to be marked by hand (`uploadMany._internal` is one), and a `@costly` action
called from somewhere that is not an `authed` router file, such as a cron, which is not a caller to
rate limit.

## See also

[0001](./0001-convex-procedures-only.md): why this is a call and not a builder ·
[0003](./0003-ownership-via-procedure.md): the capability pattern this one deliberately is not
