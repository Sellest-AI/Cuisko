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

**Out of scope.** What this slice deliberately does not do, and where it goes instead — a later
slice, a `@limitation`, nowhere. The reviewer reads a silence as an omission, and so will whoever
builds it.

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

**Existing data** — the rows already in dev and prod. A new field on old rows (optional, or
backfilled, and by what), an index over data that predates it, archived rows the new read must not
return. And what an installed app does when the server deploys first: a changed argument or return
shape reaches phones that have not updated. "None" is an answer here too.

**Cost and limits** — every paid call (a model, storage), its rate limit and its trace, and any
Convex limit the slice comes near: action duration, document size, array length, reads per query.

---

## 3. Program design

**The section that pays.** Files, call stack and signatures — no implementation. This is the
interface contract between whoever builds the backend and whoever builds the screen, so it is
agreed here or it is discovered during wiring.

**Reuses** — what already exists that this calls or extends, found by searching first
([CONVENTIONS.md](../CONVENTIONS.md) says where it would live). A helper this slice writes a second
copy of is cheaper to spot here than in review.

**Files created or changed:**

```
convex/schema/recipes.ts              recipes table + by_user, by_user_and_public
convex/functions/recipes/getOne.ts    (ctx, { recipeId }) => Recipe | null
convex/router/recipes/getOne.ts       export const authed
src/modules/recipes/_hooks/useRecipes.ts
app/(tabs)/recipes.tsx
```

Name a file that does not exist yet inside a code block like this one, not in single backticks:
C6 checks every backticked path in `docs/` against the disk, this plan included.

**Signatures** — the seam, in full. Everything the other half of the work writes against. The hook
returns every state the screen renders — loading, saving, empty, failed — or the screen half cannot
be built from this section alone:

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
(C5 fails the commit otherwise), so name it here rather than discovering it at commit time. Every
row of §4 that the server decides gets its test here.

```
getOne.test.ts    anon rejected · another user's id rejected · owner receives the row
```

**Decisions I am least confident about** — the choices a diff hides. Name two or three: a shape that
could reasonably have gone another way, a place the convention did not clearly decide, a thing
deferred. This is the cheapest review in the whole process, and the reviewer tests these first.

---

## 4. What can go wrong

One row per case the build would otherwise decide by accident. Go through each prompt and write a
row, or a line saying why it cannot happen here:

- every external call fails, times out, or answers with something malformed
- the app is backgrounded or killed, the connection drops, the screen loses focus mid-flow
- the same action arrives twice: a double tap, a retry, a share Android replays from Recents
- two members of the household, or two devices, act on the same rows at once
- the household switches mid-flow
- a write here changes food the cellar, the plan or the grocery list also counts
- the list is empty, or very long; a date falls past the plan's end
- iOS, Android and web behave differently

| Case | What the server does | What the cook sees | Pinned by |
| --- | --- | --- | --- |
| The model times out | nothing written, the rate-limit token stays spent | "That took too long", Retry | `createOne.test.ts` |
| The cook taps Save twice | the second call finds the first row by its key | one recipe | `createOne.test.ts` |

---

## 5. Slices

Thin end to end first, then depth. Each step is something that can be looked at, run, or wired
against — a step that produces nothing observable belongs merged into its neighbour.

- [ ] 1. `useRecipes.ts` returns hardcoded, fully typed data → the screen can be built immediately
- [ ] 2. schema + `getOne` + its rejection test → one real operation, callable
- [ ] 3. hook internals swap to the real query → the screen changes nothing
- [ ] 4. list + pagination
- [ ] 5. mutations, then error and empty states

Where the work is split, mark who takes each step. Step 1 exists so that neither half waits on the
other.

**This list is the build's progress, kept in the file.** Tick a step the moment it lands with
`pnpm verify` green — not in a batch at the end. A step found mid-build is added here before it is
built, never done silently. A long run gets summarised and loses its scrollback; this file does not,
so where the build stands is read here.

---

## Open questions

What neither the author nor the reviewer could settle from the code, the docs or
[PRODUCT.md](../PRODUCT.md). They wait here until the review loop ends, then reach the user in one
batch ([README.md](./README.md#the-review-loop)). An answered question leaves this list and becomes
a decision in the section it changes.

```
Q1 (review 1.4) A swap that frees an ingredient: back to the cellar, or kept on the grocery list?
   A — back to the cellar: the list stays honest (recommended)
   B — kept listed: one write fewer, the cook may buy what they no longer need
```

---

## Review log

One line per round, and one per finding the author declined, with the reason. A fixed finding needs
no entry: the plan text is the fix. The reviewer reads this before each round and does not raise a
declined finding again unless the reason is wrong.

```
round 1   REVISE   6 findings: 4 fixed, 1 declined, 1 question (Q1)
  1.5 declined — a cook with two devices offline at once is out of scope (§1), not a gap
round 2   READY
```

---

## Landing

- [ ] Plan review loop ended READY, and the user agreed the plan
- [ ] `pnpm verify` green
- [ ] `architecture-reviewer` clean, or its findings approved
- [ ] Decisions worth keeping promoted to an ADR or to [CONVENTIONS.md](../CONVENTIONS.md)
- [ ] **This file deleted** — the slice is not done while it exists
