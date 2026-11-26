---
id: 0014
applies_to: ["convex/router/recipes/*.ts", "convex/functions/recipes/**/*.ts", "src/modules/recipes/**/*.ts", "src/modules/recipes/**/*.tsx"]
status: accepted
supersedes: []
---

# A recipe is readable by id by anyone; listing and editing are gated

- A recipe MUST be readable by id by anyone in the app, whoever wrote it: that is what sharing a link
  and favoriting a catalog recipe both mean. `getOne.authed` is built with `authQueryI18n`, not
  `ownedQueryI18n`; `getOne.anon` with `publicQueryI18n`, for someone who opened a link without an
  account.
- `getOne.anon` MUST pass no viewer to `loadRecipe`: no `isOwned`, `isFavorited`, `sourceUrl` or
  `userId`. The author's name ships in both.
- Only the recipe page reads `anon`. A list or a search of recipes MUST NOT reach another cook's
  recipe without an account: a link is sent by someone, a list is not.
- The one exception is the catalog, the recipes with no owner (`userId` unset): `getCatalog.anon`
  lists it without an account, for the Explore page. Its ranges start with `userId = undefined`, so
  it reaches no cook's recipe by construction, and no other list may.
- The read payload MUST carry the derived `isOwned` boolean, and the screen MUST decide from it
  what to show; it never compares ids. The payload withholds the owner's `userId`: the author ships as
  a name (ADR 0010), and `isOwned` stays the flag the screen reads. Read without an account it
  carries no flag, and the screen offers nothing the flag would gate.
- A shared link previews the recipe to anyone holding it, signed in or not. `getOne.server` hands
  the showcase website's server the viewer-less payload (no `isOwned`, `isFavorited`, `sourceUrl`
  or `userId`), and the website MUST publish only its title, description and cover. Anything more on that page,
  such as the ingredients or the author, would make it a public recipe page: a product decision, not
  a preview change.
- The write gate MUST NOT move. `updateOne` keeps its ownership check before a write, and every
  future mutation on a recipe document does the same (ADR 0003).
- Discovery follows the read. `search` spans every recipe — the caller's, the seeded catalog's and
  other cooks' — and ranks rather than filters: the caller's own first, then the ones that keep
  their stored diet, names before ingredients inside each band (`searchForUser`). `getAll` stays
  the caller's own list, because it is the list they wrote, not a search. Seeing who wrote a match
  is still a slice of its own: an author ships as a name (ADR 0010), not as a `userId`.
- The editor MUST guard itself, since its read is no longer owner-only: `useRecipeDraft` folds
  `isOwned === false` into the missing state, so a crafted `/recipe/edit/[foreignId]` deep link
  renders as missing, not as an editable form. The detail header offers Edit only when
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

The read then opened to people without an account, for the same shared link: sending a recipe to
someone who met a sign-in wall first lost the recipe, and App Review refused the wall.

## Verify

`pnpm test` — `convex/router/recipes/__tests__/getOne.test.ts` pins that a stranger's recipe is
returned with `isOwned: false` and without `userId`, and that `server` and `anon` ship no owner id,
viewer flag or source page, and that `anon` answers with no session; `setFavorite.test.ts` pins that a foreign
recipe can be favorited and a missing one cannot; `getFavorites.test.ts` pins that one cook never
sees another's shelf.
