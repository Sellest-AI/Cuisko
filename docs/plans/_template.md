---
slice: <short-kebab-name>
branch: <type>/<summary>
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# <Slice name>

One sentence: what the user can do after this lands that they cannot do today.

---

## 1. Problem

**What is broken or missing.** Two or three sentences, from the user's side, not the code's.

**How we would know it worked.** A number where one is possible, an observable behaviour where it
is not. "The list is shorter than the plan" is a check; "it feels better" is not.

**Product fit.** Which of [PRODUCT.md](../PRODUCT.md)'s four tests it passes, and any anti-goal it
comes close to.

---

## 2. Architecture

**Tables** — new or changed, with their indexes and the query each index answers.

**Operations** — the router surface, one line each. Access level included, because the export name
*is* the access level.

```
router/recipes/getOne.ts    authed   ownedQuery('recipes')   → one recipe the caller owns
router/recipes/list.ts      authed   authQuery               → the caller's recipes, paginated
```

**Flow** — the path a request takes, only where it is not the standard one in
[ARCHITECTURE.md](../ARCHITECTURE.md). Anything asynchronous, anything hitting a third party, and
anything that fans out belongs here.

**Cascade** — every new foreign key, its index, and its entry in the cascade map. If there are none,
say "none": an empty statement is a decision, a missing one is an oversight.

---

## 3. Program design

**The section that pays.** Files, call stack and signatures — no implementation. This is the
interface contract between whoever builds the backend and whoever builds the screen, so it is
agreed here or it is discovered during wiring.

**Files created or changed:**

```
convex/schema/recipes.ts              recipes table + by_user, by_user_and_public
convex/functions/recipes/getOne.ts    (ctx, { recipeId }) => Recipe | null
convex/router/recipes/getOne.ts       export const authed
src/modules/recipes/_hooks/useRecipes.ts
app/(tabs)/recipes.tsx
```

**Signatures** — the seam, in full. Everything the other half of the work writes against:

```ts
useRecipe(id?: Id<"recipes"> | null): {
  recipe: Recipe | undefined;
  isLoading: boolean;
  isSaving: boolean;
  update(data: Omit<UpdateArgs, "id">): void;
}
```

**UI props** — structural, never a document type. What the module layer adapts *to*:

```ts
type RecipeCardProps = { title: string; minutes: number; imageUrl?: string };
```

**Tests** — the list, before they are written. Every gated export needs its rejection test anyway
(C5 fails the commit otherwise), so name it here rather than discovering it at commit time.

```
getOne.test.ts    anon rejected · another user's id rejected · owner receives the row
```

**Decisions I am least confident about** — the choices a diff hides. Name two or three: a shape that
could reasonably have gone another way, a place the convention did not clearly decide, a thing
deferred. This is the cheapest review in the whole process.

---

## 4. Slices

Thin end to end first, then depth. Each step is something that can be looked at, run, or wired
against — a step that produces nothing observable belongs merged into its neighbour.

```
1. useRecipes.ts returns hardcoded, fully typed data     → the screen can be built immediately
2. schema + getOne + its rejection test                  → one real operation, callable
3. hook internals swap to the real query                 → the screen changes nothing
4. list + pagination
5. mutations, then error and empty states
```

Where the work is split, mark who takes each step. Step 1 exists so that neither half waits on the
other.

---

## Landing

- [ ] `pnpm verify` green
- [ ] Reviewer subagent clean, or its findings approved
- [ ] Decisions worth keeping promoted to an ADR or to [CONVENTIONS.md](../CONVENTIONS.md)
- [ ] **This file deleted** — the slice is not done while it exists
