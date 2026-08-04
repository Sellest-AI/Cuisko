---
id: 0005
applies_to: ["convex/env.ts", "env.ts", "convex/**/*.ts"]
status: accepted
supersedes: []
---

# Environment is Zod-validated and throws at boot

MUST: declare every environment variable in the Zod schema in
      [convex/env.ts](../../convex/env.ts) (backend) or [env.ts](../../env.ts) (client), and read
      it only through the exported `env` object.
MUST NOT: default a secret to `''`, `?? ''`, or any other falsy value.
MUST NOT: gate a security check on its secret being truthy — `if (secret) verify()`,
          `if (secret && provided !== secret)`, and `if (key !== env.KEY)` where `env.KEY` may be
          `''` are all the same bug.
MUST: express a genuinely optional variable as `.optional()`, so its type is `string | undefined`
      and TypeScript forces every caller to handle absence.
MUST: add a key in the same commit as the code that reads it — an unused required key blocks every
      deployment for no benefit.

## Why

The predecessor's backend env was 26 lines of `KEY: process.env.KEY ?? ''`. That single default is
the root cause of its worst class of defect: **a deployment missing a secret did not fail. It came
up healthy with that secret's check disabled.**

Three consumers turned `''` into an open door — a truthiness guard that skipped verification when
unconfigured, a second one that skipped a signature check, and a comparison where passing `""`
authenticated successfully against an unset `SERVER_PRIVATE_KEY`, exposing all twelve `server*`
procedures to anyone.

Fail loudly at boot, never silently at runtime. A deployment that cannot satisfy its own security
preconditions must refuse to start — that is strictly better than serving traffic with
authentication off, and it is discovered in seconds rather than after a breach.

Once the schema guarantees a required secret exists, **there is never a reason to branch on it.**
That is why [procedures.ts](../../convex/procedures.ts) has no `if (env.SERVER_PRIVATE_KEY)` guard
around its key comparison: the only thing such a branch could ever mean is "skip the check when
misconfigured".

Secret comparison uses `timingSafeEqual` from [convex/lib/secrets.ts](../../convex/lib/secrets.ts),
not `!==` — a non-constant-time compare on a secret leaks it a byte at a time.

## Consequence for tests

`convex/env.ts` throws at module load, so the test runner has to supply a valid environment — the
same contract a real deployment satisfies. That is why [vitest.config.mts](../../vitest.config.mts)
sets `SERVER_PRIVATE_KEY`. **The test suite booting at all is the proof that validation runs.**

## Verify

```bash
pnpm test       # env.ts throws at import; the suite cannot start without a valid environment
pnpm typecheck  # `.optional()` keys are `string | undefined` at every call site
```

## See also

[0004](./0004-webhooks-must-verify.md) — the other half of the fail-open class ·
predecessor evidence: F3 — [03-FLAWS.md](../_reference/03-FLAWS.md)
