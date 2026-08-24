---
id: 0009
applies_to:
  [
    "convex/functions/cellars/**/*.ts",
    "convex/router/cellars/**/*.ts",
    "src/modules/groceries/_hooks/**/*.ts",
    "src/modules/groceries/_model/**/*.ts",
  ]
status: accepted
supersedes: []
---

# Taking stock out is not an undo unless the client says so

MUST: take the quantity restored to the grocery list as `restoreToList`, an argument to
`removeFromCellar`. The caller computes it by peeling its receipts.
MUST NOT: infer that a removal is an undo from how recently a row was written. No handler may read
`updatedAt` to decide whether, or how much, to put back on the list.
MUST: perform the removal and the restored line in one mutation, so an undo cannot half-apply.
MUST: derive a row's `undoable` flag from the receipt set alone.
MUST NOT: derive `undoable` from `updatedAt`, or from any other timestamp.
MAY: reject an out-of-range `restoreToList` with a validator bound. Nothing more is owed — the worst
a wrong value does is put a wrong amount on the household's own list.

## Why

**The server never recorded what a purchase consumed, so it cannot compute what an undo gives
back.** Buying strikes off grocery lines; the lines are gone. Only the client still holds the
receipt that says which of them this purchase settled, and how much of it was surplus nobody asked
for.

The rule that used to stand in for that knowledge — re-list the whole removed quantity if the row
was touched within five minutes — produced three defects, all reachable:

1. **Phantom lines.** Buy 500 g of something nobody wanted, undo, and a 500 g line appears that the
   shopper never wrote.
2. **Double counting.** With plates claiming 800 g and the shopper wanting 300, undoing 900 of an
   1100 g purchase re-lists 900 *and* reopens the 600 gap. The screen reads 1500.
3. **False recency.** `addToCellar` patches `updatedAt` when merging, so topping up a month-old row
   by 1 g made the whole row look freshly bought.

**The prohibitions are the point of this record.** Both look like fixes. Putting the recency rule
back on the server reads as hardening an endpoint that trusts client input — it would restack the
two rollbacks and restore all three defects. Deriving `undoable` from `updatedAt` reads as fixing
"undo does not survive a reload" — it would draw an undo badge on a row whose receipt is gone, so
the button would be there and do the wrong thing.

Undo genuinely does not survive a reload: receipts are a Jotai atom, deliberately, because they
answer a question about the last five minutes of one session. That fails closed — no receipts, no
badge. Making it durable later is adding a `receipts` table and moving `peelReceipts` behind it;
the band logic and its tests do not change, only where they run.

Narrative and data flow: [../ARCHITECTURE.md](../ARCHITECTURE.md).

## Verify

`pnpm test -- src/modules/groceries/_hooks/useGroceryList.test.tsx` — asserts a purchase's undo
restores exactly what it struck off, that surplus restores nothing, and that a rejected purchase
leaves no receipt behind to peel.
