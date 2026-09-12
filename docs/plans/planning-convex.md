---
slice: planning-convex
branch: feat/planning-convex
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# Planning on Convex

After this lands, the tunnel generates a real week from the real recipe library, picked to use what
the household already owns, and the last step writes the plan and the missing ingredients to the
database instead of to a Jotai atom.

---

## 1. Problem

Every plate in the tunnel is invented. [`_hooks/placeholders.ts`](../../src/modules/planning/_hooks/placeholders.ts)
holds the meals, the generating step calls `generatedMeals()`, and the groceries step aggregates
those placeholders client-side through `groceriesFor`. Nothing reads the recipe library, nothing
reads the cellar, and the last step writes nothing at all. The three tables that would make this a
product — `recipes`, `cellarItems`, `groceryListItems` — already exist and are not connected.

**How we would know it worked.** Generate a week on a household whose cellar holds tomatoes, onions
and rice. Every meal is a real recipe from the library. The groceries step lists strictly fewer
ingredients than the meals require, and the difference is what the cellar covers. Pressing the last
button makes those rows appear on the grocery list screen and the meals appear on the planning and
home screens.

**Product fit.** This is the product: plan from what you own, list only what is missing. It comes
close to one anti-goal, which is becoming a nutrition app — the selection here scores on cellar
coverage only, never on macros.

### What the dev deployment actually holds, as of writing

```
recipes                 12   all owned by one userId · global (userId unset)   0
recipeIngredients      126   ≈ 10.5 lines per recipe · 9 lines unconvertible (7%)
ingredients            288   allergen-classified   288
                             defaultUnit "g" on all 136 rows with no gram ratio
cellarItems              6
```

**There is no global catalog.** All twelve recipes belong to a single user, so
`q.eq("userId", undefined)` returns nothing. On that account a week still generates — the ownShare
cap is a ceiling, the fallback fills from the caller's own recipes, and repeats cover the rest — but
every meal is one the user already wrote, and any second account gets an empty pool and no week.
Seeding the catalog is what makes this feature a product rather than a mechanism; it is deliberately
**not part of this slice** and V1 is built and demonstrated against the twelve, repeats included.

**The gram ratios are not the problem they first look like.** 136 ingredients carry neither
`gramsPerPiece` nor `gramsPerMl`, but all 136 have `defaultUnit: "g"` — mass converts to grams with
no ingredient data at all, so they need no ratio. The number that matters is unconvertible *lines*,
and it is 9 of 126. Three are herbs written in `pcs` and are handled by the staples rule below; the
other six are four ingredients missing a piece weight (carotte, cuisse de poulet, jambon, bouillon
de légumes). That is a data fix, not a design problem.

### Staples are presence, not quantity — but the UNIT decides, not the category

A line is treated as a **pinch** when both are true:

1. its ingredient is in `SPICE`, `HERB`, `CONDIMENT`, `OIL` or `SWEETENER`, **and**
2. it is written in `cs`, `cc` or `pcs` — a spoonful or a sprig, not a measurement.

A pinch behaves as a boolean:

- The cellar holds any row for it → the line is **covered**, and **nothing is decremented**, whatever
  the units say. No conversion is attempted.
- The cellar holds none → it goes on the grocery list at the ingredient's **`defaultQuantity` /
  `defaultUnit`**, not the recipe's amount. You buy a jar of thyme, not 1 cc of thyme.

**Anything written in a mass or volume unit is counted normally**, staple category or not. 200 g of
sugar in a cake is a real quantity and is weighed against the cellar like any other line; 1 cc of
cinnamon in the same cake is not. This is what makes the rule safe to apply to `OIL` and `SWEETENER`,
which are the two categories that hold both kinds of line.

It also removes three of the nine unconvertible lines (thyme and tarragon in `pcs`) for free, since
a pinch never asks `toGrams` anything. A pinch's ledger row carries the recipe's `sourceQuantity` for
display and `quantity: 0`, so it reserves nothing and cooking the meal decrements nothing.

---

## 2. Architecture

### Tables

Four changes. One field on an existing table, three new tables.

**`recipes` — one new field.**

```ts
shuffleKey: v.number()          // Math.random() at insert, never read by a human
```

```
.index("by_user_and_shuffle", ["userId", "shuffleKey"])
```

An index can only order by what it contains, so there is no way to both sample randomly and filter
in the same index read. `shuffleKey` makes the random sample an index range — a seed the client
rolls becomes the range start, which is the closest thing Convex has to a seeded cursor:

```ts
.withIndex("by_user_and_shuffle", (q) => q.eq("userId", undefined).gt("shuffleKey", seed))
.take(WINDOW)     // 500
```

`userId` is the first field and it is not decoration: a shuffle over the bare key would return other
households' private recipes. `undefined` is the global catalog, and it is the only value this slice
queries with besides the caller's own id.

Everything else is filtered in memory over that window. Not `.filter()` — a bounded `.take()`
followed by array work, which is what ADR 0007 permits and what several facets require anyway.

**`mealPlans` — one run of the tunnel.**

```ts
householdId: v.id("households")
startDate:   v.number()      // local-day timestamp of the first planned day
days:        v.number()
slots:       vMealSlots
people:      v.number()
seed:        v.number()      // the shuffle seed this run used
note:        v.optional(v.string())   // stored, not used in V1
updatedAt:   v.number()
```

```
.index("by_household", ["householdId"])                    → the household's runs
.index("by_household_and_start", ["householdId", "startDate"])  → the most recent week
```

No `createdBy`. The plan belongs to the household, like the cellar and the grocery list, so a member
leaving must not take the week with them — and a nullable owner field would be a foreign key with
nothing to say.

**`plannedMeals` — one plate.**

```ts
mealPlanId:  v.id("mealPlans")
householdId: v.id("households")     // denormalized: the week reads by household and date
recipeId:    v.id("recipes")
date:        v.number()             // local-day timestamp
slot:        vMealSlot              // singular; vMealSlots is the array
servings:    v.number()
status:      v.union(v.literal("planned"), v.literal("cooked"))
updatedAt:   v.number()
```

```
.index("by_meal_plan", ["mealPlanId"])                     → cascade
.index("by_household_and_date", ["householdId", "date"])   → the week, and the reservations
.index("by_recipe", ["recipeId"])                          → cascade
```

`householdId` is denormalized off `mealPlans` deliberately. The two hottest reads in the slice — the
planning screen's week, and "what is already reserved from tomorrow onward" — are both
household-and-date range scans, and routing them through `mealPlanId` would mean reading every plan
the household has ever run first.

**`plannedMealIngredients` — the ledger.**

```ts
plannedMealId:      v.id("plannedMeals")
ingredientId:       v.id("ingredients")
sourceQuantity:     v.number()      // what the recipe asks, scaled to `servings`
sourceUnit:         vUnit           //   → "2 pcs", the words the meal screen shows
quantity:           v.number()      // the whole requirement, in the unit stock is held in
unit:               vUnit           //   → "300 g", what reserves and what gets decremented
groceryQuantity:    v.optional(v.number())          // the part that was missing, in `unit`
groceryListItemId:  v.optional(v.id("groceryListItems"))
cellarItemId:       v.optional(v.id("cellarItems"))  // the lot this line is spoken for against
updatedAt:          v.number()
```

```
.index("by_planned_meal", ["plannedMealId"])            → the meal's lines, cascade
.index("by_ingredient", ["ingredientId"])               → cascade
.index("by_grocery_list_item", ["groceryListItemId"])   → cascade (detach)
.index("by_cellar_item", ["cellarItemId"])              → cascade (detach), and "is this lot spoken for?"
```

**This table is a ledger, not a copy of the recipe.** Three numbers, three jobs, and none of them
recomputable from the other two:

| | example | what it answers |
|---|---|---|
| `sourceQuantity` / `sourceUnit` | `2 pcs` | what the meal screen prints, in the recipe's own words |
| `quantity` / `unit` | `300 g` | what this meal reserves from stock, and what cooking it subtracts |
| `groceryQuantity` | `50 g` | what went onto the grocery list, and what removing the meal takes back off |

Worked through: the recipe says "1 onion" for 2 servings, the plan is for 4, and the cellar holds one
row of 250 g of onions. The meal screen must say **2 onions**, the reservation is **300 g**
(2 × `gramsPerPiece`), and **50 g** goes on the list because the cellar covers the rest.

Why each is stored rather than derived:

- **`sourceQuantity` cannot be derived from `quantity`.** They are different units, and the
  conversion is not reversible in a way a screen can trust: 300 g back to "2 onions" only holds while
  `gramsPerPiece` is unchanged, and for a pinch `quantity` is `0`, so the recipe's words would be
  lost entirely. Deriving it from `recipeIngredients` instead means a join on every render **and**
  losing the freeze: edit the recipe to 3 onions mid-week and the screen says 3 while the grocery
  list was built for 2. A plan has to remember what it planned.
- **`groceryQuantity` cannot be derived from `quantity`.** The grocery write is lossy three times
  over. It **merges** (three meals wanting tomatoes land on one row), it **rounds** (0.5 pcs rounded
  up twice is 2, recomputed it is 1), and it **splits against the cellar as it was at plan time**
  (the 50 g above). Backing a meal out needs the number that went in, not a number recomputed against
  a cellar that has since changed.
- **`quantity` is not `groceryQuantity` + what the cellar had.** It is the full requirement, and it
  stays the full requirement after the shopping is done and those 50 g have moved into the cellar.
  That is what makes the reservation arithmetic hold across shopping day.

**`cellarItemId` is a hint, not an authority.** Decrementing at cook time does not need it:
`ingredientId` plus `quantity` finds the right row, and the stored id can be stale, because a lot
emptied and recreated by the shopping trip is a new row. So every reader falls back to the
ingredient lookup when the id points at nothing.

What it is for is the question the aggregate cannot answer: **which lot is spoken for.** "250 g of
tomatoes are reserved" does not say whether it is the lot expiring Thursday, and `cellarItems`
carries `expirationDate` precisely because that matters. The moment selection starts preferring
what is about to spoil — and it should — the reservation has to name a row rather than a total.
Storing it now is what makes that a scoring change instead of a migration.

⚠️ **One lot per line, for now.** A requirement large enough to draw on two lots (250 g from one,
50 g from another) can only record the first. V1 reserves against a single row and buys the
remainder, which is wrong only for a household holding the same ingredient twice — see Deferred.

### Cascade

Every new foreign key, its index, and its entry:

```
households  → mealPlans            by_household       delete
            → plannedMeals         by_household       delete
mealPlans   → plannedMeals         by_meal_plan       delete
plannedMeals→ plannedMealIngredients by_planned_meal  delete
recipes     → plannedMeals         by_recipe          delete
ingredients → plannedMealIngredients by_ingredient    delete
groceryListItems → plannedMealIngredients by_grocery_list_item  detach
cellarItems      → plannedMealIngredients by_cellar_item        detach
```

`cascadeDelete` recurses, so deleting a household reaches the ledger through two levels without a
`householdId` on the ledger rows.

⚠️ **Deleting a recipe deletes its planned meals but does not decrement the grocery list.** The
cascade map deletes rows; it does not run domain logic. Named here rather than papered over — see
Deferred.

### Operations

```
router/planning/getDraft.ts     authed  householdQueryI18n  → a generated week, writes nothing
router/planning/getWeek.ts      authed  householdQueryI18n  → the household's planned meals
router/planning/commit.ts       authed  householdMutation   → persists a draft + its groceries
router/planning/planOne.ts      authed  householdMutation   → one plate (recipe screen, slice 6)
router/planning/setServings.ts  authed  householdMutation   → re-scales one meal, updates groceries
router/planning/removeOne.ts    authed  householdMutation   → drops one meal, updates groceries
```

All six are `household*` builders, so membership is the authorization and `ctx.householdId` is what
every query narrows by. There is no `admin` twin and no `userId` argument anywhere in this surface.

### Flow

The generating step rolls a seed **on the client**, once, and passes it to `getDraft`. It is not
taken from `Date.now()` server-side: a query is reactive, so any re-run — the cellar changes, the app
refocuses — would reshuffle the whole week while the user is reviewing it. The seed makes the draft
stable, and makes a reroll a one-line change later.

`getDraft` writes nothing. A tunnel abandoned at the review step has asserted nothing, which is the
stance `commitPreferences` already takes.

```
getDraft(seed, people, days, slots)
  1. availableStock()    cellarItems, minus every future plannedMealIngredient, in stock units
  2. candidatePool()     by_user_and_shuffle window → drop by diet + facets
                         → load lines → drop by ingredient-level allergens
  3. selectMeals()       PURE — greedy, one plate at a time against a virtual stock
  4. shape              → DraftWeek (names and emoji resolved, ids carried)
```

**Selection is greedy and one plate at a time**, which is the point of the feature: the stock the
second meal is scored against is the stock the first one left behind. Score is
`linesFullyCovered / lines`, tie-broken on partially covered lines and then on pool order, which is
already random. A recipe is not picked twice until the pool is exhausted.

`commit(draft)` inserts the `mealPlan`, its `plannedMeals`, and one ledger row per ingredient. A line
the cellar covers gets a `quantity` and no `groceryQuantity`; a line it does not gets both, and its
missing part goes through the existing `addToGroceryList`, which already merges by household,
ingredient and unit.

### Units

Comparison happens in each ingredient's **stock unit** — `g`, `ml` or `pcs`, whichever kind its
`defaultUnit` is — through `toStockUnit` ([shared/ingredients.ts](../../shared/ingredients.ts)). Within
one kind it is arithmetic and needs no ingredient data: milk in `l` against milk in `cl`, carrots in
`pcs` against carrots in `pcs`. Across kinds it goes through grams and needs the ratios, returning
`undefined` rather than guessing. A line that cannot reach the stock unit is never counted as covered
and always goes to the grocery list in the recipe's own unit, where `sourceQuantity` and `quantity`
are simply equal. The ledger's `quantity` / `unit` are this stock unit.

Shopping happens in the **ingredient's `defaultUnit`**, converted back from grams, so the list reads
"3 onions" and not "347 g". `pcs` rounds up to a whole.

---

## 3. Program design

### Files created or changed

```
convex/schema/planning.ts                      mealPlans, plannedMeals, plannedMealIngredients
convex/schema/recipes.ts                       + shuffleKey, + by_user_and_shuffle
convex/schema/households.ts                    + vMealSlot (singular)
convex/schema.ts                               registers the three tables
convex/functions/cascade.ts                    the eight entries above
convex/migrations.ts                           backfill shuffleKey on existing recipes

convex/functions/recipes/saveRecipe.ts         writes shuffleKey on insert
convex/functions/planning/availableStock.ts    (ctx, householdId, from) => Stock
convex/functions/planning/candidatePool.ts     (ctx, args) => Candidate[]
convex/functions/planning/scaleLines.ts        PURE
convex/functions/planning/selectMeals.ts       PURE  ← the feature
convex/functions/planning/planDraft.ts         orchestrates getDraft
convex/functions/planning/commitPlan.ts        insert plan + meals + ledger
convex/functions/planning/syncMealLines.ts     the ONLY writer of the ledger + grocery delta
convex/functions/planning/getWeek.ts           (ctx, householdId, range) => PlannedWeek

convex/router/planning/{getDraft,getWeek,commit,planOne,setServings,removeOne}.ts

src/modules/planning/_hooks/usePlanDraft.ts    generating step
src/modules/planning/_hooks/usePlanCommit.ts   groceries step
src/modules/planning/_hooks/useWeeklyPlan.ts   off placeholders
src/modules/planning/_hooks/usePlanningList.ts off placeholders
src/modules/planning/_hooks/placeholders.ts    shrinks to images only, then deleted
src/modules/planning/hooks.ts                  re-exports what home/ needs
src/modules/planning/_model/model.ts           PlannedMeal loses pricePerKg, gains ids
```

### Signatures

The seam. `selectMeals` is pure and takes no ctx, which is what makes the feature testable without a
database:

```ts
// quantity/unit: the recipe's words, scaled — the ledger's sourceQuantity. A pinch is covered by the
// ingredient's presence in Stock; an unweighed line is never covered.
type Need = { ingredientId: Id<"ingredients">; quantity: number; unit: Unit } &
  ({ kind: "pinch" } | { kind: "measured"; amount: number } | { kind: "unmeasured" });
type Candidate = { recipeId: Id<"recipes">; needs: Need[]; isMine: boolean };   // needs pre-scaled
type Stock = Map<Id<"ingredients">, number>;          // in each ingredient's stock unit, after reservations
type Plate = { date: number; slot: MealSlot; servings: number };

selectMeals(candidates: Candidate[], stock: Stock, plates: Plate[], options: {
  ownShare: number;                                    // 0.3
}): { plate: Plate; candidate: Candidate; covered: Need[]; missing: Need[] }[];
```

```ts
usePlanDraft(args: { seed: number }): {
  meals: DraftMeal[];
  isGenerating: boolean;
}

usePlanCommit(): {
  commit(draft: DraftWeek, ownedRowIds: string[]): Promise<void>;
  isSaving: boolean;
}

useWeeklyPlan(): { sections: DaySection[]; isLoading: boolean; canPlan: boolean; nextStart: Date }
```

`canPlan` and `nextStart` are how the setup step answers the stacking rule below without the screen
computing dates.

### UI props

Structural, never a document type (ADR 0002). `DraftMeal` is the shape both the review step and the
planning screen draw:

```ts
type DraftMeal = {
  recipeId: Id<"recipes">;
  title: string;
  minutes: number;
  servings: number;
  imageUrl?: string;
  ingredients: {
    name: string;
    emoji: string;
    imageUrl?: string;
    amount: number;
    unit: Unit;
    covered: boolean;
  }[];
};
```

Two fields are gone from what the placeholders carry. `pricePerKg`, because no price exists anywhere
in the schema and the tunnel's cost line is a label with nothing behind it. And the meal-level
`emoji`, because a recipe has no emoji column and inventing one per dish is a second vocabulary
nobody maintains — a plate with no image draws an hourglass. The ingredient keeps its `emoji`, which
is a real column on `ingredients` and always set.

### Rules this slice settles

- **Stacking.** A new plan starts the day after the last planned day, and never today: tomorrow is
  the earliest plannable day, so there is time to shop. `days` is capped at `7 − alreadyPlanned`, and
  the tunnel's entry button is disabled at 0, counting a day as planned even when some of its slots
  are empty.
- **The 30% rule is a ceiling, not a quota.** At most `floor(0.3 × meals)` come from the caller's own
  recipes; the rest from the global catalog. When the catalog is short the cap is lifted and the
  remainder comes from the caller's own, and a recipe repeats once the eligible pool is genuinely
  exhausted, so a week always fills.
- **`userId` scoping is privacy, not the 30% rule.** Both halves are index reads on
  `by_user_and_shuffle` — `eq("userId", undefined)` for the catalog, `eq("userId", ctx.userId)` for
  the caller's own. A shuffle over the bare key would return other households' private recipes, which
  is why `userId` is the first field and why this constraint is never the one that gets relaxed.
- **Allergens are enforced, not filtered.** Diet and the fourteen allergens exclude candidates.
  Every other preference the tunnel collects is ignored by this slice.
- **Unknown means excluded.** An ingredient whose `allergens` is `undefined` has not been classified,
  so a recipe containing one is dropped whenever the household avoids anything — the same conservatism
  `computeTags` already applies. If this thins the pool too far in practice, the fix is classifying
  the catalog, not relaxing the rule.
- **Reservations count future meals only.** `date >= today` and `status === "planned"`. Nothing
  decrements the cellar in this slice, so counting past meals would hold stock hostage forever.

### Tests

```
selectMeals.test.ts        prefers the recipe the cellar covers · consumes stock between plates ·
                           no repeat until the pool is exhausted · own share capped at 30% ·
                           empty pool yields no plate rather than throwing
scaleLines.test.ts         scales by servings/recipe.servings · pcs rounds up · unconvertible line
                           keeps its own unit
                           staples (no subject of their own, so C10 puts them in the two above):
                           a spice in cc is a pinch · 200 g of sugar is counted normally ·
                           in the cellar it is covered and decrements nothing
syncMealLines.test.ts      a missing pinch is bought at its defaultQuantity, not the recipe's amount
availableStock.test.ts     cellar minus a future meal's ledger · a past meal reserves nothing
syncMealLines.test.ts      merges into an existing grocery row · decrements on removal ·
                           deletes the row at zero, never below · re-scales on a servings change
getDraft.test.ts           anon rejected · a non-member's householdId rejected · member gets a week
getWeek.test.ts            anon rejected · non-member rejected
commit.test.ts             anon rejected · non-member rejected · writes plan, meals and ledger
planOne.test.ts            anon rejected · non-member rejected
setServings.test.ts        anon rejected · a meal in another household rejected
removeOne.test.ts          anon rejected · a meal in another household rejected
```

### Decisions I am least confident about

1. **The window size, 500 recipes**, wrapping once from 0 if the range comes up short. Sized for the
   filtering, not for the week: diet and fourteen allergens are applied in memory, and a vegan
   household avoiding three things can plausibly reject nine candidates in ten, so a window of sixty
   would hand them an empty week. 500 recipe rows is a cheap read; their ~5,000 ingredient lines are
   not, so the lines are loaded **only for the candidates that survive the cheap filters** and only
   until enough plates are filled.
2. **Score by lines rather than by mass.** `linesFullyCovered / lines` treats a pinch of salt as
   worth as much as 400 g of chicken. Scoring by grams covered would favour bulk, which is arguably
   what "use up the cellar" means. Lines are the simpler thing to explain to a user, so lines win for
   V1. **Pinches are left out of the score** (still reported covered or missing), or a recipe ranks
   on the salt and oil every cellar holds. Still open: a share favours short recipes, since 2 of 2
   beats 8 of 10 — "covered minus missing" is the candidate fix.
3. **`status` on `plannedMeals` with only one writer.** Nothing in this slice sets `cooked`; the
   recipe screen's step-by-step button will. Shipping the column now means the reservation query is
   already written correctly when that lands, rather than being widened later by someone who has to
   notice it.
4. **Three quantities on the ledger row.** It looks like duplication and is not — see the worked
   example above. The one genuinely arguable member is `sourceQuantity`: it could come from a join on
   `recipeIngredients` at render time, at the cost of a per-meal read and of the screen silently
   disagreeing with the grocery list after a mid-week recipe edit.

---

## 4. Slices

```
1. schema + cascade + shuffleKey backfill                 → nothing user-visible, everything else needs it
2. selectMeals + scaleLines + availableStock, with tests  → the feature, callable from a test
3. getDraft + usePlanDraft                                → the generating step shows real meals
4. commit + syncMealLines + usePlanCommit                 → the last button writes the week
5. getWeek + useWeeklyPlan/usePlanningList off placeholders → planning screen and home show the plan
6. setServings + removeOne                                → editing a meal moves the grocery list
7. planOne                                                → the recipe screen's "add to grocery list"
```

Step 7 is the second caller of `commitPlan`, not a second implementation: the recipe screen asks
"when do you want to cook this?", and commits a one-plate draft down the same path. It is designed
for here so nobody builds it twice, and built last.

---

## Deferred — named so they are gaps, not omissions

Everything the tunnel collects and this slice ignores:

- **The note.** Stored on `mealPlans`, read by nothing.
- **Moods / tastes, seeks, cooking time, equipments, cuisine, difficulty.** Collected, not applied.
  The candidate pool filters on diet and allergens only.
- **Reroll.** No "generate again", no per-meal swap. The client-held seed is what makes it cheap when
  it comes.
- **Leftovers and portions.** `servings` is people, and a meal is cooked for exactly its day.
- **Price.** Nothing in the schema carries one, so the cost line leaves the tunnel.
- **Cooking does not decrement the cellar.** The step-by-step button on the recipe screen is the
  writer, in its own slice, through the ledger this one creates.
- **A line draws on one cellar lot only.** Splitting a requirement across two lots of the same
  ingredient is not modelled; the remainder is bought. Needed the day selection starts preferring
  what expires soonest.
- **Nothing prefers the lot that expires first.** `expirationDate` is read by nothing in this slice.
  `cellarItemId` exists so that becomes a scoring change rather than a migration.
- **Deleting a recipe orphans its groceries.** The cascade deletes the planned meals; the grocery
  quantities they contributed stay on the list.
- **The tunnel writes preferences separately.** `commitPreferences` still fires two mutations at the
  generating step rather than folding into `commit`, as its own comment already anticipates.

---

## Landing

- [ ] `pnpm verify` green
- [ ] Reviewer subagent clean, or its findings approved
- [ ] Decisions worth keeping promoted to an ADR or to [CONVENTIONS.md](../CONVENTIONS.md)
- [ ] **This file deleted** — the slice is not done while it exists
