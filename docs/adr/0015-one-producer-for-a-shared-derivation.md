---
id: 0015
applies_to: ["shared/**/*.ts", "convex/router/**/*.ts", "convex/functions/**/*.ts", "src/modules/**/*.{ts,tsx}"]
status: accepted
supersedes: []
---

# A value two screens must agree on is computed by one side

MUST: compute a derived value on the server when two payloads carry it and the screens drawing them
      must agree — the client receives it, and never recomputes it.
MUST: add the deriving function to eslint R9 when it lands, so client code cannot import it.
MUST NOT: export a client-callable helper that reproduces a derivation the server already ships.
MAY: share the function's *definition* in `shared/` — the ban is on calling it from the client, not
     on where the source lives.

## Why

The client and the Convex deployment version independently. An OTA update lands before a backend
deploy, or after it, and for that window two implementations of "the same" derivation are running
against each other. If both produce a value the user sees, they disagree on some devices and not
others, for as long as the two versions coexist.

That failure has no signature. Nothing throws, no test is red, and neither diff contains the bug —
the client's copy was correct when it shipped and the server's is correct now. It surfaces as a user
saying one screen disagrees with another, on their phone, which you cannot reproduce on yours.

`avatarSeed` is the case this was written for. A cook's generated face is drawn from their user id
on the home header and on any recipe they wrote. The home header holds its own id and could derive
the seed locally — one line, no round trip, obviously fine. It is the shape to refuse: change the
hash and half the users see one face beside their name and a different one on their own recipe.
Both payloads carry a seed the server computed, so there is nothing to drift.

This is not about trust. The seed is not a secret and the client could be handed the algorithm
safely. It is about there being exactly one answer in flight at a time.

## Verify

```bash
pnpm lint        # eslint R9
```

**What the check can and cannot do.** R9 is a list of banned client imports, not a judgement. A
script cannot tell which values appear on two screens, nor that two functions compute "the same"
thing — naming the producer is the human half, and it is the half that is easy to skip. So R9 holds
only for derivations someone added to it; a second producer written from scratch on the client, with
no import to ban, passes lint. The reviewable moment is when a derivation gains a second caller, and
the table in AGENTS.md is where that gets caught, not the linter.

The rule earns its place anyway: the failure it prevents is invisible in review and unreproducible
in support, and the cost of obeying it is one field on a payload.

## See also

[0002](./0002-ui-isolation.md) — the same instinct one layer down: a boundary is kept by making the
wrong reach unavailable rather than by remembering not to make it ·
[CONVENTIONS.md](../CONVENTIONS.md)
