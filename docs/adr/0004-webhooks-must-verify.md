---
id: 0004
applies_to: ["convex/http/**/*.ts", "convex/**/*.ts"]
status: accepted
supersedes: []
---

# A webhook cannot be defined without a verifier

MUST: define every webhook with `verifiedWebhook()` from
      [convex/http/verified.ts](../../convex/http/verified.ts).
MUST NOT: call `httpAction` anywhere except `convex/http/verified.ts`.
MUST: verify against the **raw** request body, before parsing.
MUST NOT: give `verify` a default, an `optional` marker, or a "skip when unconfigured" branch
          (that is [0005](./0005-env-validated-at-boot.md)).

## Why

The predecessor shipped **three webhooks with no verification at all** and two more that verified
only when an environment variable happened to be set. These were public URLs. An attacker who could
guess a job id could POST a forged success payload and have the backend download an arbitrary URL,
store it, and attach it to the **real owner's** record — or POST a failure and destroy any in-flight
job, or replay a captured payload indefinitely.

The policy "we verify our webhooks" existed. It was not a fact, because nothing made it one.

`verifiedWebhook` makes it a fact by making the unsafe version unrepresentable: `verify` is a
required property of the options object, so a webhook without one does not compile. Lint rule R5
then bans bare `httpAction` everywhere else, closing the bypass.

**Raw body first, and this is not a detail.** HMAC signatures cover the exact bytes the sender
transmitted. `JSON.parse` followed by `JSON.stringify` does not reproduce them — key order,
whitespace and number formatting all shift. `verifiedWebhook` reads `await request.text()` once and
hands those bytes to `verify` unparsed; parsing happens only after verification succeeds.

Failures are deliberately opaque — a bare `401` with no reason. A verification error that explains
itself is an oracle.

## Verify

```bash
pnpm lint      # eslint R5 — no bare httpAction outside http/verified.ts
```

## See also

[0005](./0005-env-validated-at-boot.md) — the other half of the fail-open class ·
predecessor evidence: F2 — [03-FLAWS.md](../_reference/03-FLAWS.md)
