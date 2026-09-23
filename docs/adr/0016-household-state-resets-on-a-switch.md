---
id: 0016
applies_to: ["src/modules/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}", "app/_layout.tsx"]
status: accepted
supersedes: []
---

# Session state about a household resets when the household switches

MUST: declare an atom holding session state about the household the app shops for with
      `householdAtom` (`~/modules/households/household-atom`), never with a plain `atom`.
MUST: name every other stateful atom in `NOT_HOUSEHOLD`
      (`scripts/checks/c14-household-atoms.not-household.mjs`), with the reason it is not about a
      household.
MUST: capture `householdSession()` before awaiting the server in a write that lands in a
      `householdAtom`, and skip the write when the household changed during the await.
MUST NOT: scope an atom to a household per read (a household store passed to `useAtom`, a
          household-keyed slice read through a hook). The decision is made once, where the atom is
          declared.
MAY: keep a way of looking (a sort, a sheet's size) or anything about the person, the session or
     the UI as a plain `atom`.

## Why

A household can be switched from the home header, the grocery list or the account drawer, and none
of the screens that own the session state has to be on screen when it happens. State that belonged
to the first household then served the next one: a purchase made in one kitchen was undone against
another's cellar and put back on that kitchen's grocery list; a planning run started for one was
committed into whichever was current by the end. Nothing threw, and no test was red. Each atom
looked like every other atom in its file.

`HouseholdAtomsReset`, mounted once in `app/_layout.tsx`, puts every `householdAtom` back to its
initial value when the current household changes from one known household to another. It ignores the
id being briefly unknown (an auth refresh, a skipped query), which is not a switch and would empty a
planning run for nothing. Reads and writes are ordinary Jotai calls.

The reset runs the moment the household changes, so a write computed from the old household's state
that lands after it would put that state straight back. `householdSession()` is the guard for the
writes that wait on the server first.

**Why the declaration and not the read.** Scoping per read (a household store handed to each
`useAtom`, or a keyed slice behind a hook) makes the reader decide. There were about thirty-five
readers of these atoms, and one that forgot would read other state than its neighbours, silently.
The value is what is or is not about a household, so the decision sits where the value is declared.

**Reset, not kept per household.** Switching back does not restore the previous household's undo or
the words it was still looking up. Keeping one set per household was possible; the reset is simpler
and loses five minutes of undo at worst.

## Verify

```bash
pnpm check:households   # C14 — every stateful atom is a householdAtom or listed as not household
pnpm test               # HouseholdAtomsReset's transitions, and a purchase whose receipt must not survive a mid-flight switch
```

**What the check can and cannot do.** C14 cannot tell whether a value is about a household. It
refuses to let the question go unanswered: a new stateful atom fails until it is declared with
`householdAtom` or added to `NOT_HOUSEHOLD` with a reason, and that line is the decision a reviewer
reads. A list entry whose atom has gone fails too, so the list cannot excuse whatever takes the name
next.

The `householdSession()` rule has no script. Whether a write awaits before it lands is a question of
control flow, not of shape. That half is caught in review, at the moment an async write to a
`householdAtom` is added, the same way [ADR 0015](./0015-one-producer-for-a-shared-derivation.md)
leaves its producer choice to review.

## See also

[0006](./0006-screens-never-fetch.md): module-scoped Jotai state lives in a module's `_hooks/` ·
[0009](./0009-the-client-decides-an-undo.md): the receipts this was first found in ·
[ARCHITECTURE.md § State](../ARCHITECTURE.md#state)
