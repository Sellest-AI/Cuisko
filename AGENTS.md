# Agent Instructions

<!--
  MAINTENANCE: every line here must be a command, a boundary, a non-obvious pattern,
  or a pointer. No directory trees, no architecture prose — those live in docs/ and
  are read on demand. Budget is 400 lines — a ceiling, not a target: this file is
  loaded on every request, so an unnecessary line is paid for on every one. Past 400,
  extract to docs/ rather than trimming what earns its place.
  Nested files live at convex/AGENTS.md and src/ui/AGENTS.md — agents read the
  NEAREST one, so state a rule in the folder it governs rather than adding it here.
-->

**Cuisko** — An agent that plans a week of meals from the food you already own, and lists only what is missing.
Expo (React Native) + Convex. TypeScript throughout. iOS / Android / Web.

## Commands

```bash
pnpm verify        # typecheck + lint + C1–C18 + test — the pre-commit and pre-merge-commit hooks
                   # run this and refuse the commit if it fails. `--no-verify` bypasses them; CI does not.
pnpm convex:dev    # MUST be running before `pnpm start`
pnpm start         # Expo dev server
pnpm test -- <file>  # single test file
pnpm test:app      # jsdom project only — components, hooks, _model/
pnpm test:convex   # edge-runtime project only — Convex functions
pnpm test:scripts  # node project only — the C1–C18 checks, and the database and release scripts
```

Use the `context-mode` plugin when available: any command whose output you will process rather
than just glance at — a diff, a log, a test run — goes through it, not Bash.

## Before writing code

- `docs/PRODUCT.md` — what the app is for, who it serves, what it refuses to be. Read it when a
  choice affects what the user sees or is worded for them.
- `docs/CONVENTIONS.md` — naming, file placement, the "where does this go?" decision tree.
- `docs/adr/` — decisions that constrain code. Each declares `applies_to` globs; read the ones
  matching the files you are touching.
- `docs/ARCHITECTURE.md` — layer contracts and data flow. Read when the task crosses layers.
- `docs/plans/` — the slice in flight, if there is one. **Intent, not description:** where it
  disagrees with the code the code wins, and the plan should already have been deleted.

Prefer reading the code over the docs when they disagree. **The code is the source of truth** — if
you find a doc that contradicts it, say so and offer to fix the doc.

**A change crossing two layers starts with a plan.** Copy `docs/plans/_template.md` and agree it
before building: what it settles — file placement, call stack, what a hook returns — is the seam
between whoever writes the backend and whoever wires the screen, and a seam discovered during wiring
is a rewrite for one side. One file, one screen or a dep bump needs none. Its slices are checkboxes:
a slice found mid-build gets one before it is built, and each is ticked when it is completed. The
plan file is deleted once every box is ticked, before merging.

**Every new plan goes through the review loop** (`docs/plans/README.md`) before the user sees it:
`plan-reviewer` re-runs on each revision until `READY`, and the questions neither of you can settle
reach the user once, in one batch, at the end. Then the user agrees the plan.

Before adding a helper, hook or component, search for one that already exists —
`docs/CONVENTIONS.md` says where it would live. If it does, call it. If you are about to write the
second copy of the same logic, propose extracting it — never paste it, never refactor the first
copy silently.

## Never

| Rule                                                                                     | ADR  |
| ---------------------------------------------------------------------------------------- | ---- |
| Never import `convex/_generated/server` outside `convex/procedures.ts`                   | 0001 |
| Never import `convex/_generated/api` **inside** `convex/procedures.ts` (type cycle)      | 0001 |
| Never import Convex, `~/modules/*` or `translations` from `src/ui/**`                    | 0002 |
| Never call `useQuery` / `useMutation` in `app/**` — screens call a module hook           | 0006 |
| Never import another module's `_hooks/` or `_components/` — use its root or `hooks.ts`   | 0006 |
| Never define a webhook with bare `httpAction` — use `verifiedWebhook`                    | 0004 |
| Never default a secret to `''` — env is Zod-validated and throws at boot                 | 0005 |
| Never gate a security check on its secret being truthy (`if (secret) verify()`)          | 0005 |
| Never combine `.filter()` with `.paginate()` — put the predicate in the index            | 0007 |
| Never `ctx.db.query()` without `.withIndex()` / `.withSearchIndex()`                     | 0007 |
| Never import `isAuthorized` in `router/` — use `ownedQuery` / `ownedMutation`            | 0003 |
| Never add a `v.id()` field without its cascade index **and** `CASCADE` entry             | 0007 |
| Never leave a test file no Vitest project collects — a `.tsx` under `convex/` never runs | 0008 |
| Never add a `_model/` file without its test in that folder's `__tests__/`                | 0008 |
| Never recompute on the client a derived value the server already ships                   | 0015 |
| Never hold session state about a household in a plain `atom` — use `householdAtom`       | 0016 |
| Never add an `authed` operation that costs money (a model, storage) without `enforceRateLimit` | 0018 |
| Never write an empty `catch {}`                                                          | —    |
| Never commit secrets, force-push, or `git commit` unless asked                           | —    |
| Never add a `Co-Authored-By` or any AI-attribution trailer to a commit                   | —    |

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

**Screens never fetch.** Data access lives in `src/modules/{domain}/_hooks/`, the only place that
domain's queries, mutations and module-scoped Jotai state are referenced. As many hooks as the
domain needs, each named for what it returns — the folder is the binding site, not one file.

**A module's root is public; its underscore folders are not.** Any module or route may import a
root file. `_components/` and `_hooks/` are that module's interior, reached only by relative path
— lint R8 blocks the aliased form. A hook other modules need is re-exported from the module's
`hooks.ts`; it does not move. Full contract: `src/modules/AGENTS.md`.

## Running a task

**Keep going unless a step needs the user.** The status note rides with the next action — never
"want me to continue?". Stop only when a decision is the user's, at a stop this file names (review
finding, red test, wrong branch, unagreed plan), or before anything destructive or outside this
worktree (deleting data, force-push, `dev`, `main`, the shared stash).

**A run that changed or investigated something ends with these headings, in this order:**
**Changed** (by layer, and what verify said) · **Found** (noticed but not acted on, and what you
could not confirm, with where you looked) · **Blocked on you** (what you need from the user), or
**Next** when nothing is. When a section is empty, leave its heading out entirely.

**When the user asks for clarification or says they did not understand, change the form, not the
wording.** Prose that failed once fails again rephrased. Show it instead, picked by the shape of the
idea:

| The idea is…                             | Show it as                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| a rule or a behaviour                    | a concrete example — the input, and what comes out                                             |
| a choice between options, a before/after | a table, one row per option or case                                                            |
| a flow, a call stack, layers             | a diagram, drawn with your client's visual tool (the Claude app renders no Mermaid), else ASCII |

Build the example from this project — its files, its data (eggs owned, a recipe needing two) —
never `foo` / `bar`. Lead with it, then state the point in one sentence. If you cannot tell which
part lost them, name the one you think did and explain that, rather than repeating the whole answer.

## Tests

**Existing tests are the specification.** A fix adds tests. It never edits an existing assertion to
make itself pass.

- **A reported bug or edge case is pinned by a test before it is fixed: the rule that broke, not the
  instance.** A wrong output: the user's input and the output they expected. Bad data: the invariant
  over the whole table, or the function that let it in. Added to the existing test file (`convex/`,
  `shared/`, `_model/`). Never a new file just for it, never a component test. Watch it fail on the
  old code, then fix; a test only a revert can turn red again pins nothing.
- **A fix that turns an existing test red: STOP and report before touching the test.** Asking for a
  fix is not asking for a new behaviour. Either the fix is too wide, or the rule really changes, and
  that is the user's call. List every broken test, then wait:

| Test                   | Input                        | Test expects | Fix returns |
| ---------------------- | ---------------------------- | ------------ | ----------- |
| `planWeek.test.ts:84`  | 5 eggs owned, recipe needs 2 | toBuy 0      | toBuy 1     |
| `planWeek.test.ts:112` | 0 eggs owned, recipe needs 2 | toBuy 2      | toBuy 0     |

End with the choice: narrow the fix, or confirm the new behaviour.

How to write the test itself, and where each file goes: `docs/CONVENTIONS.md` §1.5.

## Before committing — full review (REQUIRED)

Run this **every time**, before staging, on every changed file. Do not skip it because a change looks
small — most defects this catches are one-line changes.

**Step 1 — automated.** `pnpm verify` (typecheck + lint R1–R8 + the C1–C18 scripts + tests).

**Step 2 — get the changed set.** `git diff --name-only`, `git diff --cached --name-only` and
`git ls-files --others --exclude-standard`. You need it to decide Step 4's trigger and to check the
findings in Step 5. The reviewer does **not** need it from you — it runs the same commands itself.

**Step 3 — spawn `architecture-reviewer`. Every time.** A cold context catches what yours cannot:
you know what you meant, so you read the diff as intent rather than as text. It is defined in
`.claude/agents/architecture-reviewer.md`, runs read-only on Sonnet, and establishes its own inputs
— the changed set from `git`, the applicable ADRs from their `applies_to` frontmatter, the criteria
from the tables in this file.

**Your prompt carries the intent, and nothing else:**

- **what the change is for**, in two or three lines.
- **what scope was deliberately left out** — placeholder data, a screen not yet wired to Convex, a
  test deferred to the next slice. Absent scope reads as an omission to someone who was not there,
  and you will get it back as a finding.
- **anything that happened outside the diff** it would otherwise misread — a file moved rather than
  rewritten, a rule you and the user agreed to break knowingly.

**Do not list the changed files, and do not name the ADRs.** It is tempting: you already know both,
and typing them looks like saving the reviewer a step. But a list you write is a filter you control,
and you are the party under review — forget one untracked file and it is never checked; forget the
one ADR your change happens to break and the review comes back clean on the rule you broke. Both
failures are invisible in the output. The reviewer derives those from the repo so that no mistake of
yours can narrow what it looks at. What you supply is what `git` cannot know: why.

**Step 4 — `/code-review` when the diff contains logic.** It hunts defects, which Step 3 deliberately
does not: off-by-one, unhandled rejection, an unreachable branch, an N+1. Trigger is concrete —
`convex/functions/`, `convex/router/` beyond a validator change, `src/modules/**/_hooks/`, or
`shared/`. Skip it for pure `src/ui/` styling, docs, config and dependency bumps; a defect hunt on a
stylesheet finds nothing and teaches you to skip the step that matters.

**Both passes run on the same diff, and that is the point** — they are not redundant, they are split
by question. Step 3 asks *does this obey the rules we wrote down*, and answers it from a table, which
is why it can be a cheap model with no Bash. Step 4 asks *is this correct*, which needs a defect hunt
and the depth to run one. Neither finds the other's issues. If you catch Step 3 reporting a race
condition or Step 4 reporting a filename, the split has collapsed and the cheap pass has stopped
being cheap.

**Step 5 — verify every finding before relaying it.** Open the file each one names and confirm it. A
reviewer that never saw the conversation also invents findings, and passing one on unchecked costs
more trust than the whole review buys.

### Naming

| Check                           | Rule                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------ |
| File name — `convex/**`         | camelCase (`getOne.ts`)                                                        |
| File name — components, screens | kebab-case (`recipe-card.tsx`, `saved-recipes.tsx`)                            |
| File name — hooks, anywhere     | camelCase **matching the export** (`useRecipes.ts` → `useRecipes`)             |
| File name — sub-components      | dot notation (`recipe-form.ingredients.tsx`)                                   |
| File name — a module's screens  | one screen → `screen.tsx`; several → `<behaviour>-screen` (`list-screen.tsx`)  |
| Component reaching 3 files      | folder + `index` — `select/index.tsx`, `index.ios.tsx`, `types.ts`             |
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
- Router file ≤ 90 lines of code (comments and blank lines not counted), and contains no loop, no domain branching, no domain-library import.
- Screen ≤ ~120 lines of component code (its `StyleSheet`, comments and blank lines not counted) and calls a module hook rather than fetching.
- A new or changed entry in `EventProperties` (`convex/schema/events.ts`) declares the id of every row its event is about and of the rows another event joins on (ADR 0019). The type enforces what is declared, never what should be.

### Schema (if `convex/schema/**` changed)

- Every query path has an index; no `.filter()` with `.paginate()`.
- Mutable table declares `updatedAt`; a join table never does; no hand-rolled `createdAt` (`_creationTime` exists).
- Polymorphic refs are `v.union` of discriminated objects, not parallel optional FKs.
- New foreign key ships with its cascade index **and** its `CASCADE` entry.
- Join table carries `position` if order is meaningful.

### Hygiene

- No empty `catch {}`, no leftover `console.log`, no commented-out code.
- No `@deprecated` code left shipping; delete it — git remembers.
- No new `any` without a comment justifying it.
- A known choice accepted with its downside carries `@limitation` (CONVENTIONS §1.6), never a bare `TODO`.
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
  user**, naming the branch it belongs on. Usually `dev`, or a branch of its own.
- Unsure → ask. The question is cheaper than the move.

Supporting work is not a stray: a `feat(groceries)` a `feat/planning-…` branch needs, or a `fix` for
something the branch itself broke, belongs on the branch, even when its scope is another domain.

- **The hooks check the files on disk, not what you commit.** An uncommitted edit can hide a broken
  commit, so trust `pnpm verify` only once nothing is left uncommitted. Commit `package.json` whole.
- **Into `dev`:** rename a `claude/…` branch to `<type>/…` (the hook refuses it), merge `dev` into
  it, verify, then a plain `git merge`. Never `--no-ff`. A push to `dev` ships to preview phones and
  the dev Convex deployment.
- **Into `main`:** only `dev` is merged into `main`, and only when the user says so: that merge is
  the release, to the production channel and the prod deployment (`docs/ARCHITECTURE.md` §
  Releases).

Format is Conventional Commits. The rules live in `commitlint.config.js`, which the `commit-msg` hook
runs; branch names are checked by `.githooks/pre-commit`. When the two disagree with a doc, they win.
One logical change per commit. Scopes and a worked example: `docs/CONVENTIONS.md` §10.

**Write the body for an agent reading `git log` a year from now.** It will have the diff; what it
cannot recover is intent. So the body is the payload, not decoration:

- **The trigger** — what was broken, missing or newly required. Highest-value sentence in the message.
- **What changed by layer**, not by file — "the check moved from `router/` into `procedures.ts`".
- **The governing rule** when one applies (`ADR 0003`, `C4`, `lint R7`), so `git log --grep` finds it.
- **What you deliberately did not do**, if a reader would wonder. Absent scope is invisible in a diff.

Omit the body only when the subject is complete alone (`chore(deps): bump convex to 1.44`).

⚠️ **Never start a body line with `word:`.** The parser reads `Note:`, `Result:`, `enforced:` as a
footer token and treats everything after it as footers — silently wrecking the structure the history
is supposed to be readable by. Rewrite as "enforces it: …", or put the phrase mid-line. The
`commit-msg` hook refuses it (`no-footer-shaped-body-line`), except for real footer tokens, so
write the body without it rather than retrying until it passes.

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
- **The output shape** you expect back (a list of `file:line` findings, a diff, a summary), plus
  what it could not confirm and where it looked — a silent gap reads as a clean result.
- **Boundaries** — read-only vs may-edit, and which paths are off limits.

**A spawn you make more than once becomes a definition in `.claude/agents/`.** Everything above then
lives in the definition instead of the prompt — a stable prefix the model caches, rather than one you
retype and drift from each time — and the definition pins the model and the tool list, so a
table-checking pass is not paying for a reasoning model with a shell it does not need.
`architecture-reviewer` and `plan-reviewer` are the two that exist; they are the shape to copy.

Prefer read-only sub-agents for investigation and keep edits in the main thread, so changes stay
reviewable in one place. When several sub-agents will edit, give each a disjoint set of files.

Their reports are not shown to the user — relay what matters. Never present a pending sub-agent's
result as if it had returned.

## Done means

- `pnpm verify` is green.
- **Only when you are asked to commit**: The architecture review above ran and reported clean, or the user approved the exceptions.
- Every new non-`anon` Convex export has a test asserting the wrong caller is rejected.
- Every new `_model/` file has a test in its `__tests__/`, every test file sits in a `__tests__/`, none sits where nothing runs it, and every `convex-test` file calling through `api.` / `internal.` warms its module in a `beforeAll` (C10).
- Every bug or edge case the user reported has its test, and no existing assertion changed without the user's approval (see Tests).
- Any `docs/` page the change invalidated has been updated.
- The slice's plan file is **deleted** — with any decision worth keeping promoted to an ADR or to
  `docs/CONVENTIONS.md` first. A plan that outlives its build is a specification nobody maintains,
  and the next agent will build against it.

---
