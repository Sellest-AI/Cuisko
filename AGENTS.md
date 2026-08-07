# Agent Instructions

<!--
  MAINTENANCE: every line here must be a command, a boundary, a non-obvious pattern,
  or a pointer. No directory trees, no architecture prose — those live in docs/ and
  are read on demand. Budget is 300 lines — a ceiling, not a target: this file is
  loaded on every request, so an unnecessary line is paid for on every one. Past 300,
  extract to docs/ rather than trimming what earns its place.
  Nested files live at convex/AGENTS.md and src/ui/AGENTS.md — agents read the
  NEAREST one, so state a rule in the folder it governs rather than adding it here.
-->

**Cuisko** — An agent that plans a week of meals from the food you already own, and lists only what is missing.
Expo (React Native) + Convex. TypeScript throughout. iOS / Android / Web.

## Commands

```bash
pnpm verify        # typecheck + lint + C1–C7 + test — the pre-commit hook runs this and
                   # refuses the commit if it fails. `--no-verify` bypasses it; CI does not.
pnpm convex:dev    # MUST be running before `pnpm start`
pnpm start         # Expo dev server
pnpm test -- <file>  # single test file
```

## Before writing code

- `docs/PRODUCT.md` — what the app is for, who it serves, what it refuses to be. Read it when a
  choice affects what the user sees or is worded for them.
- `docs/CONVENTIONS.md` — naming, file placement, the "where does this go?" decision tree.
- `docs/adr/` — decisions that constrain code. Each declares `applies_to` globs; read the ones
  matching the files you are touching.
- `docs/ARCHITECTURE.md` — layer contracts and data flow. Read when the task crosses layers.

Prefer reading the code over the docs when they disagree. **The code is the source of truth** — if
you find a doc that contradicts it, say so and offer to fix the doc.

Before adding a helper, hook or component, search for one that already exists —
`docs/CONVENTIONS.md` says where it would live. If it does, call it. If you are about to write the
second copy of the same logic, propose extracting it — never paste it, never refactor the first
copy silently.

## Never

| Rule                                                                                | ADR  |
| ----------------------------------------------------------------------------------- | ---- |
| Never import `convex/_generated/server` outside `convex/procedures.ts`              | 0001 |
| Never import `convex/_generated/api` **inside** `convex/procedures.ts` (type cycle) | 0001 |
| Never import Convex, `~/modules/*` or `translations` from `src/ui/**`               | 0002 |
| Never call `useQuery` / `useMutation` in `app/**` — screens call a module hook      | 0006 |
| Never define a webhook with bare `httpAction` — use `verifiedWebhook`               | 0004 |
| Never default a secret to `''` — env is Zod-validated and throws at boot            | 0005 |
| Never gate a security check on its secret being truthy (`if (secret) verify()`)     | 0005 |
| Never combine `.filter()` with `.paginate()` — put the predicate in the index       | 0007 |
| Never `ctx.db.query()` without `.withIndex()` / `.withSearchIndex()`                | 0007 |
| Never import `isAuthorized` in `router/` — use `ownedQuery` / `ownedMutation`       | 0003 |
| Never add a `v.id()` field without its cascade index **and** `CASCADE` entry        | 0007 |
| Never write an empty `catch {}`                                                     | —    |
| Never commit secrets, force-push, or `git commit` unless asked                      | —    |
| Never add a `Co-Authored-By` or any AI-attribution trailer to a commit              | —    |

## Non-obvious patterns

**Router files bind an access level to a shared handler.** The export *name* must match the builder —
`admin` requires `adminQuery`, never `authQuery`. A mismatch is a silent authorization hole.

```ts
const handler = async (ctx: QueryCtx, args: Args) => { /* the actual work */ }

export const authed = authQuery({ args, handler: (ctx, a) => handler(ctx, { ...a, userId: ctx.userId }) })
export const admin  = adminQuery({ args: { ...args, userId: v.id("users") }, handler })
```

Legal export names, and nothing else: `anon` · `authed` · `admin` · `server` · `_internal` ·
`_internal_<verb>`. Multi-step internals are separate top-level exports named by verb, never by
number (`_internal_persist`, not `_internal_step2`) — Convex only registers top-level exports, so
they cannot be grouped in an object.

**Mutations taking a document id use `ownedMutation('<table>')`.** It loads the row and asserts
ownership before your handler runs; the document arrives as `ctx.doc`. Never re-implement the check.

**Screens never fetch.** Data access lives in `src/modules/{domain}/_hooks/use{Domain}.ts`, which
owns that domain's queries, mutations and module-scoped Jotai state.

## Before committing — full review (REQUIRED)

Run this **every time**, before staging, on every changed file. Do not skip it because a change looks
small — most defects this catches are one-line changes.

**Step 1 — automated.** `pnpm verify` (typecheck + lint R1–R7 + the C1–C7 scripts + tests).

**Step 2 — get the changed set.** `git diff --name-only` plus untracked files.

**Step 3 — read each changed file against every table below.** `pnpm verify` does not catch most of
this; you must actually read the diff.

### Naming

| Check                           | Rule                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------ |
| File name — `convex/**`         | camelCase (`getOne.ts`)                                                        |
| File name — components, screens | kebab-case (`recipe-card.tsx`, `saved-recipes.tsx`)                            |
| File name — hooks, anywhere     | camelCase **matching the export** (`useRecipes.ts` → `useRecipes`)             |
| File name — sub-components      | dot notation (`recipe-form.ingredients.tsx`)                                   |
| Component reaching 3 files      | folder + `index` — `select/index.tsx`, `index.ios.tsx`, `types.ts`            |
| Router file names               | operation-based, not resource-based — `getOne.ts` ✅ / `getRecipe.ts` ❌         |
| Components / types              | `PascalCase`, no `I` prefix                                                    |
| Functions, variables            | `camelCase`; module-private `_camelCase`                                       |
| Constants, const-arrays         | `SCREAMING_SNAKE`                                                              |
| Convex indexes                  | `by_<field>[_and_<field>]`, fields in definition order                         |
| Convex exports                  | only `anon` · `authed` · `admin` · `server` · `_internal` · `_internal_<verb>` |

The table is the floor, not the bar. Read the names themselves too: a name that is legal but says
nothing (`data`, `tmp`, `res`, `handleThing2`) is a finding. Report it — never rename silently.

### Architecture

- Every entry in the **Never** table above.
- Every `docs/adr/` record whose `applies_to` glob matches a changed file.
- Export name matches its builder (`admin` ⇒ `admin*`). **The highest-value check in this list** — a
  mismatch is a silent authorization hole that nothing else detects.
- Router file ≤ 80 lines, and contains no loop, no domain branching, no domain-library import.
- Screen ≤ ~120 lines and calls a module hook rather than fetching.

### Schema (if `convex/schema/**` changed)

- Every query path has an index; no `.filter()` with `.paginate()`.
- Mutable table declares `updatedAt`; no hand-rolled `createdAt` (`_creationTime` exists).
- Polymorphic refs are `v.union` of discriminated objects, not parallel optional FKs.
- New foreign key ships with its cascade index **and** its `CASCADE` entry.
- Join table carries `position` if order is meaningful.

### Hygiene

- No empty `catch {}`, no leftover `console.log`, no commented-out code.
- No `@deprecated` code left shipping; delete it — git remembers.
- No new `any` without a comment justifying it.
- Any `docs/` page this change just made wrong.

**Say what you're doing while you're doing it.** Before a long stretch, say what you're about to do; as each step lands, say what it showed. "A short line per step beats a perfect summary at the end".

**When the review finds anything: STOP. Report to the user and wait.** Do not fix silently, and do
not fold fixes into the same edit. A broken rule is BLOCKING. Something that breaks no rule but is
weaker than it should be — a name that says nothing, a shape that duplicates one already in the
codebase — is NON-BLOCKING: report it, and let the user decide whether it is worth the churn. That
second tier is deliberately open to general code criticism: duplication, a name that says nothing
 — anything you would raise on a colleague's PR. The one bar is that you can point at the line and
 say what it costs. Report in this shape:

```
⚠️ Review found 5 issues in 5 changed files

BLOCKING
1. convex/router/wallets/getOne.ts:48 — export `admin` uses `authQuery`  (ADR 0001 · C1)
   Any signed-in user could read another user's wallet by passing a userId.
   Fix: change the builder to `adminQuery`.

2. src/ui/cards/recipe.tsx:3 — imports `Doc<'recipes'>` from ~/lib/convex/api  (ADR 0002)
   Couples the design system to the schema; breaks UI isolation.
   Fix: replace with a structural prop type.

3. convex/schema/recipes.ts:31 — new FK `recipeId` has no cascade index or CASCADE entry  (ADR 0007)
   Deleting a recipe will orphan these rows, and there is no index to clean them up with.
   Fix: add `.index("by_recipe", ["recipeId"])` + an entry in functions/cascade.ts.

NON-BLOCKING
4. src/modules/recipes/_hooks/use-recipes.ts — hook file should be camelCase  (naming)
   Fix: rename to useRecipes.ts.

5. convex/functions/recipes/loadRecipe.ts:22 — `const data = await ctx.db.get(id)`  (naming, quality)
   Legal, but `data` says nothing at the call site three lines down.
   Fix: rename to `recipe`.

Want me to apply these? I can do 1–3 now and 4–5 separately if you'd rather keep the renames isolated.
```

Rules for the report: list **all** issues before fixing **any**; separate blocking from non-blocking;
cite the rule *and* say what actually breaks — "violates ADR 0002" alone is not actionable. Then
wait for approval.

If a violation is deliberate, ask the user to confirm, and record it: a knowingly-broken rule must
become `status: superseded` in its ADR. **Never leave a rule documented as active that the project
has stopped following** — that single failure is what let 58 files drift in the predecessor project.

## Writing a commit

**First, check the branch: `git branch --show-current`.** The `pre-commit` hook validates the branch
*name* against the type vocabulary; it cannot tell whether the change belongs there. So a commit
landing on the wrong branch fails silently — and stays invisible, because nobody reviewing that PR
expects it. Moving it afterwards costs a cherry-pick, a reset and a rebase.

Ask what the branch exists to do, then:

- The change serves that purpose → commit.
- It does not — a doc, an unrelated fix, a chore no other commit here needs → **stop and ask the
  user**, naming the branch it belongs on. Usually `main`, or a branch of its own.
- Unsure → ask. The question is cheaper than the move.

Supporting work is not a stray: a `chore(deps)` the feature consumes, or a `fix` for something the
branch itself broke, belongs on the branch.

Format is Conventional Commits, enforced by the `commit-msg` hook. Branch names are enforced by
`pre-commit`. Full rules: `docs/CONVENTIONS.md` §10.

```
<type>(<scope>): <imperative subject, ≤72 chars, lowercase, no full stop>

<body: why this change exists, and what changed at the LAYER level>

<footers: BREAKING CHANGE:, Refs: #12>
```

`feat` · `fix` · `refactor` · `perf` · `docs` · `test` · `chore` · `ci` · `revert`.
Branches add `hotfix/`; there is no `hotfix` commit type — urgency is a branch, not a change.

**Write the body for an agent reading `git log` a year from now.** It will have the diff; what it
cannot recover is intent. So the body is the payload, not decoration:

- **The trigger** — what was broken, missing or newly required. Highest-value sentence in the message.
- **What changed by layer**, not by file — "the check moved from `router/` into `procedures.ts`".
- **The governing rule** when one applies (`ADR 0003`, `C4`, `lint R7`), so `git log --grep` finds it.
- **What you deliberately did not do**, if a reader would wonder. Absent scope is invisible in a diff.

Omit the body only when the subject is complete alone (`chore(deps): bump convex to 1.44`).

⚠️ **Never start a body line with `word:`.** The parser reads `Note:`, `Result:`, `enforced:` as a
footer token and treats everything after it as footers — silently wrecking the structure the history
is supposed to be readable by. Rewrite as "enforces it: …", or put the phrase mid-line.

```
fix(convex): reject paginated queries that filter post-index

Convex paginates the index read and applies .filter() to the resulting page, so a page
requested with numItems 24 could return 3 documents while still reporting isDone false —
infinite scroll stopped early and silently hid recipes.

The predicate moves into the index (by_public_and_user), so pagination operates on the
filtered set. Check C3 now fails this shape at commit time, per ADR 0007.

Refs: #48
```

**One logical change per commit** — two things cannot be described in one subject, or reverted cleanly.

**Scope** is the layer or domain, and must stay stable or history stops being greppable: `convex` ·
`ui` · `app` · `auth` · `deps` · `ci` · `docs` · `adr` · `scripts`, or a domain (`recipes`).
Prefer an existing scope over a synonym.

## Sub-agents

For work that is large, parallel, or research-heavy, **spawn sub-agents rather than doing everything
in one context.** Good candidates: auditing many files against a rule, exploring an unfamiliar area,
independent slices of a migration, or a long investigation whose intermediate output you do not need.

A sub-agent starts with **no memory of this conversation**. It only knows what you write in its
prompt. Every spawn must therefore include:

- **The goal**, and what "done" looks like.
- **Exact file paths** to read — never "look around the codebase".
- **Which docs apply**: `docs/CONVENTIONS.md`, plus the specific `docs/adr/` files matching the globs
  it will touch.
- **The commands** it may run (`pnpm verify`, `pnpm test -- <file>`).
- **The output shape** you expect back (a list of `file:line` findings, a diff, a summary).
- **Boundaries** — read-only vs may-edit, and which paths are off limits.

Prefer read-only sub-agents for investigation and keep edits in the main thread, so changes stay
reviewable in one place. When several sub-agents will edit, give each a disjoint set of files.

Their reports are not shown to the user — relay what matters. Never present a pending sub-agent's
result as if it had returned.

## Done means

- `pnpm verify` is green.
- The architecture review above ran and reported clean, or the user approved the exceptions.
- Every new non-`anon` Convex export has a test asserting the wrong caller is rejected.
- Any `docs/` page the change invalidated has been updated.

---
