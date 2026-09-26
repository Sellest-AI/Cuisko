# Ingredient scripts

The ingredient catalog, images included, moved between deployments. Both run on your machine and
call `_internal` Convex functions through the deploy key in `.env.catalog`; setup is the one in
[`scripts/database/recipes/README.md`](../recipes/README.md#setup).

| Command                          | What it does                                                          |
| -------------------------------- | --------------------------------------------------------------------- |
| `pnpm ingredients:export [dir]`  | Every ingredient as `ingredients-<deployment>-<date>.zip`; writes nothing |
| `pnpm ingredients:restore <zip>` | An export into this deployment; calls no model                        |

## The zip

`ingredients.json` is the manifest. Each ingredient has a folder, named for its slug (else its
French name): `ingredient.json` (the portable shape, `vPortableIngredient`), and its image as the
pair it was generated as, `image.png` (the cut-out) and `image-base.webp` (the render it was cut
from). The layout is `_lib/archive.ts`.

## What a restore does

Each ingredient is matched by slug, else by exact name or alias:

- **No match**: the row is created as exported, with its image. `search` and the Nutri-Score are
  recomputed. A row missing a fact every writer sets today (a diet, the allergens, a Nutri-Score
  input) is refused and reported rather than guessed.
- **A match with no image**: it gets the exported image. Nothing else on it changes.
- **A match with an image**: nothing happens, and nothing is uploaded.

So seeding a fresh deployment and then restoring fills in every image without generating one, and
a second restore changes nothing. An image that fails to download or upload leaves its ingredient
without one; nothing regenerates it.

**Restore the ingredients before the recipes.** `catalog:restore` resolves each recipe line by
name, and a food the catalog lacks costs a model call to create. Restored first, the ingredients
are found by name.
