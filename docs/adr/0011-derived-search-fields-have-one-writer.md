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
- A derived search field SHOULD have exactly one writer. Where it has more, every writer MUST
  recompute it in the same mutation that changes its source.

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
