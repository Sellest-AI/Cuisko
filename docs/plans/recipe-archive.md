---
slice: recipe-archive
branch: feat/recipes-archive
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# A recipe has a review status, and deleting one archives it

A cook can delete one of their own recipes from the bottom of its editor. It stops showing in their
list, in search and in planning, but any meal already cooked or planned with it still opens it. Every
recipe also records whether a human has checked what the model wrote.

---

## 1. Problem

**What is broken or missing.** A cook has no way to get rid of a recipe they wrote, and a hard delete
would cascade into `plannedMeals` and erase what they cooked. Separately, nothing tells a recipe the
model wrote and nobody checked from one a person has been through.

**How we would know it worked.** After deleting: the recipe is gone from `/recipes`, the search box,
the favorites shelf, the assistant's search and any new week's draft, and a past planned meal still
opens `/recipe/[id]`. After saving an edit: the row reads `status: "reviewed"`.

**Product fit.** Closes the loop on the cook's own library. No anti-goal nearby.

---

## 2. Architecture

**Tables** — `recipes` gains two required columns:

```
status:     v.union(v.literal("generated"), v.literal("reviewed"))
isArchived: v.boolean()
```

Two fields, not one three-value status: a Convex index matches equality on a prefix plus one range,
so "generated OR reviewed" is not one read. `isArchived` makes every list read a single
`eq("isArchived", false)`, and archiving a reviewed recipe keeps its review. No `archivedAt`:
nothing needs to know when a recipe was archived.

| Index                                       | Change                                        | Query it answers                    |
| ------------------------------------------- | --------------------------------------------- | ----------------------------------- |
| `by_user_and_is_archived`                   | new                                           | `listForUser`: the cook's live rows |
| `by_user_and_is_archived_and_shuffle_key`   | **replaces** `by_user_id_and_shuffle_key`     | `candidatePool._window`             |
| `by_status`                                 | new, unread yet                               | "which recipes still need a review" |
| `search_en/fr`, `search_title_en/fr`        | `isArchived` added to `FACET_FIELDS` (10/16)  | `searchForUser` narrows in-scan     |
| `by_user`                                   | kept: cascade and `exportCatalog` read it     | —                                   |

**Writers**

```
functions/recipes/insertRecipe.ts    isArchived: false always; status from the facts, "generated" by default
functions/recipes/updateRecipe.ts    status: "reviewed" on every saved edit
functions/recipes/archiveRecipe.ts   isArchived: true, updatedAt
```

A restored catalog recipe keeps the status it was exported with: the portable row copies every
table column, so a reviewed recipe does not come back unreviewed.

**Operations**

```
router/recipes/archiveOne.ts   authed   ownedMutation('recipes')   → sets isArchived; idempotent
```

`deleteOne._internal` (hard delete of a catalog recipe, run from the dashboard) is untouched.

**Reads that change** — every list surface funnels through four functions:

```
functions/recipes/listForUser.ts      new index, eq isArchived false
functions/recipes/searchForUser.ts    _narrow always adds eq("isArchived", false)
functions/recipes/listFavorites.ts    drops archived rows after the get (not paginated, ≤ 50)
functions/planning/candidatePool.ts   new index, eq isArchived false before the shuffle range
```

`weekIdeas`, `planDraft` and the assistant's `searchRecipes` read through these. `getOne` / `getMany`
do not change: that is what keeps a cooked meal's recipe readable.

**Flow — the deploy is two-phase.** Convex refuses a schema that existing rows violate, and
`eq("isArchived", false)` does not match a row where the field is absent. So:

1. **Widen:** both fields optional, every writer sets them, `backfillRecipeStatus` migration
   (`generated` + `false` on every row missing them). Reads unchanged.
2. Deploy phase 1, run `runBackfillRecipeStatus` on **dev and prod**.
3. **Narrow:** both fields required, reads switch, archive + UI.

Phase 3 must not reach a deployment before step 2 has run there.

**Cascade** — no new foreign key. None.

---

## 3. Program design

**Files created or changed:**

```
convex/schema/recipes.ts                          fields + indexes above
convex/migrations.ts                              backfillRecipeStatus + runner
convex/functions/recipes/insertRecipe.ts
convex/functions/recipes/updateRecipe.ts
convex/functions/recipes/archiveRecipe.ts         (ctx, { recipeId }) => Promise<void>
convex/router/recipes/archiveOne.ts               export const authed
convex/functions/recipes/listForUser.ts · searchForUser.ts · listFavorites.ts
convex/functions/planning/candidatePool.ts
convex/router/recipes/getOne.ts                   ships isArchived, so the editor can hide Delete
src/modules/recipes/_hooks/useArchiveRecipe.ts
src/modules/recipes/editor-screen/delete.tsx      the two-tap button at the end of the page
src/modules/recipes/editor-screen/index.tsx       renders it in edit mode, live recipe only
translations (en, fr)
~55 test fixtures inserting a recipe              gain status + isArchived (phase 3)
```

**Signatures**

```ts
// convex/router/recipes/archiveOne.ts
authed: ownedMutation("recipes")({ args: {} }) → null     // id arg comes from ownedInput

// src/modules/recipes/_hooks/useArchiveRecipe.ts
useArchiveRecipe(): {
  archive(recipeId: Id<"recipes">): Promise<void>;   // on success: back to /recipes
  isArchiving: boolean;
  error: unknown;
}
```

**UI props**

```ts
type EditorDeleteProps = { onDelete: () => void; disabled?: boolean; style?: ViewStyle };
```

**Tests**

```
__tests__/migrations.test.ts                  row without the fields → generated + false; set row untouched
functions/recipes/__tests__/updateRecipe      an edit marks the row reviewed
router/recipes/__tests__/archiveOne.test.ts   anon rejected · another cook's recipe rejected ·
                                              owner's row archived · second call is a no-op
functions/recipes/__tests__/searchForUser     archived row absent
router/recipes/__tests__/getAll · getFavorites archived row absent
functions/planning/__tests__/candidatePool    archived own recipe never drawn
router/recipes/__tests__/getOne               archived recipe still readable
```

**Decisions I am least confident about**

1. **Two-tap delete.** No confirm dialog in `@ui`, and `Alert.alert` does nothing on web. The first
   tap turns the button into "Tap again to delete" for 4 s; the second archives.
2. **Favorites are filtered, not removed.** The shelf may show fewer than 50; removing the rows would
   lose another cook's favorite of a recipe that is only archived.
3. **Editing an archived recipe is not refused**, and saving it marks it reviewed. Delete is hidden
   on an archived recipe.

---

## 4. Slices

- [x] 1. **Widen:** optional fields, writers, migration + its test
- [ ] 2. **Checkpoint (user):** deploy phase 1, run `runBackfillRecipeStatus` on dev and prod
- [ ] 3. **Narrow:** required fields, indexes, fixtures, `archiveRecipe` + `archiveOne` + rejection test
- [ ] 4. the four readers skip archived rows, each with its test; `getOne` test pins readability
- [ ] 5. `useArchiveRecipe` + `EditorDelete` at the end of the editor, translations

---

## Landing

- [ ] `pnpm verify` green
- [ ] Reviewer subagent clean, or its findings approved
- [ ] Decisions worth keeping promoted to an ADR or to [CONVENTIONS.md](../CONVENTIONS.md)
- [ ] **This file deleted** — the slice is not done while it exists
