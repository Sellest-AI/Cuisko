---
id: 0012
applies_to: ["convex/schema/ingredients.ts", "convex/functions/ingredients/**/*.ts", "shared/ingredientIntent.ts"]
status: accepted
supersedes: []
---

# `ingredients` holds food, and a non-food line gets its own table when it gets one

MUST NOT: write a row into `ingredients` for something nobody eats — cleaning products, cookware,
toiletries, pet food.
MUST: refuse such a term at the point it is read, and refuse it by name — `readIntent` classifies it
and `resolveIngredient` returns `refused`, so no row is created and the shopper is told.
MUST NOT: satisfy a future non-food line by relaxing `ingredients.nutrition`, its `diet`, or its
allergen list to optional. Those fields are what make the table mean something.
MUST: model a line that can point at either kind as a **polymorphic ref** — a `v.union` of
discriminated objects — when that slice is built, per [0007](./0007-every-query-uses-an-index.md).
MUST NOT: model it as two parallel optional foreign keys on `groceryListItems`.

## Why

`ingredients` requires per-100g nutrition, carries a `diet` and an allergen list, and feeds
`computeTags`. A row for washing-up liquid makes every one of those a lie, and the first symptom is
not a bad grocery line — it is a **recipe tagged from it**, because the tag pipeline reads the same
fields and cannot tell that this row was never food. The damage leaves the table it was written to.

So the refusal is deliberate and it is not a placeholder. It is also already built and tested: the
detection in `shared/ingredientIntent.ts` and the `refused` arm of the resolver both ship today,
which is the whole reason the later slice is cheap.

**Why not a second table beside the first, now.** `groceryListItems.ingredientId` is a required
field on a live table with three cascade entries and four query paths. Turning it into a union is a
migration of existing rows, not an additive field, and it is a slice of its own. Until it is built,
a supply is refused rather than half-supported — a row that exists but lies is worse than a term the
app honestly declines.

**Why a union and not two optional FKs.** Parallel optional foreign keys make "exactly one of these
is set" an invariant that nothing enforces and every reader must re-check; a discriminated union
makes the difference visible at every read and impossible to get wrong at every write. This is the
shape [0007](./0007-every-query-uses-an-index.md) already requires of a polymorphic reference, and
the parallel-FK shape is the tempting one here precisely because the additive change looks cheaper.

## Verify

`pnpm test` — `shared/__tests__/ingredientIntent.test.ts` and the resolver's refusal cases ·
`pnpm check:schema` (C4) for the union shape when the supplies slice lands
