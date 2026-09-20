---
id: 0003
applies_to: ["convex/router/**/*.ts", "convex/procedures.ts", "convex/functions/assistant/**/*.ts"]
status: accepted
supersedes: []
---

# Ownership is a procedure capability, never a remembered call

MUST: use `ownedQuery('<table>')` / `ownedMutation('<table>')` for any procedure that takes a
      document id and acts on that caller's own document. The document arrives as `ctx.doc`.
MUST NOT: re-implement the ownership check inline (`if (doc.userId !== ctx.userId)`) in a
          `router/` file. **Two exceptions, each with its own section below:** an action, which
          has no `ctx.db` for the builder to load through, and a resource whose table belongs to an
          installed Convex component rather than to our schema, which `OwnedTable` cannot name.
MUST NOT: import or call `isAuthorized` from `convex/router/**` (lint R7). Direct calls belong in
          `convex/functions/**`, where a batch operation or an already-loaded document needs
          checking.
MUST: give every `authed` / `admin` / `server` export a test asserting the wrong caller is
      rejected (check C5).
MUST: add a table to the `OwnedTable` union in [procedures.ts](../../convex/procedures.ts) the
      moment it gains a `userId`; add a parent reference to `PARENT_FIELDS` in
      [isAuthorized.ts](../../convex/functions/users/isAuthorized.ts) the moment a table gains one.

## Why

The predecessor had a **good** ownership checker — it handled indirect ownership through parent
documents, and it threw by default. It was called in **7 of 22** places that took a document id.
Nothing was wrong with the helper; the problem was that calling it was optional.

> A convention decays. A capability does not.

`ownedMutation` inverts the default: the handler cannot run without `ctx.doc`, and `ctx.doc` cannot
exist unless the check passed. There is no code path that forgets it, because there is no code path
that reaches the handler without it.

The split between the two files is deliberate and worth preserving:

| File | Owns |
| --- | --- |
| `functions/users/isAuthorized.ts` | the ownership **rules** — direct `userId`, then parent walk |
| `procedures.ts` `ownedQuery`/`ownedMutation` | the guarantee they are **applied** |

Keeping the rules callable on their own means a batch operation can check twenty documents without a
second implementation of what ownership means.

`isAuthorized` reads ownership **structurally** rather than from a per-table registry, because a
registry is one more thing to remember on a new table — and forgetting it would fail open.

`OwnedTable` is written as `Extract<TableNames, "recipes" | "ingredients" | "recipeSteps">` rather
than a bare string union, so a table named in that list but absent from the schema is a **compile
error**, not a silent gap. The union narrows as tables land; keeping the `Extract` is what makes the
list self-checking.

## Actions

**An action cannot have ownership guaranteed for it. It checks in its handler, by hand.**

`ownedQuery` / `ownedMutation` work because a query and a mutation ctx carry `db`, so the builder
can load the document and assert ownership before the handler exists. An action ctx carries
`runQuery` instead — no `db`, nothing to check with. Writing the equivalent `ownedAction` would mean
`procedures.ts` calling an internal query through `internal.*`, and importing `_generated/api` in
that file is the type cycle [0001](./0001-convex-procedures-only.md) bans. The only way around
*that* is a string-keyed `makeFunctionReference`, which breaks silently on a rename — in the one
file where a silent break is an authorization hole.

**First, check whether it has to be an action at all.** An `ownedMutation` that schedules an
`internalAction` gets the guarantee back for free — the builder checks ownership, `ctx.doc` is the
document, and the scheduled job needs no check of its own because it is already internal. Scheduling
from a mutation is transactional: if the mutation commits, the job runs. Prefer that shape whenever
the caller does not need the action's *result*, and reach for a bare action only when it does.

The trade is where failure surfaces. An action that is awaited can throw, and the client catches it;
a scheduled job fails with nobody listening, so the caller needs somewhere to read the outcome — a
status on the row or a jobs table — or the user is told "saved" about work that did not happen. No
such field exists on `recipes` today, which is why `updateOne` is still an action.

So for a public action taking a document id:

MUST: compare the owner in the handler, before anything is written or spent.
MUST: give it a rejection test asserting a non-owner is refused (C5 covers the export existing; the
      test is what covers the check being right).
MUST NOT: push the check down into an `internal*` query to make it look enforced. Internal reads
      serve crons, migrations and jobs that own nothing, and gating them on a `userId` either breaks
      those callers or invites an optional `userId` — the `if (secret) verify()` fail-open shape
      [0005](./0005-env-validated-at-boot.md) bans.

Live instance: [`router/recipes/updateOne.ts`](../../convex/router/recipes/updateOne.ts) compares
`stored.userId !== ctx.userId` after loading through `getOne._internal`.

### This one is not enforceable by code, and that is the cost

Every other rule here has a script behind it. This one does not, and cannot:

- A checker can see that an action takes `v.id(<owned table>)`. It cannot see whether the comparison
  in the handler is the *right* one — comparing the wrong field, or a stale variable, type-checks and
  passes any grep.
- A "must contain an ownership comparison" heuristic fails open on the case that matters: the action
  that never wrote one at all is also the one where no pattern exists to match.

So this is a **remembered call**, and this ADR opens by explaining that remembered calls decay —
7 of 22 in the predecessor. The mitigation is not a script; it is that the surface stays small.
An action taking a document id is rare. If that stops being true, the answer is to revisit
`makeFunctionReference` or move the operation to a mutation, not to add more hand-written checks.

**Adding one is a decision, not a detail.** Say so in the commit body, and add the rejection test in
the same commit.

## Component-owned resources

**A document that lives in an installed component cannot be guarded by a builder, in a query or a
mutation as much as in an action.** The reason is different from the action's, and it is a type
error rather than a missing `ctx.db`: `OwnedTable` is `Extract<TableNames, …>`, and `TableNames`
is our schema. A table the `@convex-dev/agent` component owns is not in it, so
`ownedQuery('threads')` does not fail at runtime — it does not compile. The `Extract` that makes
the union self-checking for our tables is exactly what puts a component's tables out of reach.

The first such resource is a conversation thread. A `threadId` is a client-supplied string that
names somebody's private conversation, the component answers whoever names it, and threads are
never deleted — so a leaked id reads that conversation for good. The comparison has to be written
by hand, and this ADR opens by explaining what happens to hand-written comparisons.

The mitigation that *is* available is to make the hand-written check a chokepoint rather than a
convention:

MUST: write the comparison in exactly one function, and have every reader of the resource call it
      before reading anything. There is no second way in.
MUST: return `null` from it rather than throwing, for every failure — missing, malformed, not
      yours. The three are one answer to a caller ("there is no conversation here"), so nothing in
      the return value or an error message tells an attacker which ids are real. Failing closed is
      what makes this safe: a genuine fault can only ever cost a conversation, never expose one.
MUST: give each router entry point a rejection test asserting another user's id is refused, as
      for an action.
MUST NOT: reach the resource from anywhere else — not through the component's own query and not
      through an `Agent` method that takes the id. Check C13 enforces this.

Live instance: [`functions/assistant/ownedThread.ts`](../../convex/functions/assistant/ownedThread.ts)
is the chokepoint; [`threadMessages.ts`](../../convex/functions/assistant/threadMessages.ts) and
[`openThread.ts`](../../convex/functions/assistant/openThread.ts) are its only callers, and both do
nothing when it answers `null`. The rejection tests are in `router/assistant/__tests__/`.

### What C13 checks, and why that is not a contradiction

The section above says a hand-written comparison is not enforceable by code, and C13 is a script.
Both are true, because they check different things. Whether `ownedThread` compares the *right*
field is semantic, and no script can see it — that is the cost the section above names, and it is
paid here too. Whether anything reaches a thread *without* `ownedThread` is structural: an
allowlist of files may reference `components.agent` at all (everywhere else its only legal use is
as the argument of `new Agent(…)`, so an alias or a destructuring cannot slip past) or call the
`Agent` reader methods that take a `threadId` (`listMessages`, `syncStreams`,
`getThreadMetadata`), and nothing else may. That
is the same kind of rule as lint R7 — router/ may not import `isAuthorized` — and like R7 it fails
closed: a new reader anywhere is a finding until it is either routed through the chokepoint or
audited and added to the list, in that commit, on purpose.

So the surface that must stay small is not "every place that reads a thread"; it is the allowlist,
and adding a line to it is the review.

## Verify

```bash
pnpm typecheck        # ownedQuery/ownedMutation signatures; OwnedTable membership
pnpm lint             # R7 — router/ may not import isAuthorized
pnpm check:exports    # C1 — `authed` accepts owned* as well as auth* builders
pnpm check:authtests  # C5 — each gated export has a rejection test
pnpm check:threads    # C13 — a thread is reached only through ownedThread and its allowlisted callers
```

## See also

[0001](./0001-convex-procedures-only.md) · predecessor evidence: F1 (two live IDORs), F6 —
[03-FLAWS.md](../_reference/03-FLAWS.md)
