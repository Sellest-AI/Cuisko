---
id: 0011
applies_to: ["convex/schema/**/*.ts", "convex/functions/**/*.ts", "shared/search.ts"]
status: accepted
supersedes: []
---

# A field a search index reads is built by one shared serializer, never at the call site

- A field named as a `searchField` in any `searchIndex` MUST be written only through a serializer
  exported from `shared/search.ts`.
- A call site MUST NOT assemble such a field itself — no `.join()`, no template literal, no
  concatenation producing the stored value.
- The serializer MUST split what it is given into the same tokens the index will, and de-duplicate
  those. De-duplicating whole terms does not do it: "huile d'olive" beside "huile" is two distinct
  strings and one repeated token, so the repeat survives into the index.
- The serializer MUST add accent-folded copies of every term rather than replacing the accented
  form, and MUST de-duplicate the result.
- A CLOSED VOCABULARY MUST NOT be written into a `searchField`. It belongs in a `filterField`.
- A value the app PROMISES the user — a diet, an allergen claim, ownership — MUST be a
  `filterField`, never a search term.
- A table carrying a derived search field MUST have exactly one **row sanitizer** — one function
  that produces every derived field the table declares, from the facts it is given. There is no
  naming convention for it, because a name taken from the field stops working the moment a table has
  two of them.
- Every function that writes such a table MUST compose that sanitizer. There may be as many writers
  as the domain needs — a create and an update are both legitimate, and a seed beside them.
- A write that changes ANY source of a derived field MUST recompute ALL of that table's derived
  fields before it returns, through the sanitizer. Recomputing some and leaving the rest is the same
  failure as recomputing none: the row is half-indexed under its old spelling, and nothing reports
  it. A write that changes no source MUST NOT recompute — recomputing a field whose inputs did not
  move is how a second writer appears.

⚠️ **One sanitizer, any number of writers.** The two sanitizer clauses above replace a single one
that said a table carrying a derived search field "MUST be inserted from exactly one module" — a
description of the codebase at the time, mistaken for a rule. Several writers is the normal case: the ingredient
catalog is seeded from the repo AND grown by cooks, and a row created from a thin source is later
corrected from a better one. What there can only be one of is the function that shapes the row.

**Which mutations that is, concretely.** The rule is about the sources, not about the table, so read
it that way round:

| Derived field                        | Its sources                              | So it is recomputed by                        |
| ------------------------------------ | ---------------------------------------- | --------------------------------------------- |
| `ingredients.search`                 | `name`, `aliases` on the same row        | every writer, via `convex/functions/ingredients/ingredientRow.ts` |
| `recipes.search`                     | the recipe's `recipeIngredients` rows    | whatever adds, removes or re-matches a line   |
| `recipes.is*` facets                 | `recipes.tags`                           | the same, via `computeTags` then `facetsOf`   |

**`ingredients` is the table with several writers, and it is the reason this record was amended.**
The catalog is seeded from `ingredientCatalog.ts` in the repo, and it is also grown by cooks: a
shopper typing something the catalog does not hold gets that ingredient created for them. A row
created from a thin source will later be corrected from a better one. Every one of those is a
legitimate write and none is going away.

None of them may shape its own row. `ingredientRow` does — hand it facts, get back every field the
table declares, `search` included — and every writer of the table composes it. Today that is three:
`seedIngredients`, `createIngredient` — the create this record was amended for — and `rememberAlias`,
the update that was anticipated here and has since arrived. It writes a word a shopper typed onto a
row the agent matched it to, so it moves `aliases` and therefore owes `search`; it composes
`withAlias` from `ingredientRow.ts` rather than building a blob, and patches only the two fields
whose sources it moved. A correction of a thin row from a better source is still anticipated.

⚠️ Do not read that count as the list to audit — it has been wrong once already, having said "two"
for as long as there were three. The question to ask of a new writer is not whether it is named
here but whether it composes the sanitizer.

C11 enforces this clause with no change: it trusts a **value produced by** a module that imports the
serializer, not a filename on a list. So `ingredientRow` earns that trust by importing
`@shared/search`, every writer composing it inherits it, and a writer that hand-rolls a blob instead
still fails whatever else it imports. (The recomputation clause is the one C11 cannot see — see the
warning below.)

A recipe's title, description and instructions are the sources of NOTHING here — the blob carries no
authored text, by design. `saveTranslations` therefore patches a recipe and correctly recomputes
nothing, and that is not an omission to be fixed. The mutation to be careful with is any future edit
that touches a recipe's LINES.

⚠️ **The recomputation clause is the one nothing enforces.** C11 gates inserts, which name their table as a
literal; `ctx.db.patch(recipeId, …)` names no table at all, so attributing it needs the type checker
rather than an AST walk. And `recipes.search` is derived from `recipeIngredients` — a *different*
table — so even a complete gate on writes to `recipes` would not see the write that invalidates it.
Until a check knows a derived field's source tables, this clause is upheld by review alone.

Two places are known to break it today: `CASCADE` deletes a recipe's `recipeIngredients` rows when
an ingredient is deleted and recomputes nothing, and the backfill migration projects facets from
stored tags rather than recomputing them, which it documents and does deliberately.

## Why

A search blob is denormalized, so it is correct only while every writer produces the same shape from
the same input. When one does not, nothing fails: the row is indexed under a spelling the reader
never searches for, and it is simply never found. There is no error, no empty state, no log line —
the recipe is just missing from a list, which is the failure mode
[_reference/02-DIVERGENCE.md](../_reference/02-DIVERGENCE.md) is about.

The vocabulary rule is not style. Convex tokenizes with Tantivy's `SimpleTokenizer`, which splits on
whitespace **and punctuation**, so `gluten-free` is indexed as the two terms `gluten` and `free` —
and `free` is then shared with `nut-free` and `dairy-free`, three different facets colliding on one
meaningless high-frequency token.

The promise rule is the one with teeth. A search expression matches **any** of its terms and ranks
the rest, so `search("pepper vegan")` returns pork stews — ranked lower, but returned, and inside
the 1024-result scan budget that a rare term like `pepper` will dominate. Filtering the results
afterwards removes what came back but cannot recover what did not, so a vegan cook silently sees
fewer recipes than exist. A `filterField` narrows candidates **inside** the index scan and matches
exactly. Convex additionally documents relevance order as *"subject to change"*, which settles it: a
dietary guarantee cannot rest on a ranking the vendor may re-tune.

## Verify

`pnpm check:search` (C11) · `pnpm typecheck` · `pnpm test`
