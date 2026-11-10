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
pnpm verify        # typecheck + lint + C1–C20 + knip + test — the pre-commit and pre-merge-commit hooks
                   # run this and refuse the commit if it fails. `--no-verify` bypasses them; CI does not.
pnpm convex:dev    # MUST be running before `pnpm start`
pnpm start         # Expo dev server
pnpm test <file>   # single test file — never `pnpm test -- <file>`: vitest then runs every file
pnpm test:app      # jsdom project only — components, hooks, _model/
pnpm test:convex   # edge-runtime project only — Convex functions
pnpm test:scripts  # node project only — the C1–C20 checks, and the database, release and memory scripts
```

Use the `context-mode` plugin when available: any command whose output you will process rather
than just glance at — a diff, a log, a test run — goes through it, not Bash.

## Memory

Your memory is in .claude/memory/ and is read-only for you: it is updated after the session, from the conversation. Start by reading index.md.
If you learn something worth keeping, say it in your reply, on one short line starting with `Memory:`. Never write it to a file.

## Before writing code

- `docs/PRODUCT.md` — what the app is for, who it serves, what it refuses to be. Read it when a
  choice affects what the user sees or is worded for them.
- `docs/DESIGN.md` — how the app looks, moves and feels: tokens, type, touch, motion, states.
  Read it before you write or change anything under `src/ui/` or any screen.
- `docs/CONVENTIONS.md` — naming, file placement, the "where does this go?" decision tree.
- `docs/adr/` — decisions that constrain code. Each declares `applies_to` globs; read the ones
  matching the files you are touching.
- `docs/ARCHITECTURE.md` — layer contracts and data flow. Read when the task crosses layers.
- `docs/plans/` — the slice in flight, if there is one. **Intent, not description:** where it
  disagrees with the code the code wins, and the plan should already have been deleted.

Prefer reading the code over the docs when they disagree. **The code is the source of truth** — if
you find a doc that contradicts it, say so and offer to fix the doc.

**`docs/` is documentation, not a log.** No release notes, changelogs, to-dos or status updates: those
go in the closing message or the commit.

**A change crossing two layers starts with a plan.** Copy `docs/plans/_template.md` and agree it
before building: what it settles — file placement, call stack, what a hook returns — is the seam
between whoever writes the backend and whoever wires the screen, and a seam discovered during wiring
is a rewrite for one side. One file, one screen or a dep bump needs none. Its slices are checkboxes:
a slice found mid-build gets one before it is built, and each is ticked when it is completed. The
plan file is deleted once every box is ticked, before merging.

**Before you write a new plan, load the `grilling` skill** (`.claude/skills/grilling/SKILL.md`).
It interviews the user in rounds, with a recommended answer for each question, until nothing is left
open.

**Every new plan goes through the review loop** (`docs/plans/README.md`) before the user sees it:
`plan-reviewer` re-runs on each revision until `READY`, and the questions neither of you can settle
reach the user once, in one batch, at the end. Then the user agrees the plan.

Before adding a helper, hook or component, search for one that already exists —
`docs/CONVENTIONS.md` says where it would live. If it does, call it. If you are about to write the
second copy of the same logic, propose extracting it — never paste it, never refactor the first
copy silently.

## Never

| Rule                                                                                           | ADR  |
| ---------------------------------------------------------------------------------------------- | ---- |
| Never import `convex/_generated/server` outside `convex/procedures.ts`                         | 0001 |
| Never import `convex/_generated/api` **inside** `convex/procedures.ts` (type cycle)            | 0001 |
| Never import Convex, `~/modules/*` or `translations` from `src/ui/**`                          | 0002 |
| Never call `useQuery` / `useMutation` in `app/**` — screens call a module hook                 | 0006 |
| Never import another module's `_hooks/` or `_components/` — use its root or `hooks.ts`         | 0006 |
| Never define a webhook with bare `httpAction` — use `verifiedWebhook`                          | 0004 |
| Never default a secret to `''` — env is Zod-validated and throws at boot                       | 0005 |
| Never gate a security check on its secret being truthy (`if (secret) verify()`)                | 0005 |
| Never combine `.filter()` with `.paginate()` — put the predicate in the index                  | 0007 |
| Never `ctx.db.query()` without `.withIndex()` / `.withSearchIndex()`                           | 0007 |
| Never import `isAuthorized` in `router/` — use `ownedQuery` / `ownedMutation`                  | 0003 |
| Never add a `v.id()` field without its cascade index **and** `CASCADE` entry                   | 0007 |
| Never leave a test file no Vitest project collects — a `.tsx` under `convex/` never runs       | 0008 |
| Never add a `_model/` file without its test in that folder's `__tests__/`                      | 0008 |
| Never recompute on the client a derived value the server already ships                         | 0015 |
| Never hold session state about a household in a plain `atom` — use `householdAtom`             | 0016 |
| Never add an `authed` operation that costs money (a model, storage) without `enforceRateLimit` | 0018 |
| Never write an empty `catch {}`                                                                | —    |
| Never commit secrets, force-push, or `git commit` unless asked                                 | —    |
| Never add a `Co-Authored-By` or any AI-attribution trailer to a commit                         | —    |

## Code rules

What the code you write must obey. `architecture-reviewer` checks every commit against these tables and the **Never** table, so a rule broken here comes back as a finding.

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

The table is the floor, not the bar. A name that is legal but says nothing (`data`, `tmp`, `res`,
`handleThing2`) is a finding too.

### Architecture

- Every entry in the **Never** table above.
- Every `docs/adr/` record whose `applies_to` glob matches a changed file.
- Export name matches its builder (`admin` ⇒ `admin*`). **The highest-value check in this list** — a
  mismatch is a silent authorization hole that nothing else detects.
- Router file ≤ 90 lines of code (comments and blank lines not counted), and contains no loop, no domain branching, no domain-library import.
- Screen ≤ ~120 lines of component code (its `StyleSheet`, comments and blank lines not counted) and calls a module hook rather than fetching.
- `convex/functions/` follows CONVENTIONS §6: a file per concept, and a table read once per way of finding it, projected by its `to<Shape>` mapper, never by the router.
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
- Any `docs/` page carrying release notes, a log or a to-do.

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
findings left after the `committing` skill's fix loop, red test, wrong branch, unagreed plan), or before anything destructive or outside this
worktree (deleting data, force-push, `dev`, `main`, the shared stash).

**A run that changed or investigated something ends with these headings, in this order:**
**Changed** (by layer, and what verify said) · **Found** (noticed but not acted on, and what you
could not confirm, with where you looked) · **Blocked on you** (what you need from the user), or
**Next** when nothing is. When a section is empty, leave its heading out entirely.

**Say what you're doing while you're doing it.** Before a long stretch, say what you're about to do; as each step lands, say what it showed. "A short line per step beats a perfect summary at the end".

**Write replies in the spirit of ASD-STE100, about 80% of the way.** Short sentences, one idea each,
active voice, the same word for the same thing. Skip its dictionary: technical terms stay, and
fluency wins when a rule makes a sentence worse. This covers your messages, never the app's copy.

**When the user asks for clarification or says they did not understand, change the form, not the
wording.** Prose that failed once fails again rephrased. Show it instead, picked by the shape of the
idea:

| The idea is…                             | Show it as                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| a rule or a behaviour                    | a concrete example — the input, and what comes out                                              |
| a choice between options, a before/after | a table, one row per option or case                                                             |
| a flow, a call stack, layers             | a diagram, drawn with your client's visual tool (the Claude app renders no Mermaid), else ASCII |

Build the example from this project — its files, its data (eggs owned, a recipe needing two) —
never `foo` / `bar`. Lead with it, then state the point in one sentence. If you cannot tell which
part lost them, name the one you think did and explain that, rather than repeating the whole answer.

## Tests

**Existing tests are the specification.** A fix adds tests. It never edits an existing assertion to
make itself pass.

**Before fixing a bug, find its root cause** with the `systematic-debugging` skill
(`.claude/skills/systematic-debugging/SKILL.md`): one hypothesis at a time, and a stop after three
failed fixes.

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

## Committing

**Before any commit or merge, load the `committing` skill** (`.claude/skills/committing/SKILL.md`).
It runs the full review — `pnpm verify`, `architecture-reviewer`, `/code-review` and the fix loop —
checks the branch, and sets the commit-message rules. The hooks enforce only the format, not the
review, so the skill is not optional.

## Agents and Sub-agents

**Load `writing-for-agents`** (`.claude/skills/writing-for-agents/SKILL.md`) before you create or
edit a skill, an agent definition, `AGENTS.md` or `CLAUDE.md`.

For work that is large, parallel, or research-heavy, **spawn sub-agents rather than doing everything
in one context.** Good candidates: auditing many files against a rule, exploring an unfamiliar area,
independent slices of a migration, or a long investigation whose intermediate output you do not need.

Before you write a spawn prompt or a new agent definition, read
[`docs/SUB-AGENTS.md`](docs/SUB-AGENTS.md): what a prompt must carry, and when a spawn
becomes a definition.

## Done means

- `pnpm verify` is green.
- **Only when you are asked to commit**: The review in the `committing` skill ran and reported clean, or the user approved the exceptions.
- Every new non-`anon`, non-`_internal` Convex export has a test asserting the wrong caller is rejected (C5).
- Every new `_model/` file has a test in its `__tests__/`, every test file sits in a `__tests__/`, none sits where nothing runs it, and every `convex-test` file calling through `api.` / `internal.` warms its module in a `beforeAll` (C10).
- Every bug or edge case the user reported has its test, and no existing assertion changed without the user's approval (see Tests).
- Any `docs/` page the change invalidated has been updated.
- The slice's plan file is **deleted** — with any decision worth keeping promoted to an ADR or to
  `docs/CONVENTIONS.md` first. A plan that outlives its build is a specification nobody maintains,
  and the next agent will build against it.

---
