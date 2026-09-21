# Catalog scripts

The shared catalog (recipes with no `userId`) is filled and moved by three scripts. Each runs on
your machine and calls `_internal` Convex functions through a deploy key.

| Command                         | What it does                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm catalog:import`           | Asks the agent for dishes, finds a well-reviewed page for each, imports 20    |
| `pnpm catalog:export [dir]`     | The deployment's catalog as `catalog-<deployment>-<date>.zip`; writes nothing |
| `pnpm catalog:restore <zip>`    | An export into this deployment's catalog                                      |

## Setup

`.env.catalog` (gitignored) holds `CONVEX_DEPLOY_KEY`, from the dashboard under Settings → Deploy
keys. The key needs the internal query, mutation and action scopes. Its prefix (`dev:<name>|`,
`prod:<name>|`) names the deployment every call lands on, and the ledger records it. Add
`CONVEX_URL` when the key is not for `EXPO_PUBLIC_CONVEX_URL`'s deployment.

The key goes through the HTTP client rather than `npx convex run`: a photo in base64 is far
beyond the ~32,000 characters Windows allows on a command line.

## The bar

A recipe is imported only when its source rates it well enough, and only the best such page of
each search:

```ts
MARMITON_BAR = { minReviews: 30, minRating: 4.5 }   // _lib/marmiton.ts
BBC_BAR      = { minReviews: 5,  minRating: 4.2 }   // _lib/bbcGoodFood.ts
```

Both thresholds are inclusive. Of the pages that clear the bar and name the dish (`matchesDish`),
the one with the most reviews wins, then the best rating, then page order. One search contributes
one recipe: a search page is ranked by popularity, not quality, and taking every passing card
fills a batch with near-copies of one dish. Variations are separate dish names, searched on their
own.

The rating is an import filter only. No screen shows a score (`docs/PRODUCT.md`).

Marmiton is searched first. BBC Good Food is looked up for a dish Marmiton has no reviewed page
of, and for the vegan version of a dish. Access keeps to each robots.txt: Marmiton's search
without pagination (`aqt=*page*` is disallowed), BBC Good Food's sitemap and recipe pages but
never its search (`/search*`). One request a second.

## The ledger

`catalog.ledger.json` is committed. It is the only record of what was rejected and what failed,
and that record should survive a change of machine. Its schema is `_lib/ledger.ts`, validated on
every read, so a hand edit that breaks it fails before a run spends anything.

- **Keyed by canonical URL**, the spelling the server stores as `sourceUrl`.
- **`status` describes the recipe, `imports` where it landed.** One `imports` entry per
  deployment, so a dev import leaves the recipe pending for prod (`pendingFor` reads `imports`).
- **Statuses.** `accepted` cleared the bar and was its search's best page. `skipped` cleared it
  but was not the best. `rejected` failed it. `imported` and `failed` record the attempt
  (`error` says why, and a failed recipe is not retried). `rejected` and `skipped` stay apart so
  a change to the bar can be re-applied without fetching a page again.
- **`excluded` is written by hand.** It is a verdict on the dish ("not a plate", with a
  `reason`), and holds on every deployment: neither the import nor the restore ever brings it in.
- **`dishes`** holds every dish name searched, so the agent is told to avoid it; `cuisineCursor`
  is where the round-robin over cuisines resumes.
- **Written after every search and every recipe,** through a temporary file and a rename, so an
  interruption loses nothing.

The ledger is the cheap duplicate guard: it saves a search, an upload and a model call. The
second guard is on the server: `importOne` and `restoreOne` both return the existing id when the
catalog already holds the `sourceUrl`. A lost ledger wastes work, and never duplicates a recipe.

## Export and restore

The zip holds a `catalog.json` manifest and one folder per recipe: `recipe.json` (the portable
shape, `vPortableRecipe`) and its photos (`cover`, `plate`, `plate-base`). The layout is
`_lib/archive.ts`.

A restore writes the text, tags and timings as exported, and recomputes `search`, the facets and
the shuffle key. Its ingredient lines go through the same resolver a created recipe's do, so a
food this catalog lacks may cost a model call; a line the resolver refuses is dropped and
printed. A walk that could not finish (an API down, a model timeout) fails the recipe instead of
saving it short, and a re-run retries it. A photo that fails to download at export, or to upload at restore, is left out, and the
server regenerates the recipe's photos. A recipe that fails is reported and the run goes on; a
re-run retries it.

The restore records an import in the ledger only for a URL the ledger already holds. A recipe
exported with no `sourceUrl` has no duplicate guard, and the script says so.
