---
id: 0012
applies_to: ["convex/functions/ingredients/lookup/**/*.ts", "shared/ingredientMatch.ts"]
status: accepted
supersedes: []
---

# A lossy index ranks its claimants by what folding cost, never by source order

- A dictionary keyed on a LOSSY transform of a name MUST decide a contested key by how much the
  transform destroyed, and MUST NOT let the source file's order decide it.
- The cost MUST be derived from the same module that performs the transform. A second copy of the
  word lists MUST NOT exist — the two disagree the first time either list grows.
- The cost MUST be a COUNT, never a boolean. A name reduced at all is not disqualified: `pomme de
  terre` loses `de` and still owns `pomme terre`, because the flour beside it loses three words.
- EVERY dropped token counts — stopword, preparation qualifier, quantity and bare number alike.
- Equal cost MUST fall back to source order, and that fallback MUST be documented at the call site
  as the genuine ambiguity it is, not as a rule.
- A tie MUST NOT be assumed to BE a genuine ambiguity. Where one claimant is knowably right — a food
  against a colour additive, not `pâte` against `pâtes` — the outcome MUST be pinned by a test,
  because what holds it is then the upstream file's shape, and a regeneration of that file changes
  it silently.
- A spelling carrying a GRADE in its own name MUST NOT claim the grade-free key, at any rank.
- A grade in the CALLER's query MUST NOT be treated that way. It is re-attached downstream by
  `gradesIn`, and collapsing the two cases breaks retrieval to fix identity.

## Why

Folding is lossy on purpose, so several spellings routinely reduce to one key and only one entry can
own it. Whichever the upstream file happened to list first is not an answer: Open Food Facts' file
has no meaningful order, and it filed `oignon` under onion powder, `beurre` under butterfat,
`jambon` under diced ham and `citron` under lemon LEAF. Each then answered a lookup with another
food's names and another food's CIQUAL figures — a row wrong in eight numbers at once, with nothing
anywhere to say so. That is the failure mode of
[_reference/02-DIVERGENCE.md](../_reference/02-DIVERGENCE.md): no error, no empty state, just a
quietly wrong number.

Two rules here were each bought with a defect. **Counting rather than asking yes-or-no** came first:
a predicate that asked only whether a QUALIFIER came off could not see `Dés de jambon`, which loses
two stopwords and no qualifier. **Counting numbers** came second: OFF files colours as `Vert 1724`,
which folds to the bare `vert` — and so does `thé vert`, because `thé` folds to the English stopword
`the`. With the number free, the dye E143 cost 0 against the tea's 1, so a French shopper asking for
green tea reached a colouring with no CIQUAL code at all. A number that is the only thing separating
two names is doing identifying work.

Grades are not a counting question. `crème à 33% de matière grasse` is not a worse claim on the
general food's key, it is not a claim at all — eight such entries fold onto `creme matiere grasse`,
so any winner is the wrong fat content for the other seven. Emptying the key is the cheaper failure:
a miss costs one generation and the resolver can still build the row correctly, while a wrong fat
content is permanent and silent.

## Verify

`pnpm test` — `convex/functions/ingredients/lookup/__tests__/taxonomy.test.ts` pins the contested
keys against the real shipped dataset rather than a fixture, and
`shared/__tests__/ingredientMatch.test.ts` pins the cost function itself.
