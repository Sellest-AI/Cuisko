---
id: 0014
applies_to: ["convex/router/recipes/*.ts", "convex/functions/recipes/**/*.ts", "src/modules/recipes/**/*.ts", "src/modules/recipes/**/*.tsx"]
status: accepted
supersedes: []
---

# A recipe is readable by any signed-in cook; only editing is gated

- `getOne.authed` MUST be built with `authQueryI18n`, not `ownedQueryI18n`: any signed-in caller
  may read any recipe by id, whoever wrote it. That is what sharing a link and favoriting a catalog
  recipe both mean.
- The read payload MUST carry the derived `isOwned` boolean, and the screen MUST decide from it
  what to show; it never compares ids. Today the payload withholds the owner's `userId` because no
  surface shows an author yet; when one does, the author ships as a name (ADR 0010), and `isOwned`
  stays the flag the screen reads.
- The write gate MUST NOT move. `updateOne` keeps its ownership check before a write, and every
  future mutation on a recipe document does the same (ADR 0003).
- Discovery follows the read. `search` spans every recipe — the caller's, the seeded catalog's and
  other cooks' — and ranks rather than filters: the caller's own first, then the ones that keep
  their stored diet, names before ingredients inside each band (`searchForUser`). `getAll` stays
  the caller's own list, because it is the list they wrote, not a search. Seeing who wrote a match
  is still a slice of its own: an author ships as a name (ADR 0010), not as a `userId`.
- The editor MUST guard itself, since its read is no longer owner-only: `useRecipeDraft` folds
  `isOwned === false` into the missing state, so a crafted `/recipe/edit/[foreignId]` deep link
  renders as missing, not as an editable form. The detail header hides the pencil unless
  `isOwned === true`.
- A favorite MAY point at any existing recipe, whoever owns it, and is private to the cook who set
  it: nothing counts favorites and no surface shows another cook's shelf. Favorites are curation,
  not a feed (PRODUCT.md anti-goal #3).

## Why

Before this record, `getOne` was `ownedQueryI18n` and several comments promised that "a recipe is
only ever the cook's own". Favorites made that false by construction: a shelf holds recipes that are
not yours to edit, and the detail screen must open them. Opening the read while keeping the write
and the listing gated is the narrowest change that makes the shelf, and a shared link, possible.

The rule most likely to be "fixed" by someone who has not read this is the builder: an
`authQueryI18n` on a router that takes a document id looks like exactly the hole ADR 0003 exists to
close. Here it is the decision. What protects a cook is not that strangers cannot read a recipe,
but that they cannot change it.

## Verify

`pnpm test` — `convex/router/recipes/__tests__/getOne.test.ts` pins that a stranger's recipe is
returned with `isOwned: false` and without `userId`; `setFavorite.test.ts` pins that a foreign
recipe can be favorited and a missing one cannot; `getFavorites.test.ts` pins that one cook never
sees another's shelf.
