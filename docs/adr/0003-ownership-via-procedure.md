---
id: 0003
applies_to: ["convex/router/**/*.ts", "convex/procedures.ts"]
status: accepted
supersedes: []
---

# Ownership is a procedure capability, never a remembered call

MUST: use `ownedQuery('<table>')` / `ownedMutation('<table>')` for any procedure that takes a
      document id and acts on that caller's own document. The document arrives as `ctx.doc`.
MUST NOT: re-implement the ownership check inline (`if (doc.userId !== ctx.userId)`) in a
          `router/` file. **Except in an action — see "Actions" below.**
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

## Verify

```bash
pnpm typecheck        # ownedQuery/ownedMutation signatures; OwnedTable membership
pnpm lint             # R7 — router/ may not import isAuthorized
pnpm check:exports    # C1 — `authed` accepts owned* as well as auth* builders
pnpm check:authtests  # C5 — each gated export has a rejection test
```

## See also

[0001](./0001-convex-procedures-only.md) · predecessor evidence: F1 (two live IDORs), F6 —
[03-FLAWS.md](../_reference/03-FLAWS.md)
