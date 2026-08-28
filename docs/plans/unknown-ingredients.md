---
slice: unknown-ingredients
branch: feat/unknown-ingredients
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# Unknown ingredients

A shopper can type anything into the navigation bar — a name the catalog has never held, in the
wrong language, misspelled — and it lands on their grocery list, while a *sentence* reaches the
assistant instead of being mistaken for food.

---

## 1. Problem

**What is broken.** The bar only knows ingredients it already has. `useSuggestions` searches the
catalog, `rankSuggestions` orders what comes back, and if nothing comes back the shopper is offered
nothing: Enter falls through to `router.push("/assistant")` — a screen that is still static
mockup — and the thing they wanted to buy is simply gone. Three different failures share that one
exit today, and none of them is distinguishable from the others at the moment it happens:

1. **The catalog genuinely lacks the ingredient.** Nothing in the app can add one; the only writer
   of `ingredients` is `seedIngredients`, which runs from a hand-edited file in the repo.
2. **The catalog has it and we missed it.** They wrote it in English on a French device, so the
   locale picked `search_fr` and the row is indexed under `search_en`. Or the spelling was far
   enough off that `PLAUSIBLE` (0.4) was never reached.
3. **It was never an ingredient.** "what can I make with what's left" is a question, and it goes to
   the assistant not because anything decided that, but because the ingredient path ran out.

**How we would know it worked.** A name absent from the catalog produces a visible card on the
grocery list within one gesture, and that card becomes a real ingredient — or an honest refusal —
without a second gesture. Concretely: `readIntent` classifies a fixture of ~40 real inputs
(ingredients, questions, non-food, both locales) with no misroute, and a resolve round trip that
does not answer inside its timeout leaves the shopper told rather than silently reverted.

**Product fit.** [PRODUCT.md](../PRODUCT.md) — the plan is generated from the stock, and stock the
app refuses to record is stock the plan cannot see. The anti-goal it comes near is *cataloguing your
kitchen for no return*: this must stay one gesture. If adding an unknown ingredient ever costs a
form, we have built the inventory app the product refuses to be.

---

## 2. Architecture

**Tables** — no new table, and no new foreign key. Two additive fields on `ingredients`:

| Field    | Shape                                                          | Why                                                                                    |
| -------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `source` | `v.optional(v.union(...INGREDIENT_SOURCES.map(v.literal)))`    | Where this row's facts came from: `seed` · `openFoodFacts` · `foodComposition` · `agent` |

`nutrition` is **required** on this table and per 100g. A row created from a shopper's typing has to
carry one, and the four sources are not equally trustworthy about it — `foodComposition` is a
measurement, `agent` is a generation. `source` is what lets a later screen say so, and what lets us
find and re-derive every invented row once a better lookup exists. `slug` cannot answer this: it is
set by the seed and unset by everything else, which distinguishes two cases when there are four.

No index on it. Nothing queries by source; it is read off a document already in hand.

**Operations** — one new router file. Everything else reuses what exists.

```
router/ingredients/resolve.ts    authed   authActionI18n   → free text → an ingredient id, or a refusal
```

`authed` and not `anon`: it spends money (a model call and two outbound fetches per miss), so it
needs a caller to attribute. It takes no document id, so ADR 0003's ownership question does not
arise — and that is also why it may be a bare action rather than a mutation scheduling one. The
trade that record names is the one we want here: **an awaited action throws and the client catches
it.** The scheduled shape would need somewhere to read the outcome from, and this slice deliberately
has no row to put a status on (see §3, "the ghost").

Adding the resolved ingredient to the list is `router/cellars/addToGroceryList.authed`, unchanged.

**Flow.** The bar's `onSubmit` stops being a fallthrough and becomes a decision:

```
text ──readIntent()──┬─ chat        → router.push("/assistant")          (unchanged destination)
                     ├─ ingredient  → existing path: matchingSuggestion → apply()
                     └─ unknown     → ghost onto the list, then:

  ghost ──resolve.authed (awaited)──┬─ matched  → addToGroceryList(realId) → drop ghost
                                    ├─ created  → addToGroceryList(newId)  → drop ghost
                                    └─ refused  → ghost turns into an error card
```

Inside the action, cheapest first, and each step may end it:

```
1. searchCatalog, widened   both locales · both indexes · threshold below PLAUSIBLE    → no network
2. the shipped datasets     OFF ingredients taxonomy (names) · CIQUAL (fr nutrition)   → no network
3. the live APIs            OFF products + USDA FoodData Central, in parallel          → network
4. sanitizeIngredient agent tool, handed 1's candidates and 2–3's hits,
   with a catalog-search tool of its own                                               → model
5. an existing ingredientId, or facts → createIngredient, via an internal mutation
```

**Step 2 is the one that pays, and it is not an API.** See "Sources" below — the two datasets that
best answer this problem are downloadable files, so they run before anything touches the network:
no key, no rate limit, no outage, no latency. The live APIs are the fallback, not the front line.

Step 1 is not a duplicate of `matchIngredients`. That one answers "which catalog row does this
recipe line mean", and is deliberately strict because a wrong link is worse than none. This one
answers "before we invent a row, is it already here under another spelling or another language",
where a near-miss is worth surfacing because the alternative is a duplicate ingredient forever.

### Sources

Five candidates, all free. Two are files, two are APIs, one is a query endpoint — and the split
matters more than the list, because a file has no key, no quota and no outage.

| Source                            | Shape             | Key | What it is actually good at                                                     |
| --------------------------------- | ----------------- | --- | -------------------------------------------------------------------------------- |
| **OFF ingredients taxonomy**      | static JSON       | no  | **Names and synonyms in dozens of languages.** The wrong-language fix.            |
| **CIQUAL** (ANSES)                | static dataset    | no  | French per-100g composition for raw ingredients. The `fr` nutrition answer.       |
| **USDA FoodData Central**         | REST API          | yes | Foundation + SR Legacy = clean per-100g raw ingredients. English.                 |
| **Open Food Facts** (products)    | REST API          | no  | Packaged and branded goods — barcodes, brands. Weak on "carotte".                 |
| **Wikidata** (SPARQL)             | REST endpoint     | no  | Multilingual labels for foods. Fallback for names only, never nutrition.          |

**The taxonomy is the one I would not skip.** Problem 2 in §1 — they typed English on a French
device — is a *naming* problem, not a nutrition problem, and no composition table solves it.
`taxonomies/ingredients.json` maps one canonical food to its names and synonyms across languages,
which is both the language bridge and a ready-made source for the `aliases` field the catalog
already has and the search index already reads. It is a file we ship, so it costs one lookup.

**CIQUAL has no public REST API** — it is a downloadable table under an open licence. That is a
feature here: French is a first-class locale in this app, and shipping it means the `fr` nutrition
path never leaves the process.

**USDA needs a key**, so it needs an entry in `convex/env.ts` — required, Zod-validated, never
defaulted to `''` (ADR 0005), added in the same commit as the code that reads it. It is the only
source in this slice that touches that file.

**What I would not use:** Edamam, Nutritionix and Spoonacular. All three are freemium with a key, a
low free quota, attribution requirements and terms that restrict storing what they return — and
storing it is exactly what this slice does.

**Cascade** — none. No new `v.id()` field. Rows created here are `ingredients` and are already
covered by the `ingredients` entry in `functions/cascade.ts`.

**ADR 0011 has been amended — done, ahead of the code.** Its table said `ingredients.search` is
written by "the catalog seed", and its rule said such a table is inserted from exactly one module.
That was a description of the codebase at the time, not a rule: a catalog seeded from the repo *and*
grown by cooks has several correct writers. The record now says what we actually mean: **one row
sanitizer, composed by every writer.** `ingredientRow` takes facts and returns every field the table
declares — `search`, `nutriScore`, the i18n fields — and `seedIngredients`, `createIngredient` and
any later `updateIngredient` each build their row through it. How many functions write the table is
not the invariant; that none of them shapes its own row is.

C11 needs no change to enforce that: it already trusts a value by where it was produced rather than
by a filename, so `ingredientRow.ts` is sanctioned by importing `@shared/search`, and a call site
hand-rolling a blob still fails whatever it imports.

---

## 3. Program design

### The ghost, and what it costs

The placeholder is **client-only** — a Jotai atom, no row, nothing written until the ingredient
resolves. It follows `receiptsAtom` exactly, including the doc comment that states the trade, and
the trade here is the same shape:

- It does not reach the other person in the household. They will not see the 📦 appear.
- It does not survive a reload. Close the app mid-resolve and the item is gone with no trace.
- Two people typing the same unknown thing at once resolve independently, and step 1 of the action
  is what stops that becoming two rows — it is the only defence, where a provisional row would have
  been a second one.

That was the call; it is recorded here so the next reader knows it was a choice. Making it durable
later is a `pendingIngredients` table plus reading the ghost from it — `usePendingIngredients`
changes, nothing else does.

**Files created or changed:**

```
shared/ingredientIntent.ts                           readIntent — pure, no React, no Convex
shared/__tests__/ingredientIntent.test.ts
shared/ingredients.ts                                + INGREDIENT_SOURCES

convex/schema/ingredients.ts                         + source
convex/functions/ingredients/ingredientRow.ts        the ONE row sanitizer (ADR 0011)
convex/functions/ingredients/seedIngredients.ts      composes it — no behaviour change
convex/functions/ingredients/createIngredient.ts     composes it — the cook's path
convex/functions/ingredients/resolveIngredient.ts    the five steps above, orchestration only
convex/functions/ingredients/lookup/taxonomy.ts          OFF taxonomy — name → canonical + locales
convex/functions/ingredients/lookup/composition.ts       CIQUAL — canonical → per-100g
convex/functions/ingredients/lookup/openFoodFacts.ts     the products API
convex/functions/ingredients/lookup/foodDataCentral.ts   USDA, the one source needing a key
convex/functions/ingredients/lookup/data/*.json          the two pruned datasets — see below
scripts/build-ingredient-data.mjs                        prunes them; run by hand, output committed
convex/env.ts                                            + FDC_API_KEY (required, ADR 0005)
convex/agent/config/prompts/sanitizeIngredient.ts
convex/agent/tools/sanitizeIngredient.ts
convex/router/ingredients/resolve.ts                 export const authed

src/modules/groceries/_hooks/atoms.ts                + pendingIngredientsAtom
src/modules/groceries/_hooks/usePendingIngredients.ts
src/modules/groceries/hooks.ts                       re-export it — navigation is another module
src/modules/groceries/_model/model.ts                ghosts fold into the "to-buy" section
src/modules/groceries/list-screen.grid.tsx           draws a ghost card
src/modules/navigation/navigation-bar.input.tsx      onSubmit routes by readIntent
```

### Signatures — the seam, in full

```ts
// shared/ingredientIntent.ts — pure, and beside readInput() for the same reason it is:
// what the input MEANS is decided once, not once per call site.
export type Intent =
  | { kind: "chat"; reason: "trigger" | "question" | "sentence" }
  | { kind: "ingredient" }
  | { kind: "unknown" };

export const readIntent: (text: string, hasCatalogHit: boolean) => Intent;
```

`hasCatalogHit` is passed in rather than fetched: the rules are the caller's to apply, and a pure
function that cannot reach a database is a function a fixture can test. The rule order matters and
is part of the contract — an explicit trigger beats everything, then a catalog hit, then the
sentence heuristics. So `"? tomate"` is a question about tomatoes, not a tomato.

Triggers are **data, not code**: a `CHAT_TRIGGERS` const-array per locale, so adding one is an edit
to a list rather than to a branch.

```ts
// convex/router/ingredients/resolve.ts
authed: (ctx, { text }: { text: string }) => Promise<ResolvedIngredient>

// convex/functions/ingredients/resolveIngredient.ts
export type ResolvedIngredient =
  | { status: "matched"; ingredientId: Id<"ingredients">; name: string }
  | { status: "created"; ingredientId: Id<"ingredients">; name: string; source: IngredientSource }
  | { status: "refused"; reason: "not-food" | "not-an-ingredient" | "unreadable" };
```

Three cases and not an id-or-null, for the reason `MatchedIngredient` gives above it: the caller has
to *do* something different in each, and a nullable id pushes that decision to every call site.
`refused` carries why, because "we will not add dishwashing liquid yet" and "we could not read that"
are different things to say to a shopper.

```ts
// convex/functions/ingredients/ingredientRow.ts
// The ONE row sanitizer (ADR 0011). Pure: facts in, every field the table declares out — `search`
// via @shared/search, `nutriScore`, the i18n `name`. It touches no database, so every writer can
// compose it and it can be tested against the seed's own catalog with no ctx in the loop.
export const ingredientRow: (facts: IngredientFacts, source: IngredientSource) => IngredientRow;

// The writers. As many as the domain needs; each builds its row through the sanitizer and nothing
// else. `createIngredient` is the only one this slice adds.
createIngredient(ctx, facts, source): Promise<Id<"ingredients">>;

// convex/agent/tools/sanitizeIngredient.ts
// Returns a NAME and vocabulary, never an id (ADR 0010) — except `existingSlug`, which is
// chosen from a list the tool was handed rather than generated.
export type SanitizedIngredient =
  | { verdict: "existing"; slug: string }
  | { verdict: "new"; facts: IngredientFacts }
  | { verdict: "refused"; reason: "not-food" | "not-an-ingredient" };
```

```ts
// src/modules/groceries/_hooks/usePendingIngredients.ts
export const usePendingIngredients: () => {
  pending: PendingIngredient[];
  /** Ghost first, resolve second, list third. Resolves when the card is real or the ghost failed. */
  add(text: string, unit: Unit, quantity: number): Promise<void>;
  dismiss(ghostId: string): void;
};

export type PendingIngredient = {
  id: string;                       // client-minted; never an Id<"ingredients">
  name: string;                     // what they typed, drawn verbatim until it resolves
  state: "resolving" | "failed";
  reason?: ResolvedIngredient extends { status: "refused" } ? string : never;
};
```

### UI props — structural, never a document type

The ghost is a `GroceryItem` in a new variant. Everything else about the card is what it already
draws, which is the point: 📦 is an emoji and "resolving" is a variant, not a new component.

```ts
// @ui/cards/grocery-item — extends the existing union
type GroceryItemVariant = "pending" | "recent" | "settled" | "memory" | "resolving" | "failed";
```

### Tests

```
shared/__tests__/ingredientIntent.test.ts
   ~40 fixtures, both locales · "?" prefix wins over a catalog hit · a one-word non-word is
   unknown, not chat · a trailing "?" is chat · a quantity prefix ("2 patates") is never chat

convex/router/ingredients/__tests__/resolve.test.ts
   anon rejected (C5) · a name already in the catalog under another locale returns "matched"
   and inserts nothing · a non-food term returns "refused" · a genuine miss inserts exactly one
   row, and a second identical call returns "matched" against it

convex/functions/ingredients/__tests__/ingredientRow.test.ts
   the seed's existing rows come out byte-identical through the sanitizer — this is the ADR 0011 guard

convex/functions/ingredients/__tests__/resolveIngredient.test.ts
   the four steps stop at the first that answers · lookups failing does not fail the resolve

convex/agent/tools/__tests__/sanitizeIngredient.test.ts        schema/vocabulary, no model
convex/agent/tools/__tests__/sanitizeIngredient.manual.test.ts real model, matching the two
                                                              existing tools' split

src/modules/groceries/_hooks/__tests__/usePendingIngredients.test.tsx
   a ghost appears before the action resolves · it is dropped only after the real line lands ·
   a refusal leaves a failed card rather than silently removing it
```

### The datasets cannot ship raw

The OFF ingredients taxonomy is tens of megabytes and covers every food term in every language OFF
knows. A Convex deployment bundles its code, and that bundle has a size limit — pushing the raw file
does not make a slow deployment, it makes a failed one. CIQUAL is smaller but still carries dozens
of nutrients per food where the schema stores eight.

So `scripts/build-ingredient-data.mjs` prunes both — the taxonomy to `en`/`fr` names and synonyms
with the entries our categories can reach, CIQUAL to the eight fields `nutrition` declares — and its
**output is committed**, not built at deploy time. Committed because a deploy that reaches out to
someone else's CDN can fail for reasons that have nothing to do with the change being deployed, and
because the dataset moving under us should be a diff somebody reviews.

**Measure the pruned size before step 6 is written.** If it does not comfortably fit, the fallback
is a `_generated`-style Convex table seeded like the catalog is, and the lookup becomes an indexed
query instead of a map read. That is a different step 2, so find out early.

### Decisions I am least confident about

1. **`nutrition` stays required — settled, deliberately.** A row created from a shopper's typing
   carries real numbers most of the time, because steps 2 and 3 answer before the agent is asked,
   and the agent is competent on food it recognises. `source` records which of the two happened, so
   the fabricated case is findable and re-derivable later rather than indistinguishable. The cost we
   are accepting: a `source: "agent"` row's Nutri-Score is computed from a generation, and it looks
   exactly like one computed from CIQUAL on every screen that draws it.

2. **The refusal path for non-food is a dead end today.** "liquide vaisselle" returns
   `refused: "not-food"` and the shopper is told we cannot add it yet — see Deferred below. That is
   honest, and it is also the app saying no to something a shopper reasonably wants.

3. **`hasCatalogHit` as an argument to `readIntent`.** It keeps the function pure and testable, but
   it means the bar must have searched before it can classify — so a sentence typed fast enough is
   classified with `hasCatalogHit: false` while the debounced query is still in flight. Probably
   fine, since the sentence rules do not depend on it; worth watching.

4. **Four sources plus an agent may be two too many.** The ordering is a bet: that the shipped
   datasets answer most misses and the network is rarely reached. If that holds, OFF-products and
   USDA are latency and a key we are carrying for a long tail — and USDA is the only reason
   `convex/env.ts` changes at all. Instrument step 3's hit rate, and be willing to delete it.

5. **Wikidata is listed and not used.** It answers the name question the OFF taxonomy already
   answers, over a network, so it earns its place only if the pruned taxonomy turns out too lossy.
   Named here so the next person does not re-discover it as a fifth idea.

---

## 4. Slices

```
1. shared/ingredientIntent.ts + its fixture test                  → routing is decidable and proven
                                                                    before any of it is wired
2. onSubmit routes by readIntent; "unknown" logs and does nothing  → chat vs ingredient is fixed
                                                                    today, on its own, revertible
3. the ghost: atom, hook, card variant, folded into "to-buy"       → the screen is complete against
   with `resolve` stubbed to return "refused" after 800ms            a stub; the backend can start
4. ingredientRow extraction + seed byte-identical test             → ADR 0011 stays true BEFORE a
                                                                    second writer exists
5. resolve.authed: step 1 only (widened catalog), + rejection test → real matches land; the
                                                                    threshold-miss case works
6. the prune script + the two datasets + step 2                    → the wrong-language case works,
                                                                    still with no network at all
7. the agent tool, behind a step-2 miss                            → the invention path
8. the two live APIs + FDC_API_KEY, behind a step-4 miss           → the long tail; delete if the
                                                                    hit rate does not justify it
9. source field + backfill of seeded rows to source: "seed"
```

Steps 1–3 are the client and 4–7 the server; step 3's stub is the seam, so neither half waits.

---

## Deferred — the supplies question

**Dishwashing liquid is not an ingredient, and it should not become one.** `ingredients` requires
per-100g nutrition, carries a `diet`, an allergen list and a Nutri-Score, and feeds `computeTags`.
A row for washing-up liquid makes every one of those a lie, and the first symptom is a recipe tagged
from it.

My recommendation, when we do build it, and **not** a second table beside the first: give the
grocery line a **polymorphic ref** — `v.union` of discriminated objects, which is what the schema
rules already require of one — so a line points at either an `ingredients` row or a `supplies` row
and the difference is visible at every read. A second parallel optional FK is the shape that record
exists to forbid, and it is the tempting one here.

What that costs, and why it is not in this slice: `groceryListItems.ingredientId` is a required
field on a live table with three cascade entries and four query paths, and changing it is a
migration of existing rows, not an additive field. It is a slice of its own, and it wants
[ADR 0007](../adr/0007-every-query-uses-an-index.md) read first.

Until then, `readIntent` and the resolver detect it and refuse it by name — which is the one thing
that makes the later slice cheap, because the detection is already written and already tested.

---

## Landing

- [ ] `pnpm verify` green
- [ ] Reviewer subagent clean, or its findings approved
- [x] **ADR 0011 amended** — the single writer is the row builder, not the calling module
- [ ] `ingredientRow` actually exists and both callers go through it — the amendment is a promise
      until step 4 lands, and an ADR describing code nobody wrote is worse than the old one
- [ ] Decisions worth keeping promoted to an ADR or to [CONVENTIONS.md](../CONVENTIONS.md)
- [ ] **This file deleted** — the slice is not done while it exists
