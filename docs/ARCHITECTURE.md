# Architecture

The layer contracts and data flow for Cuisko. Read this when a task crosses layers.

This is the **specification**, not a description of the current file tree: it defines the shape every
layer must take as it lands, so that new code can be checked against it. The rules extracted from it
live in [CONVENTIONS.md](./CONVENTIONS.md); the decisions that constrain code are in [adr/](./adr/).

**Where this page and the code disagree about something already built, the code wins** — say so and
fix the page.

---

## The one idea

Cuisko's predecessor had good layering and no enforcement. Every rule with a mechanical backstop held
perfectly; every rule that relied on discipline eroded, and the documentation kept describing the
intent rather than the result. So the architecture here is a set of layers **plus the mechanism that
keeps each boundary real**. Three principles follow, and they explain most of what is below:

1. **A rule needs an affordance.** If obeying a rule is impossible or inconvenient, it will be
   broken. `procedures.ts` exports a *complete* surface for exactly this reason.
2. **A rule needs a machine check.** Without one you get no signal when it stops holding — 58 files
   drifted silently in the predecessor over months.
3. **Fail loudly at boot, never silently at runtime.** A deployment that cannot satisfy its security
   preconditions must refuse to start.

---

## Repository layout

```
cuisko/
├── app/                  Expo Router. SCREENS ONLY.
├── src/
│   ├── ui/               Design system. Zero Convex, zero domain logic.
│   ├── modules/          Feature modules. Own all Convex bindings.
│   ├── lib/              Vendor SDK wrappers. The only place an SDK is imported.
│   ├── providers/        React context tree.
│   ├── hooks/            Generic cross-feature hooks.
│   └── global/           theme, routes, constants.
├── convex/               Backend.
├── shared/               Runs in BOTH runtimes. No browser APIs, no Node built-ins.
├── docs/                 PRODUCT · ARCHITECTURE (this page) · CONVENTIONS
│   ├── adr/              Decisions that constrain code. Each declares its applies_to globs.
│   ├── plans/            The slice in flight. Intent, not description — deleted when it lands.
│   ├── external/         What lives outside the repo: hosting, accounts, design source.
│   └── _reference/       Frozen audit of the predecessor. History, not documentation.
├── scripts/              Everything run outside the app.
│   ├── checks/          C1–C16 architectural checks + the `_lib.mjs` they share.
│   ├── database/        Scripts that talk to a deployment through a deploy key.
│   │   ├── _lib/        What they share: the deploy-key client, downloads, folder names, the zip.
│   │   ├── ingredients/ `ingredients:export` / `ingredients:restore` (README inside).
│   │   └── recipes/     `seed:catalog` / `catalog:export` / `catalog:restore` (README inside).
│   └── images/          Hand-run asset preparation (compress, sanitize).
├── patches/              Patches to dependencies, each registered in pnpm-workspace.yaml with the issue that retires it.
├── .githooks/            pre-commit (verify + branch name), pre-merge-commit (the same, on a merge), commit-msg (commitlint).
├── .claude/              Agent harness: SessionStart context + Stop-time C checks (advisory).
├── env.ts                Client env — Zod validated.
├── metro.config.js       Metro: open-file cap (EMFILE) + .history blocklist.
├── commitlint.config.js  Conventional Commits rules.
└── eslint.config.js      Carries the architectural lint rules R1–R8.
```

### Two runtimes, two TypeScript projects

|          | Root project                      | Convex project                                  |
| -------- | --------------------------------- | ----------------------------------------------- |
| Config   | [tsconfig.json](../tsconfig.json) | [convex/tsconfig.json](../convex/tsconfig.json) |
| Covers   | `app/`, `src/`, `shared/`         | `convex/`, `shared/`                            |
| Runtime  | React Native (Hermes) / web       | Convex's V8 edge runtime                        |
| Excludes | `convex/`                         | `convex/_generated/`                            |

The split is not cosmetic — the two runtimes have different globals. `shared/` is the only code
compiled by both, which is why it may use neither browser APIs nor Node built-ins.

### Path aliases

Every alias is unambiguous in both projects, deliberately: the predecessor's `@/` meant `expo/` in
the app and `convex/lib/` in the backend — the same prefix with two meanings depending on which
config owned the file.

| Alias                      | Root project                                               | Convex project |
| -------------------------- | ---------------------------------------------------------- | -------------- |
| `~/*`                      | `src/*`                                                    | —              |
| `@ui/*`                    | `src/ui/components/*`                                      | —              |
| `@ui/hooks/*`, `@ui/utils` | `src/ui/hooks/*`, `src/ui/utils`                           | —              |
| `theme`, `routes`, `env`   | `src/global/theme.ts`, `src/global/routes.ts`, `env.ts`    | —              |
| `@convex/*`                | `convex/*` — resolution only, **not for application code** | `convex/*`     |
| `@shared/*`                | `shared/*`                                                 | `shared/*`     |

`@convex/*` is declared in both projects, but only the backend may *use* it. The root project needs
it because `src/lib/convex/api.ts` re-exports the generated API, whose type graph imports every
Convex module — so the root program has to resolve their specifiers to typecheck at all. Lint R3
still confines application code to that one seam.

> Aliases are resolved by `tsc`, Metro and Convex's bundler — **but not by Vite**. Anything the test
> runner must resolve needs a matching `resolve.alias` in [vitest.config.mts](../vitest.config.mts).
> A missing entry fails at test time only, long after typecheck is green.

---

## Backend

```
convex/
├── procedures.ts   ★ THE auth layer. The only file that may touch _generated/server.
├── env.ts          ★ Zod-validated. Throws at boot on anything missing.
├── schema.ts       Aggregates schema/.
├── schema/         One file per domain. Tables + shared validators + constants.
├── router/         ★ The public API. {domain}/{operation}.ts. ≤90 lines each.
├── functions/      Reusable logic that TOUCHES the database. Plain (ctx, args) functions.
├── lib/            Vendor clients and pure helpers. Never touches ctx.db.
├── agent/          ★ Sealed AI boundary. agents / config / tools.
├── http/           ★ Webhooks. verified.ts is the only way to define one.
├── crons/          Cron bodies; crons.ts holds the schedule.
├── workflows/      Durable multi-step jobs (@convex-dev/workflow).
└── auth.ts         convexAuth providers + lifecycle callbacks.
```

### Layer contracts

| Layer           | May do                                                         | May **not** do                                             |
| --------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| `router/`       | validators, procedure wrappers, arg shaping, call `functions/` | loops, domain branching, domain-library imports, >90 lines |
| `functions/`    | touch `ctx.db`, domain logic, call `lib/`                      | be a registered Convex procedure                           |
| `lib/`          | vendor SDKs, pure helpers                                      | touch `ctx.db`                                             |
| `agent/`        | import `ai` / `@convex-dev/agent`                              | be imported by `src/`                                      |
| `http/`         | define webhooks via `verifiedWebhook`                          | call `httpAction` directly                                 |
| `procedures.ts` | import `_generated/server`                                     | import `_generated/api` — type cycle                       |
| everything else | import `_generated/api`                                        | import `_generated/server`                                 |

`functions/` vs `lib/` is decidable, not a judgement call: **does it touch `ctx.db`?** Every domain
in `functions/` carries an `index.ts` barrel, so imports read `from "@convex/functions/recipes"`.

### The request path

```
client
  └─> api.router.{domain}.{operation}.{access}
        └─> router/{domain}/{operation}.ts      validators + procedure wrapper + arg shaping
              └─> procedures.ts                 ← identity resolved, ownership asserted HERE
                    └─> functions/{domain}/     the actual work, touching ctx.db
                          └─> lib/{vendor}/     pure helpers, vendor SDKs
```

Authorization happens **once**, in the procedure wrapper, before the handler runs. That is the point
of the layer: a handler cannot execute without the caller resolved, and `ownedQuery`/`ownedMutation`
go further — the handler cannot execute without the *document* checked, because it arrives as
`ctx.doc` ([ADR 0003](./adr/0003-ownership-via-procedure.md)).

The filesystem maps directly onto the API, so a call site reads as a path:

```
convex/router/recipes/getOne.ts  →  export const authed  →  api.router.recipes.getOne.authed
```

### The export grammar

The export **name** encodes the access level, which is the only place it is visible at the call site.

| Export                           | Required builder                                  | Callable by                     |
| -------------------------------- | ------------------------------------------------- | ------------------------------- |
| `anon`                           | `publicQuery` / `publicMutation` / `publicAction` | anyone                          |
| `authed`                         | `auth*` or `owned*`                               | signed-in users                 |
| `admin`                          | `admin*`                                          | `role === 'ADMIN'`              |
| `server`                         | `server*`                                         | holders of `SERVER_PRIVATE_KEY` |
| `_internal` / `_internal_<verb>` | `internal*`                                       | other Convex functions only     |

Script **C1** verifies the name matches the builder on every commit — the highest-value check in the
repo. The predecessor shipped `export const admin = authQuery({ args: { userId } })` twice; both were
live IDORs, and nothing was looking.

### The shared-handler pattern

One implementation, several access levels. The access level lives in the wrapper; the logic lives in
one shared function:

```ts
const handler = async (ctx: QueryCtx, args: Args) => { /* the actual work */ };

export const authed = authQuery({
  args,
  handler: (ctx, a) => handler(ctx, { ...a, userId: ctx.userId }),   // own data
});

export const admin = adminQuery({
  args: { ...args, userId: v.id("users") },
  handler,                                                           // anyone's data
});
```

Note `userId` in `admin` comes from **arguments** — exactly the shape that produced the predecessor's
IDORs. The difference is that `admin` is bound to `adminQuery`, and C1 proves that binding.

### Identity

```
users            ← owned by @convex-dev/auth. We write it in one place: the account-deletion purge.
usersExtended    ← our profile row, 1:1 via by_user
```

A user may be a tombstone: an account deleted by `functions/users/purgeUser.ts` keeps its rows, with
`usersExtended.deletedAt` set. `loadUser` returns null for it, so no procedure can act as it, and a
statistic about active cooks filters on `deletedAt` being unset.

`procedures.ts` merges the two into one `AppUser` and injects it as `ctx.user`, which lets us extend
the user without forking the auth component. Actions have no `ctx.db`, so the action branch hops
through an internal query — referenced by **string path** via `makeFunctionReference`, because
importing `_generated/api` here would create a project-wide type cycle
([ADR 0001](./adr/0001-convex-procedures-only.md)). That string is not compiler-checked, so a test
asserts it still resolves.

### Schema

One file per domain in `schema/`, aggregated by `schema.ts`. The techniques that matter:

```ts
// One declaration → runtime validation, DB validation, and a TS type.
const UNITS = ["g", "ml", "tbsp", "unit"] as const;
const vUnit = v.union(...UNITS.map(v.literal));
type Unit = (typeof UNITS)[number];
```

- **Exported field sets** spread into both the table and the mutation args, keeping storage and
  arguments in lockstep.
- **Every query path has an index** ([ADR 0007](./adr/0007-every-query-uses-an-index.md)). Indexes
  are `by_<field>[_and_<field>]`; C3 proves the name matches the fields.
- **A foreign key ships with the index its cascade needs, plus its `CASCADE` entry** in
  `functions/cascade.ts`. Relationships are declared once and the cascade derived from them, rather
  than hand-written per delete path — the predecessor orphaned rows across six tables because four
  lacked a usable index, and a compound index led by `userId` cannot answer "all rows for this
  recipe".
- **No `createdAt`** — `_creationTime` exists. Mutable tables declare `updatedAt`.
- **Polymorphic references** use one `targetId: v.union(v.id(a), v.id(b))` plus a discriminant when
  indexed; a `v.union` of discriminated objects when not. Never parallel optional FKs.

### Async orchestration

Long-running third-party work follows one shape:

```
1. authAction / ownedMutation   validate, charge, call the provider, receive a job id
2. internalMutation             persist a job row { externalId, status: 'PENDING' }
3. verifiedWebhook              provider calls back → signature verified → job resolved
4. internalAction               fetch output → store → internalMutation updates status → notify
```

Each hop must be its own **top-level** export, because Convex registers functions by scanning
top-level exports for the markers its builders attach. An object wrapping them registers *nothing* —
which is why the grammar has an `_internal_<verb>` form rather than a namespace. Name steps by verb,
never by number: `_internal_persist` survives refactoring, `_internal_step3` does not.

| Need                                        | Use                                                      |
| ------------------------------------------- | -------------------------------------------------------- |
| One follow-up after a write commits         | `ctx.scheduler.runAfter(0, internal.…)`                  |
| Recurring on a clock                        | `crons/`                                                 |
| Multi-step, each step retried independently | `@convex-dev/workflow`                                   |
| Iterate a large table                       | `.paginate()` inside a workflow — **never `.collect()`** |

### The AI boundary

`agent/` is sealed: the `ai` SDK and `@convex-dev/agent` are imported there and nowhere else. AI-backed
endpoints are ordinary `router/` files that call into it — not a parallel tree, which in the
predecessor meant two places to look for an endpoint for no benefit.

Two patterns worth keeping: **semantic model tiers** (call sites ask for `models.vision.smart`, never
a model string, so swapping providers is a one-file change).

---

## Frontend

```
┌─ app/ ──────────── Routing only. Params, <Stack.Screen> options, layout, ONE hook call.
├─ src/modules/ ──── Feature modules. ★ The ONLY layer that calls Convex.
├─ src/lib/ ──────── Vendor wrappers. The only files that import an SDK.
└─ src/ui/ ───────── Design system. No Convex, no domain logic. Structural props only.
```

Dependencies flow strictly downward; `ui/` imports from nothing above it.

### The data path

```
app/(tabs)/recipes.tsx
  └─> useRecipes()                          src/modules/recipes/_hooks/useRecipes.ts
        └─> api.router.recipes.*            via src/lib/convex/api.ts — the single choke point
              └─> Convex (reactive)
        └─> adapts Doc<'recipes'> → structural props
              └─> <RecipeCard title=… minutes=… />      src/ui/cards/recipe.tsx
```

Two boundaries do real work here, and they are the same boundary seen twice.

### Feature hooks own the data

The most valuable frontend pattern, and the contract every domain follows:

```
src/modules/recipes/
├── screen.list.tsx              a screen, and below it the parts only that screen uses
├── screen.list.filters.tsx      dot notation — nothing but screen.list.tsx imports this
├── screen.detail.tsx
├── hooks.ts                     the door — re-exports the hooks other modules may call
├── _components/                 used by more than one parent in this module
│   ├── recipe-form.tsx
│   └── recipe-form.ingredients.tsx   the dot still marks a part of recipe-form.tsx
├── _hooks/                      ★ the ONLY place api.router.recipes.* is referenced
│   ├── useRecipes.ts            as many hooks as the domain needs, each named for what it
│   └── useRecipeForm.ts         returns — the folder is the binding site, not one file
└── _model/                      ★ the domain as data, and the pure functions over it — no
    └── model.ts                 React, no Jotai, no Convex import lands here, ever
```

**The dot is a claim, not a spelling.** `screen.list.filters.tsx` states that the filters exist to
build the list screen and that nothing else imports them — so a change to them can only break one
file, and that file is named in the filename. `_components/` states the opposite: several parents in
this module depend on this, so changing it means checking all of them.

Getting it backwards costs a rename, which is nothing. What it costs meanwhile is trust: a dotted
file that three screens import has told every reader a lie about the blast radius of editing it, and
the reader has no reason to doubt it until something breaks.

**A module has a public surface and an interior, and the root is the surface.** Root files are
public: any module or route may import them. `_components/`, `_hooks/` and `_model/` are the
interior — that module only, reached by relative path. So a component another module needs sits at
the root, and that is not an exception carved out for it; it is the module's product.
`weekly-plan.tsx` is at `planning/`'s root because `home/` renders it.

If it is pure **and generic** it does not belong here at all — it belongs in `src/ui/`, where any
module may draw it without a data path. The module layer keeps only what needs a domain's data —
which `_model/` does not, and it lives here anyway: its purity is about framework, not about the
domain. `useRecipes.ts` knows how to *fetch* a recipe; `_model/model.ts` knows what a recipe *is* —
its types, its invariants, the functions that turn a raw snapshot into what a screen draws. Testing
the second kind means asserting on a plain object; testing the first means mounting a provider tree
to fake the query it wraps. Splitting them means the domain rules can be tested at the first kind of
cost even while the domain has no backend yet — which is why a `_model/` file's test is the one
test this project makes mandatory ([ADR 0008](./adr/0008-tests-are-layered.md)) — the placeholder in `_hooks/atoms.ts` and the real
`_model/` functions built against it are already the shape the eventual Convex-backed version keeps.

**Hooks reach the surface through `hooks.ts`, not by moving.** A hook stays in `_hooks/` beside its
siblings; the barrel re-exports the ones other modules may call:

```ts
// src/modules/planning/hooks.ts
export { useWeeklyPlan } from "./_hooks/useWeeklyPlan";
```

That keeps the published data surface an enumerated list somebody can read in one screen, and makes
exposing a hook a one-line edit that shows up in review — rather than an emergent property of who
happened to import what. It re-exports and nothing else: logic in the barrel means it has stopped
being a door. Write it at the first real consumer, not in advance.

**Peer modules may depend on each other; that is composition, not coupling.** Home shows planning,
and will show recipes and groceries. Forbidding it outright leaves one place to compose them —
`app/` — and routes then grow into the pages they were supposed to route to. What actually hurts is
reaching past the underscore (lint R8) and cycles between modules.

```ts
// src/modules/recipes/_hooks/useRecipes.ts
import { api, type Id } from "~/lib/convex/api";
import { useMutation, useQueryCached } from "~/lib/convex/client";

export const useRecipe = (recipeId?: Id<"recipes"> | null) => {
  const { data: recipe, isPending } = useQueryCached(
    api.router.recipes.getOne.authed,
    recipeId ? { recipeId } : "skip",          // Convex's conditional-query idiom
  );

  const { mutate: updateRecipe, isLoading: isSaving } =
    useMutation(api.router.recipes.updateOne.authed);

  /** Derives the arg type from the generated mutation — a backend change is a type error here. */
  const update = (data: Omit<Parameters<typeof updateRecipe>[0], "id">) =>
    recipeId ? updateRecipe({ ...data, id: recipeId }) : undefined;

  return { recipe, isLoading: isPending, isSaving, update };
};
```

Three techniques, each load-bearing:

- **`'skip'` for conditional queries** — Convex's idiom for "not yet", avoiding a conditional hook.
- **A module-scoped Jotai atom as a fallback id** where a detail screen must survive navigation
  without params.
- **`Omit<Parameters<typeof mutate>[0], 'id'>`** — deriving the public argument type from the
  generated signature, so a backend argument change surfaces as a frontend **type error** rather than
  a runtime `undefined`.

A screen calls `useRecipe()`. It never calls `useQuery` and never touches `api`
([ADR 0006](./adr/0006-screens-never-fetch.md)). When the backend changes, exactly one file per
domain needs editing — not one per screen, which is what the predecessor got by letting 42 `useQuery`
calls into screens.

### `src/lib/convex/` — the single choke point

```
src/lib/convex/
├── api.ts       re-exports api, Doc, Id from convex/_generated  ← the ONLY file that may
├── client.ts    useQueryCached, useQuery, useMutation, useAction, useQueryCachedData
├── auth.ts      useAuthenticated, useAuthActions (sign in / sign out)
└── storage.ts   convexAuthStorage — Keychain/Keystore on native, localStorage on web
```

`client.ts` earns its place over raw `convex/react` three times over:

- **`useQueryCached`** (`makeUseQueryWithStatus` over the helpers cache) returns a discriminated
  `{ status, data, error }` instead of `undefined`-means-loading, **and** holds results across
  unmounts — which is what stops every tab switch from re-fetching and flashing a spinner at
  content the user just looked at. It needs `ConvexQueryCacheProvider` mounted, which is why the
  provider tree has one.
- **Mutations and actions return `{ mutate, isLoading, isSuccess, isError }`** instead of a bare
  function, removing hand-rolled loading state from every call site. They still *throw*: loading
  state is a UI concern, but what a failure means is the caller's decision.
- **`useQueryCachedData`** caches **action** results. Queries are reactive and cached by Convex;
  actions are neither, so without this a screen re-runs its action on every mount.

`auth.ts` holds no domain queries — `useAuthenticated` and sign-in/out only. Who the user *is*
belongs to a module hook (ADR 0006). Its `isAuthenticated` requires the token **and** the client's
own flag **and** neither transition in flight: `useConvexAuth` alone flips true before the token is
readable, and a screen trusting it fires its first query a beat too early.

`storage.ts` exists for `clear()`. @convex-dev/auth leaves the refresh token behind on sign-out,
and a stale refresh token silently restores the session on next launch.

### `app/` — screens

| Allowed                  | Forbidden                          |
| ------------------------ | ---------------------------------- |
| `useLocalSearchParams`   | `useQuery` / `useMutation` / `api` |
| `<Stack.Screen options>` | domain logic, computation          |
| layout composition       | more than ~120 lines               |
| one feature-hook call    |                                    |

### `src/ui/` — the isolation that worked

```
src/ui/
├── components/     Product-agnostic: button, text, image, modal, skeleton, sheet…
├── cards/          Domain-shaped but still pure: recipe.tsx, ingredient.tsx
├── icons/
├── hooks/          use-color-scheme.ts, use-keyboard-height.ts
└── utils/          cn.ts, format.ts
```

Props are **structural**, never `Doc<'x'>` or `Id<'x'>`:

```tsx
type Props = { title: string; minutes: number; difficulty: "easy" | "medium" | "hard" };
```

Because the component declares *the shape it needs* rather than importing the backend's type, it has
**no reason** to import from `convex/` — so the isolation rule costs nothing to obey. That is the
whole mechanism, and it is why the predecessor hit **0 violations across 75 UI files**. The module
layer does the adaptation ([ADR 0002](./adr/0002-ui-isolation.md)).

### State

| Kind of state             | Home                                                    |
| ------------------------- | ------------------------------------------------------- |
| Server data               | Convex `useQuery` — reactive, no cache layer needed     |
| Cross-screen ephemeral UI | Jotai atom **inside the module's `_hooks/`**            |
| …about one household      | the same, declared with `householdAtom` ([ADR 0016](./adr/0016-household-state-resets-on-a-switch.md)) |
| Single-screen UI          | `useState`                                              |
| Form drafts               | local state, or a module atom if it survives navigation |

There is no Redux-style store and no client cache duplicating server state. That restraint is
deliberate.

---

## Enforcement

Every boundary above maps to a mechanism. This table is why the layering is expected to survive
contact with a growing codebase.

| Boundary                                                               | Mechanism                                         | Command                |
| ---------------------------------------------------------------------- | ------------------------------------------------- | ---------------------- |
| `src/ui/` isolation                                                    | ESLint R1                                         | `pnpm lint`            |
| Only `procedures.ts` touches `_generated/server`                       | ESLint R2 + complete re-export surface            | `pnpm lint`            |
| `procedures.ts` stays out of the api type cycle                        | ESLint R2b                                        | `pnpm lint`            |
| Only `src/lib/convex/api.ts` reaches the generated API                 | ESLint R3                                         | `pnpm lint`            |
| Screens do not fetch                                                   | ESLint R4                                         | `pnpm lint`            |
| Webhooks are verified                                                  | ESLint R5 + `verifiedWebhook`'s required `verify` | `pnpm lint`            |
| No empty `catch`                                                       | ESLint R6                                         | `pnpm lint`            |
| Ownership is a capability, not a call                                  | ESLint R7                                         | `pnpm lint`            |
| Export name matches its builder                                        | script C1                                         | `pnpm check:exports`   |
| Routers stay thin                                                      | script C2 (≤90 lines)                             | `pnpm check:routers`   |
| Queries use indexes; no `filter`+`paginate`                            | script C3                                         | `pnpm check:queries`   |
| `updatedAt`, indexes, cascade completeness                             | script C4                                         | `pnpm check:schema`    |
| Gated exports have a rejection test                                    | script C5                                         | `pnpm check:authtests` |
| Docs point at things that exist                                        | script C6                                         | `pnpm check:docs`      |
| Committed `_generated` matches the tree                                | script C7                                         | `pnpm check:codegen`   |
| Locales carry identical key sets, and plural call sites pass a `count` | script C8                                         | `pnpm check:i18n`      |
| No import cycles, in either project                                    | script C9                                         | `pnpm check:cycles`    |
| Every test file is collected by a runner; every `_model/` has a test   | script C10                                        | `pnpm check:tests`     |
| Derived search fields are built by one serializer                      | script C11                                        | `pnpm check:search`    |
| Every shared vocabulary entry has a word in every locale               | script C12                                        | `pnpm check:vocabulary` |
| A thread is reached only through `ownedThread` and its allowlisted callers | script C13                                    | `pnpm check:threads`   |
| Every session atom is sorted: `householdAtom`, or listed as not household | script C14                                     | `pnpm check:households` |
| Every recipe query reads live rows only (ADR 0017)                     | script C15                                        | `pnpm check:recipes`   |
| Every costly operation a cook can call is rate limited (ADR 0018)      | script C16                                        | `pnpm check:ratelimits`  |
| Commit messages follow Conventional Commits                            | commitlint                                        | `commit-msg` hook      |
| Branch names follow `<type>/<summary>`                                 | `pre-commit` hook                                 | `pre-commit` hook      |
| Ownership is checked                                                   | `ownedQuery`/`ownedMutation` type signatures      | `pnpm typecheck`       |
| Env is complete                                                        | Zod throw at module load                          | `pnpm test`            |

`pnpm verify` runs all of it. It runs in **three** places, deliberately: on demand, in the
[pre-commit](../.githooks/pre-commit) and [pre-merge-commit](../.githooks/pre-merge-commit) hooks —
so a failing commit, merge commits included, cannot be created — and in CI on every push, which is
what catches a `--no-verify` bypass.

A fourth location is **advisory, not a gate**: the Stop hook in `.claude/` runs C1–C4, C6 and C8 against
the working set at the end of an agent turn, so a violation surfaces one turn after it is written
rather than at commit time. C5 and C7 are excluded — C5 is legitimately unsatisfied mid-slice, and
C7 needs codegen that cannot be run from an editing turn. **Adding a check means adding it there
too**; nothing links the two, and a check missing from that list simply stops running early.

Rules that remain human judgement are listed, with the reason, in
[CONVENTIONS §11](./CONVENTIONS.md#11-rules-that-stay--and-why). A tag is never promoted ahead of
its mechanism.

---

## Build order

Scaffolding first, then one vertical slice at a time. Step 1 is not skippable, and step 4 is *one*
domain — the predecessor built breadth-first and got twenty dialects of the same architecture.

- [x] **1. Scaffolding** — tsconfigs, aliases, `env.ts`, `procedures.ts` (complete surface),
      R1–R6, C1–C3, CI. `pnpm verify` green on an empty repo.
- [x] **2. Doc layer** — `AGENTS.md` + nested files, `docs/CONVENTIONS.md`, this page, the ADRs.
- [x] **3. Auth** — `@convex-dev/auth` with the Password provider, `usersExtended` created by the
      `afterUserCreatedOrUpdated` callback, the `procedures.ts` merge, `Providers`, and the
      authorization test harness (C5 now requires one per gated export).
- [x] **4. UI foundations** — `theme` and the first `src/ui/components/` primitives.
- [ ] **5. First vertical slice: recipes** — thin end to end first, then deepened. The hook comes
      *first*: `modules/recipes/_hooks/useRecipes.ts` returning hardcoded, fully typed data, so the
      screen can be built against the real interface while the backend is still empty. Then
      `schema/recipes.ts` with one operation and its rejection test; then the hook's internals swap
      to the real query and the screen changes nothing; then list, pagination, mutations, empty and
      error states. Ordering the layers bottom-up instead puts five of them between the start and
      anything runnable, and the interface is discovered during wiring rather than agreed before it.
      This slice is the template every later domain copies. It is also what first makes
      `ownedQuery` / `ownedMutation` usable — `OwnedTable` resolves to `never` until those tables
      exist.
- [ ] **6. Ingredients** — proves the join-table model and the cascade.
- [ ] **7+** — storage, payments (one system), AI.

---

## Where the reasoning came from

`docs/_reference/` is a frozen audit of the predecessor project this architecture was derived from.
It is history, not documentation of Cuisko — see [_reference/README.md](./_reference/README.md).
