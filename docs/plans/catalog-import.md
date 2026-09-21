---
slice: catalog-import
branch: feat/catalog-import
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# Catalog import

The catalog fills itself: a script asks an agent for dishes from every cuisine, finds the
well-reviewed versions on Marmiton, imports them 20 at a time without an owner, and a ZIP moves the
finished catalog from one deployment to another.

---

## 1. Problem

**What is broken or missing.** A new cook opens an empty catalog. Importing one URL at a time from
the dashboard can't scale to hundreds of recipes. It also can't tell a recipe with 400 reviews
from one nobody has cooked. And a catalog built on dev can't be moved to prod.

**How we would know it worked.**
- The `catalog:import` script, run N times, imports 20 × N recipes and **never the same URL twice on the
  same deployment**. A re-run finds the ledger and moves on to new dishes.
- Every imported recipe had **≥ 30 reviews and ≥ 4.5/5** on Marmiton at import time, and was the
  most reviewed such card of its search. The ledger shows the numbers.
- Across a full run of the dish list, every value in `CUISINES` except `other` has at least one
  dish in the ledger, and at least a quarter of the dishes the agent proposed are vegan.
- The `catalog:export` script on dev, then `catalog:restore` on prod, gives prod the same catalog:
  same text in every locale, the same tags and the same photos. **The restore makes no model
  call.**

**Product fit.** "Plan from what you own" only works if there are recipes to plan from. The
catalog is what makes the first week usable. It comes close to the anti-goal of becoming a recipe
feed, and stays clear of it because ratings are an import filter only. No surface shows a Marmiton
score.

⚠️ **Rights.** The text is rewritten by `generateRecipe`, and ingredient lists are facts.
Photos are generated, never downloaded. What is left is each site's terms on automated access.
That is your call, not this plan's. The script throttles to one page at a time with a delay, and
keeps to what each robots.txt allows: Marmiton's search without pagination (`aqt=*page*` is
disallowed), BBC Good Food's sitemap and recipe pages but never its search (`/search*`).

---

## 2. Architecture

**Tables** — none new. `recipes.by_user_and_source_url` already exists, and nothing reads it yet.
With `userId` absent, it answers "does the catalog already hold this page?". That is the
server-side half of the dedupe.

**Operations**

```
router/recipes/suggestDishes.ts    _internal  internalAction  → dish names for one cuisine, avoiding a list
router/recipes/importOne.ts        _internal  (changed)       → returns the existing catalog id if the URL is already there
router/recipes/exportCatalog.ts    _internal  internalQuery   → one page of catalog recipes, portable shape
router/recipes/restoreOne.ts       _internal  internalMutation → one portable recipe in, no model call; returns its id
```

`restoreOne` is a mutation because nothing in it calls a model: the script uploads the images
before calling it, and ingredients are matched in the database only (see decision 3).

No public export, so no new rejection test under C5. Every new export is `_internal`.

**Flow — `catalog:import` (one run)**

```
load ledger ─► deployment key from CONVEX_DEPLOY_KEY prefix ("dev:happy-otter-123")
   │
   ├─ pending = accepted URLs with no import on THIS deployment
   │
   ├─ while pending < 20:
   │     cuisine = next in CUISINES (round-robin, cursor stored in the ledger)
   │     names   = suggestDishes._internal({ cuisine, count: 6, avoid })
   │               avoid = this cuisine's searched dish names + the titles already imported for it
   │     for each name: fetch Marmiton search page ─► parse cards {url, title, rating, reviews}
   │                    bestCard ─► "accepted" · other cards clearing the bar ─► "skipped"
   │                    · the rest ─► "rejected"      (one search, one recipe)
   │                    1 s between requests
   │
   ├─ for the first 20 pending, one at a time:
   │     importOne._internal({ url, locale: "fr" })
   │        ok   ─► imports.push({ deployment, recipeId }), status "imported"
   │        fail ─► status "failed", error message; skipped on re-runs
   │     ledger written after EACH recipe (a crash loses nothing)
   │
   └─ exit, printing: imported / failed / accepted-but-pending / rejected
```

Images and translation are unchanged. `createOne` schedules both. The batch of 20 is the spend cap.

**Flow — export / restore**

```
catalog:export   exportCatalog._internal (paginated) ─► download each image URL
                 ─► catalog-<deployment>-<date>.zip = recipes.json + images/<n>-{cover,plate,plate-base}.<ext>

catalog:restore  for each recipe in the zip:
                   skip if ledger/imports already has THIS deployment, or the catalog holds its sourceUrl
                   uploadMany._internal (base64) for cover, plate base, then plate cut-out { object: base }
                   restoreOne._internal({ recipe, images }) ─► ledger records the new id
```

The two duplicate guards are independent. The ledger is the first: it avoids an upload and a call.
The catalog's `sourceUrl` (`by_user_and_source_url`, `userId` absent) is the second, checked by
`importOne._internal` and `restoreOne._internal` on the server, so a lost ledger still cannot
duplicate a recipe.

**Cascade** — none. No new `v.id()` field.

---

## 3. Program design

**Files created or changed:**

```
convex/agent/config/prompts/suggestDishes.ts   the prompt: French dish names as a Marmiton cook would title them
convex/agent/tools/suggestDishes.ts            createTool, zod output { dishes: { name, diet? }[] }
convex/router/recipes/suggestDishes.ts         _internal
convex/router/recipes/importOne.ts             _internal short-circuits on an existing catalog sourceUrl
convex/functions/recipes/findCatalogBySource.ts (ctx, { sourceUrl }) => Id<"recipes"> | null
convex/functions/recipes/exportCatalog.ts      (ctx, { cursor, numItems }) => { page: PortableRecipe[], continueCursor, isDone }
convex/functions/recipes/restoreRecipe.ts      (ctx, { recipe, links, images }) => Id<"recipes">   ← writes `search` (ADR 0011)
convex/router/recipes/exportCatalog.ts         _internal
convex/router/recipes/restoreOne.ts            _internal (internalMutation)
convex/schema/recipePayloads.ts                vPortableRecipe

scripts/recipes/import-catalog.ts              the Marmiton run   → script `catalog:import`
scripts/recipes/export-catalog.ts              → script `catalog:export`
scripts/recipes/restore-catalog.ts             → script `catalog:restore <zip>`
scripts/recipes/_lib/ledger.ts                 read / write / pendingFor(deployment)
scripts/recipes/_lib/marmiton.ts               parseSearchResults(html), passesBar(card), bestCard(cards, dish)
scripts/recipes/_lib/dishMatch.ts              matchesDish(title, dish): a card or slug names the searched dish
scripts/recipes/_lib/bbcGoodFood.ts            (3b) recipe URLs from the sitemap, rating + diet from a recipe page
scripts/recipes/_lib/convexAdmin.ts            ConvexHttpClient + setAdminAuth, typed for internal refs
scripts/recipes/catalog.ledger.json            the ledger (committed, see decisions)
scripts/recipes/_lib/__tests__/marmiton.test.ts   + fixtures/search-pad-thai.html, search-lasagnes.html
scripts/recipes/_lib/__tests__/ledger.test.ts
scripts/recipes/_lib/__tests__/dishMatch.test.ts
```

**The ledger** is the file you described: URL, ids, status, and the numbers used to filter.

```ts
type Ledger = {
  version: 1;
  cuisineCursor: number;
  /** Every dish name ever searched, so the agent is told to avoid it. */
  dishes: Record<string, { cuisine: Cuisine; diet?: "vegan" | "vegetarian"; searchedAt: string }>;
  /** Keyed by canonical URL; a restored recipe with no sourceUrl is keyed "origin:<deployment>/<id>". */
  recipes: Record<string, {
    dish: string;
    title: string;
    rating: number;        // Marmiton ratingValue, /5
    reviews: number;       // Marmiton reviewCount ("avis" = comments)
    status: "accepted" | "rejected" | "imported" | "failed";
    error?: string;
    /** One entry per deployment — dev and prod ids never overwrite each other. */
    imports: { deployment: string; recipeId: string; at: string }[];
  }>;
};
```

`status` describes the recipe. `imports` describes where it landed. A URL imported on dev is still
pending for prod: `pendingFor` reads `imports`, not `status` alone.

**The bar** — one constant, so it can be raised later and re-applied to the ledger without a fetch:

```ts
export const MARMITON_BAR = { minReviews: 30, minRating: 4.5 } as const;
passesBar(card: { rating: number; reviews: number }): boolean
bestCard(cards: SearchCard[], dish: string): SearchCard | undefined
  // among cards clearing the bar AND naming the dish (matchesDish): most reviews, then rating, then page order
```

**One search, one recipe.** A search page is ranked by relevance and popularity, not quality
(checked on "lasagnes": ratings run 4.8, 4.8, 4.7, 4.6, 4.8… and page 1 alone holds three
bolognese). Taking every passing card would fill a batch with near-copies of one dish. So each
search keeps its `bestCard`. Variations are separate dish names from the agent
("lasagnes au saumon", "lasagnes courgettes chèvre"), each searched on its own. Overlap between
two searches is absorbed by the ledger, which is keyed by URL.

**The seam between script and Convex:**

```ts
suggestDishes._internal({ cuisine: Cuisine, count: number, avoid: string[] })
  → { name: string; diet?: "vegan" | "vegetarian" }[]
```
Each name is a dish or a variation of one, as a Marmiton cook would title it. A variation is a
different main ingredient ("lasagnes au saumon"), never a different effort ("lasagnes express").

The prompt requires at least 1 vegan dish in every 4, and those are dishes that are vegan as
cooked (dal, falafel, ratatouille), **not vegan versions** of other dishes. Marmiton has almost no
reviewed vegan versions: "lasagnes vegan" returns one unrated card, and it contains brie. Vegan
versions come from slice 6. It also asks for a spread of dishes that are
naturally free of gluten, dairy and nuts, and forbids anything in `avoid` or any near-spelling of
it. `avoid` is scoped to the cuisine being asked for. Across 29 cuisines the full list would keep
growing, and a Thai dish name tells the model nothing when it is suggesting Peruvian ones. Real facets are still computed by `deriveRecipeFields` at import. The agent's `diet` is only
an intent recorded in the ledger for the coverage print.

**The portable recipe is the whole row**, plus everything its ids point at, spelled without ids:

```ts
type PortableRecipe = {
  origin: { deployment: string; recipeId: string; creationTime: number };
  /** Every field of the `recipes` row except `_id`, `userId` and the two image ids. */
  row: Omit<Doc<"recipes">, "_id" | "_creationTime" | "userId" | "coverImageId" | "plateImageId">;
  /** Every `recipeIngredients` row, the ingredient spelled out instead of its id. */
  ingredients: {
    position: number; quantity: number; unit: Unit;
    ingredient: { slug?: string; name: Localized; aliases?: Aliases };
  }[];
  /** The `images` rows (dimensions, mime, alt, tags), `url` rewritten to the path inside the zip. */
  images: {
    cover?: PortableImage;
    plate?: PortableImage & { base: PortableImage; x: number; y: number };
  };
};
```

**What the restore does with it.** Everything is written as exported: text in every locale
with its translation status, `tags`, `cuisine`, `timings`, `difficulty`, `equipments`,
`servings` and `sourceUrl`. Three things are recomputed rather than copied, and each for a rule:

- `search`, by `recipeSearchText`. ADR 0011 names it the only writer, and C11 fails any other.
  The ids it is built from are this deployment's, not the exported ones.
- The six facets, by `facetsOf(tags)` from the exported tags (ADR 0015), so a facet can't disagree
  with its tag.
- `shuffleKey`, fresh: it only orders a sample, and it should not match across deployments.

If `deriveRecipeFields` is used, the exported tags go in as `recipe.tags` and the result is
deduplicated. It returns `[...recipe.tags, ...computed]`, so otherwise a computed tag would be
stored twice.

**Tests**

```
scripts/recipes/_lib/__tests__/marmiton.test.ts   fixture page parses N cards with url/rating/reviews · a card with
                                             no rating is rejected, not crashed · passesBar edges (4.5/30 pass, 4.49 / 29 fail) ·
                                             bestCard keeps the most reviewed passing card of the lasagna page
scripts/recipes/_lib/__tests__/ledger.test.ts     pendingFor ignores imports on another deployment · failed and skipped are
                                             never pending · a dev import does not mark prod done
convex/router/recipes/__tests__/importOne.test.ts   (extended) an existing catalog sourceUrl returns its id without fetching
convex/functions/recipes/__tests__/exportCatalog.test.ts   owned recipes excluded · every locale exported · ingredient slug carried
convex/functions/recipes/__tests__/restoreRecipe.test.ts  round-trip: export ─► restore gives equal text, tags, facets, search ·
                                             slug match · alias match · unmatched line dropped and counted ·
                                             an existing catalog sourceUrl returns its id without inserting ·
                                             computed tags are not stored twice
```

**Decisions I am least confident about**

1. **The ledger is committed.** The server-side `sourceUrl` check already prevents duplicates. The
   ledger saves the work of getting that far, and it is the only record of failures and rejects.
   Committing it keeps that record when you work from another machine.
2. **How the scripts talk to Convex: a deploy key.** The scripts need to call `_internal`
   functions from your machine. Convex allows that in two ways. `npx convex run` is the
   documented one, but it takes arguments on the command line, where Windows allows about 32,000
   characters, and one photo in base64 is several hundred thousand. So the scripts use the Convex
   HTTP client with a deploy key from the dashboard, stored in `.env.local` as `CONVEX_DEPLOY_KEY`.
   A key starts with `dev:<name>|` or `prod:<name>|`, so the scripts also read from it which
   deployment each ledger entry belongs to. The HTTP client's method for this, `setAdminAuth`,
   works but is left out of Convex's type declarations, so one file casts to it, with a comment
   explaining why.
3. **Ingredients are matched without a model.** Because `restoreOne` is a mutation, it matches each
   exported ingredient first by `slug`, then by its exported names and aliases against the
   catalog. A line that matches nothing is dropped from `recipeIngredients`. `saveRecipe` already
   does that for lines it can't resolve, and the name is still in the instructions. The script
   counts dropped lines per recipe, so a bad restore is visible. The alternative is an action
   that calls the model resolver for the rest, which brings back the `_internal_persist` split.
4. **`tsx` and `fflate` are both dev dependencies.** They only run on your machine, and neither
   goes into the app bundle or a Convex deploy.

---

## 4. Slices

```
1. _lib/marmiton.ts + ledger.ts + their tests, run against a saved fixture    → the filter is provable offline
2. suggestDishes (prompt, tool, router)                                         → `npx convex run` returns names
3.  import-catalog.ts end to end + importOne short-circuit                    → one real batch of 20 on dev
3b. BBC Good Food as second source (see below)                                  → a dish Marmiton lacks lands from BBC
4.  exportCatalog + export-catalog.ts                                           → a zip you can open
5.  restoreOne + restore-catalog.ts + round-trip test                           → dev zip lands on a second deployment
6.  vegan adaptation, fallback only (NOT AGREED, see below)                     → a dish with no reviewed vegan version gets one
```

### Slice 3b — BBC Good Food, second source

Marmiton is French-audience: in a 70-dish survey at 30 reviews, German, Ethiopian, Brazilian,
Korean and Indonesian dishes found nothing, and Thai, Japanese and Peruvian were thin. BBC Good
Food's sitemap has bibimbap, bulgogi, spätzle, feijoada, nasi goreng, rendang, jollof. It also has
real vegan versions ("vegan shepherd's pie"), rated by cooks.

**Access, per its robots.txt:** `/search*` is disallowed for every user agent, so the script
never uses the site's search. Recipe pages and the sitemap are allowed.

```
once per run    sitemap.xml ─► the *-recipe.xml sitemaps (75 today) ─► recipe URLs, /premium/ dropped
                (cached on disk for the run; about 18,600 URLs)
per dish        candidates = URLs whose slug matchesDish(slug, englishName)   ← offline, no request
                fetch each candidate page (1 s apart) ─► rating, count, diet
                keep the most rated one that clears BBC_BAR, as for Marmiton
```

```ts
export const BBC_BAR = { minReviews: 5, minRating: 4.2 } as const;
```

- **Order:** Marmiton first. BBC Good Food is searched for a dish only when Marmiton returns no
  `bestCard` for it, and for the vegan version of a dish (`vegan-<dish>` slugs).
- **Rating:** not in the page's schema.org `aggregateRating`. It sits in the page's embedded state
  (`ratingValue`, `reviewCount`) next to the ratings of related recipes, so the parser has to pick
  the main recipe's entry. Needs a saved recipe page as a fixture.
- **Diet:** schema.org `suitableForDiet` (`https://schema.org/VeganDiet`), read as the
  ledger's `diet`. The real facets are still computed at import.
- **English names:** `suggestDishes` returns a French name for Marmiton and an English one for
  slug matching (`{ name, nameEn, diet? }`).
- **Import:** `importOne._internal({ url, locale: "en" })`. The text is rewritten and translated
  as for any import.
- **Ledger:** each recipe entry gains `source: "marmiton" | "bbcgoodfood"`. It is written before
  the first real run, so no migration.

### Slice 6 — vegan adaptation, fallback only (proposal, to agree before building)

Only when neither source has a vegan version clearing its bar (3b is checked first), and the
dish's imported best recipe is not vegan by its computed facets: a model rewrites it as a vegan
version of the same dish, saved as a **new** catalog recipe.

```
router/recipes/adaptOne.ts   _internal  internalAction  → ({ recipeId, diet: "vegan" }) → new recipe id
```

The rewrite runs through the existing `generateRecipe` path with the original's text and a
"make this vegan, keep the dish" instruction. Ingredient resolution, facets, images and
translation then work as for any import. The script calls it after a successful import and
records it in the ledger next to the original.

**Open questions**

1. **Which dishes.** Every imported recipe that is not vegan (+1 model call and 1 image set each,
   roughly doubling spend), or only dishes the agent marks as adaptable (lasagna yes, boeuf
   bourguignon no)?
2. **How the copy points at its original.** It can't reuse `sourceUrl`: `importOne` and
   `restoreOne` would see the original's URL and return the original's id. Options are an
   `adaptedFrom: v.id("recipes")` field (a new FK, so a cascade index and a `CASCADE` entry per
   ADR 0007, plus an export/restore spelling), or no link at all.
3. **Deleting the original.** If there is a link, does deleting the original delete the adaptation?
4. **What the cook sees.** Is an adaptation shown as one, or as any other catalog recipe? No
   reviews stand behind it.

---

## Landing

- [ ] `pnpm verify` green
- [ ] Reviewer subagent clean, or its findings approved
- [ ] `MARMITON_BAR` and the ledger contract written into a README next to the scripts, in scripts/recipes (not an ADR:
      no Verify can check a third-party site)
- [ ] **This file deleted** — the slice is not done while it exists
