---
slice: ingredient-shelf-life
branch: feat/ingredient-shelf-life
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# Ingredient shelf life

The week plan cooks what goes off first, from a date the app estimates by itself when food lands
in the cellar.

---

## 1. Problem

**What is broken or missing.** `cellarItems.expirationDate` exists, and two readers already honour
it (`consumeFromCellar` drains soonest first, `turnBrief` sorts the assistant's cellar by it). But
nothing ever writes one: `addToCellar` inserts `undefined`. So the planner cannot tell the spinach
bought Monday from the tin of tomatoes bought in March, and plans them alike.

**How we would know it worked.**
- A cellar holding fresh spinach (5 days) and canned tomatoes (365 days), with two recipes that
  each cover one of them equally and one plate to fill: the spinach recipe wins it. Urgency decides
  **which** recipes make the week. `spreadMeals` then reorders them for variety, so where they land
  is not promised, except that plate 1 keeps its meal and the most urgent pick usually stays first.
- Every catalog slug carries a `shelfLifeDays` (a test enforces it).
- The assistant never writes a date or an expiry warning in its reply.

**Product fit.** It uses what the household owns before it spoils, which is the core promise. The
anti-goal it comes close to is nagging: the dates are rough estimates, the user never sees them,
and the assistant is told never to bring them up.

---

## 2. Architecture

**Tables**

```
ingredients.shelfLifeDays        v.optional(v.number())   no index — read off a row already in hand
ingredients.openedShelfLifeDays  v.optional(v.number())   no index — stored now, read by nothing yet
cellarItems.expirationDate       unchanged                 now written by addToCellar
```

`openedShelfLifeDays` = whole days the food keeps **once opened or cut**, stored the normal way
after that (usually the fridge), at the short end of the range. UHT milk 3, concassé de tomates 5,
dried pasta 365, fresh tomatoes 2 (cut). It is never longer than `shelfLifeDays`, and a seed test
enforces that. Filled in now, by the seed and by `sanitizeIngredient`, so the catalog already
carries it when the cellar learns to record an opening. Until then, **nothing reads it**, and its
doc comment says so, so nobody mistakes it for a live input.

`shelfLifeDays` = whole days the food keeps **in the form a shop usually sells it, unopened, under
normal storage**, at the short end of the real range. Concassé de tomates 365 (canned), milk 90 (UHT
carton), fresh tomatoes 7, dried pasta 730. Opened packages are not modelled.

Optional because rows written before this field exist, and a cook's own ingredient can be stored
before the model answers. **Absent means no date on the cellar row, and a row with no date is not
urgent.** It is never read as "expires today".

**Operations** — no new router export. `router/cellars/addToCellar.ts` keeps its args; the date is
derived server-side, so the client ships nothing new. `router/cellars/getCellar.ts` is unchanged:
it already returns `expirationDate` on each row, which is all the 🕑 needs (slice 7).

**Flow** — both ways food reaches the cellar (buying off the grocery list, adding straight to the
cellar) already go through `functions/cellars/addToCellar`. That one function is where
`shelfLifeDays` becomes `expirationDate = now + shelfLifeDays × DAY_MS`.

**Cascade** — none. No new foreign key.

---

## 3. Program design

**Files created or changed:**

```
convex/schema/ingredients.ts                         + shelfLifeDays, openedShelfLifeDays, doc comments carrying the rules above
convex/schema/ingredientPayloads.ts                  vIngredientFacts + both (optional)
convex/functions/ingredients/ingredientRow.ts        IngredientFacts + both, written through
convex/functions/ingredients/ingredientCatalog.ts    SHELF_LIFE_DAYS: Record<slug, { sealed: number; opened: number }>, total over the ~330 rows
convex/agent/tools/sanitizeIngredient.ts             zod fields for both, passed to facts
convex/agent/config/prompts/sanitizeIngredient.ts    new "# How long it keeps" section
convex/functions/cellars/addToCellar.ts              reads the ingredient, writes / merges expirationDate
convex/functions/planning/soonestExpiries.ts         NEW — extracted from turnBrief (second caller)
convex/functions/assistant/turnBrief.ts              calls soonestExpiries
convex/functions/planning/selectMeals.ts             Options.expiries, urgency weight on covered lines
convex/functions/planning/planDraft.ts               builds expiries, passes them
convex/functions/planning/spreadMeals.ts             doc comment only: the LIMITATION line
convex/functions/planning/cellarLots.ts              reserves the soonest-expiring lot, not the first row
convex/agent/config/prompts/assistant.ts             _CELLAR rewritten: dates are rough, never mention them
src/modules/groceries/_model/expiresSoon.ts          (expirationDate?: number, today: number) => boolean
src/modules/groceries/_model/__tests__/expiresSoon.test.ts
src/modules/groceries/…                              the card's adapter passes expiresSoon to the UI card
src/ui/…/cellar card                                 + prop expiresSoon?: boolean → 🕑 top right
```

**The 🕑 on the cellar card.** Shown when the row's `expirationDate` is under `EXPIRES_SOON_DAYS =
5` days from the client's `today` (the planning hooks' `Clock.today`), expired included. No date,
no number, no colour change, no tap action: it is a gentle hint, in keeping with never rushing the
user.

Computed on the client, from the `expirationDate` `getCellar` already ships. ADR 0015 does not
apply: it covers a value two payloads carry and two screens must agree on, and only the cellar
card shows this one. Were a second screen ever to show it, it moves to the server then.

**Signatures**

```ts
// functions/planning/soonestExpiries.ts
/** The soonest expirationDate among an ingredient's lots with quantity > 0. Undated lots are skipped. */
soonestExpiries(lots: Doc<"cellarItems">[]): Map<Id<"ingredients">, number>

// functions/planning/selectMeals.ts
type Options = {
  ownShare: number;
  /** Soonest expiry per ingredient (epoch ms). Absent key = not urgent. */
  expiries?: Map<Id<"ingredients">, number>;
};
```

**Urgency in the score.** A covered line counts `1` today. It will count `1 + EXPIRY_WEIGHT × u`,
where `u` is 1 for an ingredient expiring on or before the first plate. It falls linearly to 0 a
week (`MAX_DAYS`) after the first plate, and it is 0 past that or with no date. A week rather than
the last plate, so a one-plate plan still prefers the spinach (the §1 criterion). No `today`
option: urgency counts from the first plate. `EXPIRY_WEIGHT` starts at 1: at full
urgency, a covered line of spinach is worth two of pasta. Because `selectMeals` scores plates in
calendar order, urgent stock is already spent on the early plates. The weight only has to win the
close calls.

**Merging in `addToCellar`.** A purchase bought into an existing row of the same unit:

- **Takes the new purchase's date** when either of these holds:
  - **The old stock is nearly done by time:** a third or less of its shelf life is left
    (`expirationDate − now ≤ shelfLifeDays / 3`, expired included). By then the older stock is
    assumed eaten. `STALE_SHARE = 1 / 3`.
  - **The old stock is swamped by quantity:** the purchase is at least three times what the row
    still holds (`args.quantity ≥ 3 × row.quantity`, same unit since the merge is by unit; a row at
    0 qualifies). What remains is mostly the new purchase. `SWAMP_FACTOR = 3`.
- **Keeps the earlier date** otherwise. The older stock is a real share of the row and still goes
  off first.
- An undated row takes the new date. An ingredient with no `shelfLifeDays` leaves the row as it
  was.

Worked example, milk at 90 days, nothing eaten in between:

| Day | Purchase | Before              | ≤ 1/3 left?  | ≥ 3× held?  | Date                 |
| --- | -------- | ------------------- | ------------ | ----------- | -------------------- |
| 0   | 4        | no row              | —            | —           | day 90               |
| 30  | +1       | 4 held, 60 days left | 60 > 30, no  | 1 < 12, no  | kept, day 90         |
| 60  | +1       | 5 held, 30 days left | 30 ≤ 30, yes | 1 < 15, no  | updated, day 150     |
| 90  | +20      | 6 held, 60 days left | 60 > 30, no  | 20 ≥ 18, yes | updated, day 180    |

LIMITATION, to go in the function's doc comment: the row jumps to the NEWEST purchase's date, not
the second-to-last one's. The day-30 carton is treated as gone at day 60 too. That is accepted.
It carried the day-90 date all along, so the planner was already pushing it into meals. The
existing TODO about splitting lots is where exact dates would come from.

**Prompt text (sanitizeIngredient).** In outline:

> shelfLifeDays: how many days this keeps in the form a shop usually sells it, unopened, stored
> the normal way (cupboard, fridge or freezer as sold). Take the short end of the real range, but
> do not shrink it: a tin of chopped tomatoes is 365, UHT milk 90, fresh tomatoes 7, dried pasta
> 730. Never the "once opened" figure.
>
> openedShelfLifeDays: how many days it keeps once opened or cut, stored the normal way after
> that. Short end of the range: UHT milk 3, a tin of chopped tomatoes 5, dried pasta 365, a cut
> tomato 2. Never more than shelfLifeDays.

A model answer where `openedShelfLifeDays > shelfLifeDays` is clamped down to `shelfLifeDays`, not
refused. The `.refine()` note in the tool explains why one bad field must not drop the whole row.

**Prompt text (assistant `_CELLAR`).** `turnBrief` is unchanged: the model still sees
`expires <date> (in N days)`, since it needs the date to rank. The existing "what expires soonest
first" rule stays. Added:

> Expiry dates are rough estimates. Use them only to decide what to cook first. Never mention a
> date, never say something is expiring or going off, and never make the person feel rushed.

**Tests**

```
schema / seed        every CATALOG slug has positive integer shelfLifeDays and openedShelfLifeDays ·
                     opened ≤ sealed for every slug
addToCellar.test     insert: date = now + days · no shelfLifeDays → undefined ·
                     merge with > 1/3 left keeps the earlier date · merge with ≤ 1/3 left (and
                     expired) takes the new date · the milk table above, all four steps, in one
                     test (4 → +1 kept → +1 updated by time → +20 updated by quantity) ·
                     row at quantity 0 → new date ·
                     merge into undated row takes the new date ·
                     grocery-list purchase and direct add both date the row
selectMeals.test     two recipes equal on coverage: the one covering the expiring ingredient wins
                     plate 1 · no expiries option → identical to today's output (existing tests unchanged)
soonestExpiries.test skips quantity 0 and undated lots · takes the minimum across lots
cellarLots.test      picks the soonest-dated lot; undated lots come after dated ones
sanitizeIngredient   the parsed facts carry both through to the row · opened > sealed is clamped
assistant prompt     _CELLAR contains the never-mention rule (prompt tests in prompts/__tests__)
expiresSoon.test     4 days left → true · 5 left → false · expired → true · undated → false
```

No new export, so no new rejection test.

**Decisions I am least confident about**

Settled with the user:

1. **`turnBrief` keeps showing the date to the model.** Only the prompt forbids repeating it.
2. **`spreadMeals` is not changed**, only documented. Its doc comment gets: "LIMITATION: this
   ignores expiry. A meal picked early in the week to use up food that goes off soon can be moved
   to a later plate, after that food has expired."
3. **Merge rule**, as written above.

Still mine to watch:

- **Only `planDraft` passes `expiries`.** `draftMeal` (the swap sheet) ranks alternatives for one
  plate and could pass them too. Left out: a swap is the user choosing, not the planner.
- **`EXPIRY_WEIGHT = 1` is a starting guess.** The selectMeals test pins the behaviour, not the
  number.

**Deliberately out of scope**
- Opening, on the cellar side, which is the next slice. The ingredient side ships now. What that
  slice will do, so this one does not close it off:
  - `expirationDate` stays the **only** date anything reads. It is seeded from `shelfLifeDays`
    here, and opening only ever moves it earlier.
  - Opening is implied by cooking, with no "I opened it" button. When `cookMeal` drains part of a
    lot and some of it is left, that lot gets `cellarItems.openedAt = now` and
    `expirationDate = min(expirationDate, openedAt + openedShelfLifeDays)`.
  - A lot whose `openedAt` is already set is skipped. A second meal from the same carton does not
    move the date again.
  - A lot drained to zero needs nothing. An ingredient with no `openedShelfLifeDays` keeps its
    date.
  - A sealed purchase merging into an opened row follows the merge rule above, unchanged. In
    practice an opened row almost always meets the time rule, because its days left are short
    against the sealed `shelfLifeDays`, so it takes the new purchase's date. The opened carton is
    assumed finished, like any stale lot.
- Showing or editing a date in the UI. The 🕑 in slice 7 is the only trace of it, and it has no
  number.
- Backfilling existing cellar rows. The dev database gets wiped and reseeded, so no migration.
- Splitting a cellar row into lots by purchase (the existing TODO in `addToCellar`). Not planned.

---

## 4. Slices

```
1. schema + payload + ingredientRow + SHELF_LIFE_DAYS seed + its test   → catalog rows carry both fields
2. sanitizeIngredient schema + prompt                                   → new ingredients carry it too
3. addToCellar writes / merges the date + tests                         → cellar rows get dated
4. soonestExpiries extraction, cellarLots soonest-first                 → one helper, two callers
5. selectMeals urgency + planDraft wiring + spreadMeals LIMITATION note → the week uses it
6. assistant _CELLAR rule                                               → the assistant stays quiet about it
7. _model/expiresSoon + its test + 🕑 on the cellar card               → the one visible trace
```

---

## Landing

- [ ] `pnpm verify` green
- [ ] Reviewer subagent clean, or its findings approved
- [ ] The shelf-life rule stays in the `shelfLifeDays` doc comment; nothing to promote to an ADR
- [ ] **This file deleted** — the slice is not done while it exists
