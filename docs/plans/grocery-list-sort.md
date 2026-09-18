---
slice: grocery-list-sort
branch: feat/grocery-list-sort
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# Grocery list sort

The shopper can read "To Buy" three ways: as it is today, grouped by the plate that needs each
item (soonest cook first, each plate with its own share), or grouped by aisle — and adding
something from the bar puts it back to the plain view so the new card is where they expect it.

---

## 1. Problem

**What is broken or missing.** The list is one flat run of cards, merged per ingredient. In the
store the shopper wants either "what do I need for tonight's dinner, and only that" or "everything
from the vegetable aisle", and today they have to hold that grouping — and that arithmetic — in
their head.

**How we would know it worked.** With lasagna planned Monday and Friday, "By plan" shows two
headings in that order, and parmesan reads 200 g under Monday and 100 g under Friday rather than
300 g once. Shopping for Monday alone buys Monday's share. Adding "yuzu" from the bar while in that
view lands on the plain list with the yuzu card on top.

**Product fit.** Lists only what is missing, faster in the store. No new stored state — a sort is
a way of reading, not a fact about the household, so it lives in a Jotai atom and dies with the
session.

---

## 2. Architecture

**Tables** — none changed. The link already exists: `plannedMealIngredients.groceryListItemId`
(index `by_grocery_list_item`) names the list row a plate's claim landed on and `groceryQuantity`
says how much of that row is this plate's; `plannedMeals.date` and `slot` say when it is cooked;
`recipes.title` names it. `ingredients.category` is already returned by
`router/ingredients/list.anon`, so aisle grouping needs no backend.

**Operations** — one new read.

```
router/cellars/getPlatesOnList.ts   authed   householdQueryI18n   → the plates still claiming a row on this household's list
```

**Flow** — standard. The function walks list rows → claims (`by_grocery_list_item`) → plate →
recipe. A plate is **one dish on one day**: lasagna on Monday and lasagna on Friday are two plates
and stay two groups. (Plate and recipe *rows* are read once each — a database concern only; it
never merges anything the shopper sees.) Only `status: "planned"` plates count; a cooked plate has
taken its lines with it. Bounded by the list, not by the household's whole planning history.

**Cascade** — none. No new foreign key.

---

## 3. Program design

**Files created or changed:**

```
convex/functions/cellars/platesOnList.ts          (ctx, { householdId, locale }) => PlateOnList[]
convex/router/cellars/getPlatesOnList.ts          export const authed
convex/router/cellars/__tests__/getPlatesOnList.test.ts

src/modules/groceries/_model/model.ts             Snapshot gains `plates`; Ingredient gains `category`
src/modules/groceries/_model/sort.ts              SORTS, Sort, ToBuyGroup, groupToBuy()
src/modules/groceries/_model/__tests__/sort.test.ts
src/modules/groceries/_hooks/atoms.ts             sortAtom
src/modules/groceries/_hooks/useGrocerySort.ts    { sort, setSort }
src/modules/groceries/_hooks/useSnapshot.ts       reads getPlatesOnList, maps it into `plates`
src/modules/groceries/_hooks/useGroceryList.ts    returns `toBuy: ToBuyGroup[]` next to `sections`
src/modules/groceries/hooks.ts                    re-exports useGrocerySort (the bar resets it)
src/modules/groceries/list-screen.grid.tsx        to-buy drawn from groups; sub-headers; Select in the To Buy header
src/modules/navigation/navigation-bar.input.tsx   showGroceries() also setSort("standard")
translations/{en,fr}/groceries.json               Sort.* labels, Groups.unplanned
```

**Signatures** — the seam:

```ts
// convex/functions/cellars/platesOnList.ts
type PlateOnList = {
  id: Id<"plannedMeals">;        // the plate, not the recipe — one dish on one day
  title: string;                 // resolved in the caller's locale
  date: number;                  // local-day timestamp, as plannedMeals stores it
  slot: MealSlot;
  claims: { lineId: Id<"groceryListItems">; amount: number }[];
  //   `amount` is the claim's `groceryQuantity`, in the list row's unit: this plate's own share of
  //   that row, which is what the by-plan view prints under this heading.
};

// src/modules/groceries/_model/model.ts
export type Ingredient = { id; name; emoji; imageUrl?; category: Category };
export type Plate = {
  id: string; title: string; date: Date; slot: MealSlot;
  claims: { lineId: string; amount: number }[];
};
export type Snapshot = { ...; plates: Plate[] };

// src/modules/groceries/_model/sort.ts
export const SORTS = ["standard", "by-plan", "by-category"] as const;
export type Sort = (typeof SORTS)[number];

export type ToBuyGroup = {
  id: string;   // "to-buy" · "plate:<id>" · "category:<CATEGORY>" · "unplanned"
  heading:
    | null                                                        // standard: no sub-heading
    | { kind: "plate"; title: string; date: Date; slot: MealSlot }
    | { kind: "category"; category: Category }
    | { kind: "unplanned" };
  rows: StockRow[];
};

/** Rows arrive already in section order (recency, then name) and keep it inside each group. */
export const groupToBuy = (rows: StockRow[], sort: Sort, snapshot: Snapshot): ToBuyGroup[];
//   standard     → one group, heading null, every row as it is today (merged per ingredient+unit)
//   by-plan      → one group per plate in (date, slot) order. **A row claimed by several plates is
//                  drawn under each of them, with that plate's own share** — 200 g parmesan under
//                  Monday's lasagna, 100 g under Friday's — so shopping for one day buys one day.
//                  The share is the claim's amount, less whatever the cellar already covers, and
//                  that cover is taken off the soonest plate first. What the shopper typed
//                  themselves — the `wanted` part, no plate behind it — closes the list under
//                  "unplanned". Empty groups are dropped.
//   by-category  → CATEGORIES order; empty categories dropped; no fold-to-OTHER (unlike the recipe
//                  page — on a list, a lone aisle heading is still the aisle you walk to).
//
// A by-plan row is a `StockRow` with `amount` set to the plate's share. Its `id` is the bare
// `ingredient:unit` key under the soonest plate and `plate:<id>:ingredient:unit` under the others
// — the same two-key rule `buildSections` already uses for a partly-owned ingredient, so the card
// the shopper was looking at flies to the first plate and the extra copies fade in below.
// Tapping any copy acts on the ref, as today; the quantity sheet is unchanged.

// src/modules/groceries/_hooks/useGrocerySort.ts
export const useGrocerySort = (): { sort: Sort; setSort: (sort: Sort) => void };

// src/modules/groceries/_hooks/useGroceryList.ts
export const useGroceryList = (): {
  sections: Sections;          // unchanged — cellar and recently-bought still read from here
  toBuy: ToBuyGroup[];         // what the grid draws for "To Buy"
  submit; error;
};
```

**UI props** — `@ui/select` is used as is (`options`, `value`, `onChange`, `size: "md"`). The
grid's local `SectionHeader` gains `trailing?: ReactNode` and `justifyContent: "space-between"`;
a sub-heading is a second, smaller header row (`Text.Md`, muted, with the plate's day and slot as
a caption) with its own key.

**Animations — the constraint this slice must not break.** Every card and header stays a sibling
in the one wrapping container, produced by the one keyed `.map`. Cards keep their `ingredient:unit`
key across a sort change, so switching view is a reflow carried by each card's `layout` transition,
not an unmount; the per-plate extra copies are the only cards that enter and leave, and they fade
exactly as the leftover row of a part-bought ingredient does today. Sub-headers are keyed
`header:to-buy:<group id>` and enter with a fade; the "To Buy" header keeps `header:to-buy` so the
Select never remounts. Ghosts keep leading: in a grouped view they lead the first group, since a
ghost has neither a plate nor a category yet.

**Reset on add.** `navigation-bar.input.tsx#showGroceries` — the one place both the suggestion
and the unknown-word paths pass through on their way to the list — calls `setSort("standard")`
before it routes. A tap on a card in the grid (buying, taking out, relisting) does **not** reset:
the shopper is walking the store in the order they chose.

**Tests**

```
getPlatesOnList.test.ts   anon rejected · member of another household rejected · returns a planned
                          plate with the line and amount it claims · a cooked plate is left out · a
                          claim whose row is gone from the list is left out · two plates of one
                          recipe come back as two plates
sort.test.ts              standard is one group and merges as today · by-plan orders plates by date
                          then slot · the same recipe on two days is two groups · a row claimed by
                          two plates appears under both with each plate's share · the cellar's cover
                          is taken off the soonest plate first · a shopper-typed amount closes the
                          list under "unplanned" · the bare key goes to the soonest plate, later
                          copies are plate-scoped · by-category follows CATEGORIES and drops empties
useGroceryList.test.tsx   (extend) `toBuy` follows the atom; setSort("by-category") regroups
```

**Decisions I am least confident about**

1. **A separate query rather than widening `getGroceryList`.** Keeps `_toLine` and the three
   cached list queries untouched, and the plates read re-runs only when claims move. The cost is
   one more subscription on the screen.
2. **Only "To Buy" is grouped.** The selector sits in that header and the cellar / recently-bought
   sections keep their order. Grouping the cellar by aisle is a plausible follow-up, not this slice.
3. **`Plate` is a new field, not the model's existing `GroceryLine.meal`.** `meal` drives the
   claim-vs-instruction arithmetic in `stockFor` (`toBuy = max(0, claimed − owned) + wanted`);
   populating it would change what the list asks for. Plates are for the by-plan view only.
4. **Reset lives in the navigation bar's arrival step**, not in `useStockActions`. The action does
   not know whether it came from the bar or from a card tap, and only the bar is "adding".
5. **How the cellar's cover is split between plates.** The list row is one number and the cellar
   covers part of it; by-plan has to say which plate's share that cover reduces. Soonest plate
   first, because the earlier plate is cooked first and takes the stock first — the same FIFO the
   server's `_discharge` uses. A different rule is a one-line change in `groupToBuy`.

---

## 4. Slices

```
1. sort.ts + its test, with `plates: []`                 → by-category works end to end, by-plan
   atoms + useGrocerySort + grid Select + sub-headers       shows everything under "unplanned"
2. platesOnList + router + rejection tests               → one real operation, callable
3. useSnapshot reads it; by-plan groups for real         → the grid changes nothing
4. navigation bar resets the sort on add; fr/en copy
```

---

## Landing

- [ ] `pnpm verify` green
- [ ] Reviewer subagent clean, or its findings approved
- [ ] Decisions worth keeping promoted to an ADR or to [CONVENTIONS.md](../CONVENTIONS.md)
- [ ] **This file deleted** — the slice is not done while it exists
