# Conventions — the enforceable rulebook

Read before writing a file. Naming, placement, and the patterns that are not negotiable.
The narrative behind these rules is in [ARCHITECTURE.md](./ARCHITECTURE.md); the decisions that
constrain code are in [adr/](./adr/).

**Every rule carries an enforcement tag.**

| Tag          | Meaning                                               |
| ------------ | ----------------------------------------------------- |
| 🔒 **LINT**   | ESLint fails the build                                |
| 🔬 **TYPE**   | TypeScript makes the violation impossible or an error |
| 🧪 **TEST**   | A test in CI asserts it                               |
| 📐 **SCRIPT** | A custom check in `pnpm verify` (C1–C9)               |
| 👁 **REVIEW** | Human judgement — a guideline, not a rule             |

**A rule with no tag does not exist.** If you cannot tag it, write it as a guideline (👁) and accept
that it will drift. Do not write it in bold and pretend it is binding — that is precisely how the
predecessor's documentation became untrustworthy while 58 files drifted underneath it
([_reference/02-DIVERGENCE.md](./_reference/02-DIVERGENCE.md)).

The tags below are **audited against the repo**, not aspirational — check C6 fails the build if a
rule cites a command that does not exist. Rules that remain 👁 are listed with their reason in
[§11](#11-rules-that-stay--and-why).

---

## 1. Naming

### 1.1 Files

| Location                                   | Convention                           | Example                                          | Tag           |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------------ | ------------- |
| `convex/**`                                | **camelCase**                        | `getOne.ts`, `createRecipe.ts`                   | 👁             |
| `src/ui/**`, `src/modules/**` (components) | **kebab-case**                       | `recipe-card.tsx`                                | 👁             |
| `app/**` (routes)                          | **kebab-case**                       | `saved-recipes.tsx`                              | 🔒 Expo Router |
| **Hook files, everywhere**                 | **camelCase, matching the export**   | `useRecipes.ts` exports `useRecipes`             | 👁             |
| Sub-components of **one** parent           | **dot notation**                     | `recipe-form.tsx`, `recipe-form.ingredients.tsx` | 👁             |
| Module components with **several** parents | `_components/`                       | `_components/recipe-form.tsx`                    | 👁             |
| A module's public hooks                    | `hooks.ts` at the module root        | `export { useX } from "./_hooks/useX"`           | 🔒 R8          |
| Platform variants                          | `.native.ts` / `.web.ts` / `.ios.ts` | `download.web.ts`                                | 🔒 Metro       |
| Convex step files                          | `<operation>.steps.ts`               | `createOne.steps.ts`                             | 👁             |
| Companion types of one component           | `<name>.types.ts`                    | `select.types.ts`                                | 👁             |

**The hook exception is deliberate, not an oversight.** The predecessor's docs said "kebab-case
everywhere", its code used camelCase for all 19 hook files, and the two conventions coexisted in two
different hook folders. Pick the greppable one: `useRecipes.ts` exporting `useRecipes` means the
filename and the symbol match, so searching for either finds both. **Write it down, then never mix.**

> Files with **multiple dots** (`*.test.ts`, `*.d.ts`, `*.steps.ts`) are skipped by Convex's bundler,
> which is why test and ambient-type files can live inside `convex/` without being pushed to a
> deployment.

#### A component becomes a folder at three files 👁

One or two files stay flat and use the dot notation above. **The third file makes it a folder** named
after the component, entered through `index`:

```
✅ select.tsx + select.ios.tsx                 two files — flat
✅ select/index.tsx                            three — folder
   select/index.ios.tsx
   select/types.ts
❌ select.tsx + select.ios.tsx + select.types.ts
```

Inside the folder the prefix is redundant, so companions drop it: `types.ts`, not `select.types.ts`.
Platform resolution is unaffected — Metro applies `.ios` / `.web` / `.native` to the directory's
`index` exactly as it does to a bare file.

**Call sites never change.** `@ui/*` maps to `src/ui/components/*`
([tsconfig.json](../tsconfig.json)), so `@ui/select` resolves to `select.tsx` before the move and
`select/index.tsx` after it. Nothing outside the folder knows which shape it is in — which is why the
threshold can be a judgement call (👁) rather than a script: getting it wrong costs a rename, never a
broken import.

Three, not two, because two files are still readable side by side in one directory listing; three of
them start burying the neighbours.

### 1.2 Code

| Kind                              | Convention                  | Example                 |
| --------------------------------- | --------------------------- | ----------------------- |
| React components                  | `PascalCase`                | `RecipeCard`            |
| Hooks                             | `useCamelCase`              | `useRecipes`            |
| Functions, variables              | `camelCase`                 | `scaleIngredients`      |
| Module-private helpers            | `_camelCase`                | `_normalizeUnit`        |
| Constants                         | `SCREAMING_SNAKE`           | `MAX_SERVINGS`          |
| Const arrays feeding validators   | `SCREAMING_SNAKE` plural    | `UNITS`, `CATEGORIES`   |
| Convex validators built from them | `v` + `PascalCase`          | `vUnit`, `vCategory`    |
| Types & interfaces                | `PascalCase`, no `I` prefix | `Recipe`, not `IRecipe` |

### 1.3 Convex router files — operation-based

The folder already names the resource. The file names the **operation**.

```
✅ router/recipes/getOne.ts          ❌ router/recipes/getRecipe.ts
✅ router/recipes/getPaginated.ts    ❌ router/recipes/getRecipes.ts
✅ router/recipes/createOne.ts       ❌ router/recipes/createRecipe.ts
```

| Operation                               | Meaning                                                    |
| --------------------------------------- | ---------------------------------------------------------- |
| `getOne` / `getMany` / `getPaginated`   | reads                                                      |
| `createOne` / `updateOne` / `deleteOne` | writes                                                     |
| `searchMany`                            | search-index query                                         |
| `<verb>One` / `<verb>Many`              | domain verbs: `scaleOne`, `duplicateOne`, `toggleFavorite` |

The filesystem maps directly onto the API:

```
convex/router/{domain}/{operation}.ts  →  export const {access}
                     ↓
        api.router.{domain}.{operation}.{access}
```

### 1.4 Convex indexes 📐 C3/S2

```
by_<field>[_and_<field>…]     fields in the same order as the index definition
```

```ts
.index("by_user", ["userId"])
.index("by_recipe", ["recipeId"])
.index("by_public_and_category", ["isPublic", "category"])
.searchIndex("search_title", { searchField: "title", filterFields: ["userId"] })
```

C3 asserts every index name matches its field list, and every search index is `search_<field>`.
`userId` may read as `user` or `user_id`; `isPublic` as `public` or `is_public`.

---

## 2. The export contract 📐 C1

**The closed grammar for module-level exports in `convex/router/**`:**

```
^(anon|authed|admin|server|_internal(_[a-z][a-zA-Z0-9]*)?)$
```

| Export             | Required builder                                                             | Callable by                              |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------------------- |
| `anon`             | `publicQuery` / `publicMutation` / `publicAction`                            | anyone, unauthenticated                  |
| `authed`           | `authQuery` / `authMutation` / `authAction` / `ownedQuery` / `ownedMutation` | signed-in users                          |
| `admin`            | `adminQuery` / `adminMutation` / `adminAction`                               | `role === 'ADMIN'`                       |
| `server`           | `serverQuery` / `serverMutation` / `serverAction`                            | holders of `SERVER_PRIVATE_KEY`          |
| `_internal`        | `internalQuery` / `internalMutation` / `internalAction`                      | Convex functions only                    |
| `_internal_<verb>` | same                                                                         | Convex functions only — a **named step** |

**C1 verifies the name matches the builder on every commit. This is the single most valuable check in
the repo.** The predecessor shipped `export const admin = authQuery({ args: { userId } })` twice, and
both were live IDORs: the name promised an admin check the builder never performed, `userId` came
from the caller, and nothing was looking. See [ADR 0003](./adr/0003-ownership-via-procedure.md).

### 2.1 Multi-step internals — the sanctioned escape hatch

A Convex action cannot touch the database. So one logical operation legitimately becomes several
registered functions in one file:

```ts
// convex/router/recipes/importOne.ts
export const authed = authAction({ … });                    // entry point

export const _internal_fetchPage = internalAction({ … });   // ✅ named for what it does
export const _internal_parse     = internalAction({ … });
export const _internal_persist   = internalMutation({ … });
```

> ⚠️ **Do not try to group them in an object.** Convex registers functions by scanning **top-level
> exports** for the `isQuery`/`isMutation`/`isAction` markers the builders attach. A wrapping object
> carries no marker, so `export const _internal = { parse: internalAction({…}) }` registers
> **nothing**. Each step must be its own top-level export — a platform constraint, and the reason the
> suffix form exists rather than a namespace.

**Name steps by verb, never by number.** The predecessor used `_internal_step_1`, `_internal_step1`,
`_internal_step3`, `_internal_step4` — and `_internal_step2` was missing, because a step was deleted
and nothing was renumbered. `_internal_persist` survives refactoring; `_internal_step3` does not.

**When the file exceeds 80 lines**, move the steps to a sibling:

```
router/recipes/importOne.ts          export const authed
router/recipes/importOne.steps.ts    export const _internal_fetchPage, _internal_parse, …
```

---

## 3. Layer boundaries

### 3.1 Backend

| Layer                        | May do                                                         | May **not** do                                  | Tag   |
| ---------------------------- | -------------------------------------------------------------- | ----------------------------------------------- | ----- |
| `router/`                    | validators, procedure wrappers, arg shaping, call `functions/` | >80 lines                                       | 📐 C2  |
| `router/`                    | —                                                              | loops, domain branching, domain-library imports | 👁     |
| `functions/`                 | touch `ctx.db`, domain logic, call `lib/`                      | be a registered Convex procedure                | 👁     |
| `lib/`                       | vendor SDKs, pure helpers                                      | touch `ctx.db`                                  | 👁     |
| `http/`                      | define webhooks **via `verifiedWebhook`**                      | call `httpAction` directly                      | 🔒 R5  |
| `procedures.ts`              | import `_generated/server`                                     | **import `_generated/api`** (type cycle)        | 🔒 R2b |
| everything else in `convex/` | import `_generated/api`                                        | import `_generated/server`                      | 🔒 R2  |

**The `_generated` split is subtle and is the reason the original rule collapsed** — get it right:

- `_generated/`**`server`** → **banned** outside `procedures.ts`. It has no api types, so
  `procedures.ts` can safely re-export everything from it. 🔒 R2
- `_generated/`**`api`** → **allowed everywhere except `procedures.ts`.** Router files genuinely need
  `internal` and `api`; those cannot be re-exported without creating a project-wide type cycle. 🔒 R2b

Full reasoning: [ADR 0001](./adr/0001-convex-procedures-only.md).

### 3.2 Frontend

| Layer          | May import                                                | May **not** import                                                  | Tag  |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------------- | ---- |
| `app/`         | `~/modules/*`, `@ui/*`, `expo-router`                     | `~/lib/convex/client`, `api`, `convex/react`                        | 🔒 R4 |
| `src/modules/` | anything below, and another module's **root**             | `app/`, another module's `_hooks/` or `_components/`                | 🔒 R8 |
| `src/lib/`     | vendor SDKs, `~/lib/*`                                    | `~/modules/*`, `app/`                                               | 👁    |
| `src/ui/`      | `react`, `react-native`, `@ui/*`, `theme`, animation libs | **anything Convex**, `~/modules/*`, `~/providers/*`, `translations` | 🔒 R1 |

**No import cycles anywhere.** 📐 C9 — peer modules may import each other's public roots, and a
`{domain}/hooks.ts` barrel makes a cycle easy to write and impossible to see. Metro does not fail on
one; it hands the second module a partially-initialised export, so the crash is a runtime
`undefined` on one import order and not another.

C9 rather than eslint's `import/no-cycle`, which resolves every node_modules specifier to classify
it as external and cost 16s on every `pnpm verify` to do it. C9 ignores bare specifiers, reads its
alias table out of `tsconfig.json` so it cannot drift, and runs in under half a second.

**`src/ui/` prop types are structural, never `Doc<'x'>` / `Id<'x'>`.** 🔬

```tsx
// ✅ the component describes the shape it needs → no reason to import from convex
type Props = { id: string; title: string; minutes: number; onPress?: () => void };

// ❌ couples the design system to the database schema
type Props = { recipe: Doc<'recipes'> };
```

This one technique is why the predecessor achieved **0 violations across 75 UI files**. It makes the
isolation rule free to obey, which is the only reason it survived.
See [ADR 0002](./adr/0002-ui-isolation.md) and [ADR 0006](./adr/0006-screens-never-fetch.md).

**Only `src/lib/convex/api.ts` may import `convex/_generated`.** 🔒 R3

---

### 3.3 Language 👁

**French and English are both first-class, from launch** — see
[PRODUCT.md § Bilingual by nature](./PRODUCT.md).

| Layer                  | Rule                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `translations/`        | The only home for user-facing copy. Every locale carries the same key set 📐 C8.                 |
| `src/ui/`              | Never imports `translations` — a component receives its strings as props 🔒 R1.                  |
| `app/`, `src/modules/` | Resolve the key here; pass the resulting string down.                                           |
| Generated content      | Follows the user's language, model output included. A half-translated recipe is a broken recipe. |

**Key naming.** Namespaces and groups are `PascalCase`; the text keys under them are `snake_case`.
A key whose string interpolates a value marks it with `_x_` — the key alone then tells you, at the
call site, that the string takes a variable.

```jsonc
{
  "Cellar": {                                    // namespace / group → PascalCase
    "add_item": "Add an item",                   // plain text key → snake_case
    "add_x_items": "Add {{count}} items"         // _x_ → this string takes a variable
  }
}
```

The heading stays 👁 for the half still unmechanised: nothing rejects a user-facing string literal
written straight into a component. Promote it in the commit that adds that lint rule.

---

## 4. Schema rules

| #   | Rule                                                                                      | Tag  |
| --- | ----------------------------------------------------------------------------------------- | ---- |
| S1  | Every `ctx.db.query()` is immediately followed by `.withIndex()` / `.withSearchIndex()`   | 📐 C3 |
| S2  | Indexes named `by_<field>[_and_<field>]`                                                  | 📐 C3 |
| S3  | **Never `.filter()` together with `.paginate()`** — put the predicate in the index        | 📐 C3 |
| S4  | Never store `createdAt`; `_creationTime` already exists                                   | 👁    |
| S5  | Mutable tables declare `updatedAt: v.number()`, or are marked `@immutable <reason>`       | 📐 C4 |
| S6  | Polymorphic refs use `v.union` of discriminated objects, never parallel optional FKs      | 👁    |
| S7  | Every table has ≥1 index, or is marked `@singleton <reason>`                              | 📐 C4 |
| S8  | Join tables carry `position: v.number()` when order is meaningful                         | 👁    |
| S9  | Concurrent counters use `@convex-dev/sharded-counter`                                     | 👁    |
| S10 | A foreign key ships **together with** the index its cascade needs and its `CASCADE` entry | 📐 C4 |
| S11 | Enums: `const X = [...] as const` → `v.union(...X.map(v.literal))` → `typeof X[number]`   | 👁    |

The `@immutable` / `@singleton` markers go in the table's leading comment and must carry a reason.
They are the sanctioned exemption, so an intentional exception is a visible declaration rather than
a silent gap — C4 fails on an unmarked table.

Rationale for S1/S3/S10: [ADR 0007](./adr/0007-every-query-uses-an-index.md).

**S3 is the one people get wrong.** Convex paginates the *index read*, then applies `.filter()` to
the page — so a page of 24 can return 3 documents while reporting `isDone: false`, and infinite
scroll stops early. The predecessor had the correct index defined and used `.filter()` anyway.

```ts
// ❌ short, unpredictable pages
.withIndex("by_user", q => q.eq("userId", userId))
.filter(q => q.eq(q.field("isPublic"), true))
.paginate(opts)

// ✅ the predicate is in the index
.withIndex("by_public_and_user", q => q.eq("isPublic", true).eq("userId", userId))
.paginate(opts)
```

**S6 in practice — the shape depends on whether you index it.**

```ts
// ❌ ALWAYS WRONG — nothing prevents both set, neither set, or type disagreeing with the id
{ type: v.union(v.literal("recipe"), v.literal("ingredient")),
  recipeId: v.optional(v.id("recipes")), ingredientId: v.optional(v.id("ingredients")) }

// ✅ INDEXED polymorphic ref — one field, one index, no undefined padding
{ targetType: v.union(v.literal("recipe"), v.literal("ingredient")),
  targetId:   v.union(v.id("recipes"), v.id("ingredients")) }
  // .index("by_target", ["targetId"])  ← also answers the cascade lookup

// ✅ NON-INDEXED variant data — nested discriminated union, TS narrows on .kind
source: v.union(
  v.object({ kind: v.literal("original") }),
  v.object({ kind: v.literal("imported"), url: v.string() }),
  v.object({ kind: v.literal("scanned"),  imageId: v.id("images") }),
)
```

**Why the split.** Convex *does* support dot-separated index paths (`["userId", "target.recipeId"]`)
and it typechecks against a union — but a field absent from a document is indexed as `undefined`,
which sorts before everything else. So every *ingredient* row still occupies a slot in the
`target.recipeId` index. Lookups stay correct; the index still spans the whole table, which is the
exact property the optional-FK design had. Nested unions buy write-validity and type narrowing,
**not** index selectivity. Use the flat `targetId` union whenever the field is indexed.

---

## 5. Security rules

| #   | Rule                                                                                         | Tag            |
| --- | -------------------------------------------------------------------------------------------- | -------------- |
| A1  | Env is Zod-validated and **throws at boot**. Never `?? ''` on a secret.                      | 🔬 + boot throw |
| A2  | Never gate a security check on the truthiness of its secret                                  | 👁              |
| A3  | Ownership checks go through `ownedQuery` / `ownedMutation`, never a remembered call          | 🔬              |
| A4  | `isAuthorized` is never imported by `router/` — only by `functions/`                         | 🔒 R7           |
| A5  | Webhooks are defined with `verifiedWebhook`; `verify` has no default                         | 🔒 R5 + 🔬       |
| A6  | Every `authed` / `admin` / `server` export has a test asserting the wrong caller is rejected | 📐 C5           |
| A7  | Endpoints that cost money or write on demand are rate-limited                                | 👁              |
| A8  | Never return credentials, tokens or secrets from any procedure                               | 👁              |
| A9  | Constant-time comparison for secret equality                                                 | 👁              |
| A10 | Errors are `ConvexError({ code })`, never bare `Error` with a message the UI parses          | 👁              |

ADRs: [0005](./adr/0005-env-validated-at-boot.md) (A1, A2, A9) ·
[0003](./adr/0003-ownership-via-procedure.md) (A3, A4) ·
[0004](./adr/0004-webhooks-must-verify.md) (A5).

**A2 is the rule that closes a whole class.** These three shapes are all the same bug, and the
predecessor had all three:

```ts
if (secret && provided !== secret) return 401;   // ❌ missing secret ⇒ check skipped
if (secret) { await verify(); }                  // ❌ missing secret ⇒ verification skipped
if (key !== env.KEY) throw …                     // ❌ env.KEY === '' ⇒ passing '' authenticates
```

If a secret is required, A1 has already guaranteed it exists. There is never a reason to branch on it.

---

## 6. Where does this file go?

```
Is it a React component with no data access?
├─ Product-agnostic (button, sheet, skeleton)?        → src/ui/components/
├─ Domain-shaped but pure — a card?                   → src/ui/components/cards/
├─ Domain-shaped but pure — a carousel?               → src/ui/components/carousels/
└─ Needs Convex data?                                 → src/modules/{domain}/
   ├─ One parent imports it?                          → {parent}.{name}.tsx   beside its parent
   ├─ Several parents in the module import it?        → src/modules/{domain}/_components/
   └─ Another module imports it?                      → the module ROOT (that is its public surface)

Is it a React hook?
├─ Touches a domain's Convex bindings?                → src/modules/{domain}/_hooks/
│  (as many as the domain needs — named for what they return, not after the domain)
│  └─ Another module needs to call it?                → re-export it from {domain}/hooks.ts
│                                                       the hook itself does NOT move
├─ Generic, no Convex (useDebounce)?                  → src/hooks/
└─ Presentation-only (useColorScheme)?                → src/ui/hooks/

Is it a screen?                                       → app/  (routing only — no useQuery)

Is it backend code?
├─ Callable from the client?                          → convex/router/{domain}/{operation}.ts
├─ Reusable and touches ctx.db?                       → convex/functions/{domain}/
├─ Wraps a vendor SDK, no ctx.db?                     → convex/lib/{vendor}/
├─ Uses an LLM or agent?                              → convex/agent/  (called from router/)
├─ A webhook?                                         → convex/http/  (via verifiedWebhook)
├─ Runs on a schedule?                                → convex/crons/  + schedule in crons.ts
└─ Multi-step, must survive failure?                  → convex/workflows/
```

```
Does it run in BOTH Expo and Convex?                  → shared/   (no browser/Node APIs)

Is it a table definition?                             → convex/schema/{domain}.ts

Is it user-facing copy?                               → translations/   (en + fr, keys in sync)
```

A directory is created the first time a file belongs in it — but the destination is decided here,
not per-author. See [ARCHITECTURE.md](./ARCHITECTURE.md) for what each layer may and may not do.

---

## 7. Pull-request checklist

**Backend**

- [ ] Export name matches its builder — `admin` ⇒ `admin*` 📐
- [ ] Every `ctx.db.query()` uses an index 📐
- [ ] No `.filter()` with `.paginate()` 📐
- [ ] Mutations touching a user document use `ownedMutation` 🔬
- [ ] New FK ⇒ index added **and** `CASCADE` entry added 📐
- [ ] New webhook uses `verifiedWebhook` 🔒
- [ ] New secret added to the Zod schema in `convex/env.ts` 🔬
- [ ] Router file under 80 lines 📐
- [ ] Authorization test added for each new gated export 📐

**Frontend**

- [ ] Nothing in `src/ui/` imports Convex 🔒
- [ ] Screen contains no `useQuery` 🔒
- [ ] Data access lives in the module's `_hooks/` 👁
- [ ] UI props are structural types, not `Doc<'x'>` 🔬
- [ ] Screen under ~120 lines 👁

**Always**

- [ ] `pnpm verify` passes — the pre-commit hook refuses the commit otherwise
- [ ] Reviewer sub-agent ran and reported clean, or its findings were approved 👁
- [ ] The slice's plan file is deleted; anything worth keeping was promoted to an ADR first 👁
- [ ] `docs/` updated if a layer, convention or table changed (📐 C6 catches dead links/paths only)
- [ ] No `@deprecated` code left behind — delete it, git remembers 👁
- [ ] No empty `catch {}` 🔒

---

## 8. The twelve rules that matter most

If everything else is forgotten, these prevent every 🔴 and 🟠 finding in
[_reference/03-FLAWS.md](./_reference/03-FLAWS.md):

1. **Env is Zod-validated and throws at boot.** No `?? ''`, ever.
2. **Never gate a security check on its secret being truthy.**
3. **Webhooks cannot be defined without a verifier.**
4. **Export name must match its builder** — enforced by C1.
5. **Ownership is a procedure capability, not a remembered call.**
6. **`src/ui/` never imports Convex** — enabled by structural prop types.
7. **Screens never fetch.** Data lives in `modules/*/_hooks/`.
8. **Every query uses an index; never `.filter()` with `.paginate()`.**
9. **A foreign key ships with its cascade index and `CASCADE` entry.**
10. **All Convex builders and ctx types come from `procedures.ts`** (R2). Its mirror image:
    **`procedures.ts` never imports `_generated/api`** (R2b). Two modules, two rules — treating them
    as one is what collapsed this rule before.
11. **Multi-step internals are `_internal_<verb>`, top-level, named not numbered.**
12. **`pnpm verify` runs in CI from the first commit.**

---

## 9. Rules deliberately *not* made

Written down so nobody re-litigates them, and so the omissions read as decisions rather than
oversights:

| Not a rule                          | Why                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Never use `any`"                   | Sometimes correct at a vendor boundary. Enforce `noImplicitAny` (🔬) and review the rest — a new `any` needs a comment justifying it.                                     |
| "100% test coverage"                | Coverage targets produce tests that assert nothing. The authorization suite (A6) is mandatory; the rest is judgement.                                                    |
| "Every file needs a header comment" | Comment density should match the surrounding code. Noise ages badly.                                                                                                     |
| "One export per file"               | The multi-access-level pattern is *better* than splitting: the shared handler is the point.                                                                              |
| "No barrel files"                   | `functions/*/index.ts` barrels worked well in the predecessor (13/13 domains). Keep them; avoid deep re-export chains.                                                   |

---

## 10. Commits and branches 🔒

**Conventional Commits**, enforced by the `commit-msg` hook against
[commitlint.config.js](../commitlint.config.js).

```
<type>(<scope>)?: <subject>

feat(recipes): add serving-size scaling
fix(convex): reject paginated queries that filter post-index
chore(deps): bump convex to 1.44
feat(api)!: drop the legacy wallet endpoint      ← breaking
```

| Type       | For                                             | Semver |
| ---------- | ----------------------------------------------- | ------ |
| `feat`     | a new user-visible capability                   | minor  |
| `fix`      | a bug fix                                       | patch  |
| `refactor` | production code changed, behaviour did not      | —      |
| `perf`     | performance                                     | patch  |
| `docs`     | `docs/`, comments, `AGENTS.md`                  | —      |
| `test`     | tests only                                      | —      |
| `chore`    | deps, config, tooling, regenerated `_generated` | —      |
| `ci`       | `.github/workflows`                             | —      |
| `revert`   | a revert                                        | —      |

Scope is the layer or domain: `convex`, `ui`, `recipes`, `adr`, `deps`. Optional.

- **Imperative mood, lowercase, no full stop.** "add scaling", not "Added scaling."
- **Subject ≤ 72 characters**, so `git log --oneline` stays readable.
- **Breaking changes** get `!` after the type/scope, or a `BREAKING CHANGE:` footer.

### The body is the point

Commit messages here are written by an agent and, more importantly, **read back by one** —
reconstructing why the code looks the way it does from `git log`, `git log --grep`, and
`git log -- <path>`. That reader already has the diff. What it cannot recover is intent.

So the body is not optional prose, it is the payload:

| Include                                                       | Why                                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **The trigger** — what was broken, missing, or newly required | The single highest-value sentence; nothing else in the repo records it                              |
| **What changed by layer**, not by file                        | The diff lists files. Only the author can say "the check moved from `router/` into `procedures.ts`" |
| **The governing rule** — `ADR 0003`, `C4`, `lint R7`          | Makes `git log --grep="ADR 0003"` return every commit that ever touched that decision               |
| **What was deliberately left out**                            | Absent scope is invisible in a diff and expensive to re-derive                                      |

Omit the body only when the subject is genuinely complete on its own
(`chore(deps): bump convex to 1.44`).

**One logical change per commit.** A commit doing two things cannot be described in one subject,
cannot be reverted cleanly, and degrades every later `git log --oneline`.

**Keep scopes stable** — a scope is only useful if the same concept always gets the same word:
`convex` · `ui` · `app` · `auth` · `deps` · `ci` · `docs` · `adr` · `scripts`, or a domain name
(`recipes`, `ingredients`). Prefer an existing scope over a synonym. This is 👁 for now; it becomes
a `scope-enum` rule in [commitlint.config.js](../commitlint.config.js) once the domain list settles
— enforcing it while domains are still appearing would just produce `--no-verify` habits.

**Branches** use the same vocabulary plus `hotfix/`:

```
<type>/<kebab-case-summary>        feat/recipe-scaling
                                   fix/pagination-short-pages
                                   hotfix/auth-token-expiry
```

**`hotfix` is a branch prefix and not a commit type, deliberately.** A hotfix and a fix are the
same *change* — a patch; what differs is the process around it. As a commit type it would force a
judgement at commit time ("is this urgent enough?") with no downstream consequence, and a rule
with no consequence decays. As a branch it means something real: skip the queue, cut a release.

Both hooks can be bypassed with `git commit --no-verify` — which also skips `pnpm verify`. CI does
not skip anything.

---

## 11. Rules that stay 👁, and why

What remains judgement is listed here, so that a 👁 reads as a decision rather than an omission.

Most entries are here because **no mechanism is possible** — the check would have to *be* the
judgement. A few, marked ⏳, are mechanisable and deliberately **not built yet**, because the rule
has not been exercised enough to know what the check should assert. That distinction is the point of
the column: a ⏳ is the only thing in this section that is a backlog item, and everything without one
is settled. **Never add a ⏳ for a rule you simply have not got round to** — that is how this section
would rot into a wish list, and a rule nobody intends to mechanise should say so plainly instead.

| Rule                                             | Why no mechanism                                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router files contain no loop or domain branching | C2's line cap is a proxy. A precise version would have to distinguish "a loop shaping arguments" from "a loop doing domain work", which is the judgement itself.     |
| S4 — never store `createdAt`                     | Trivially greppable, but a field legitimately named `createdAt` from an external system is not a violation.                                                          |
| S6 — polymorphic refs                            | Detectable in the easy case; the interesting cases turn on whether the field is indexed, which is a design call.                                                     |
| S8 — `position` on ordered join tables           | Requires knowing whether order is meaningful. Nothing but a human knows.                                                                                             |
| S9 — sharded counters                            | Requires knowing whether a counter is concurrently written.                                                                                                          |
| S11 — enum pattern                               | A style preference with real exceptions.                                                                                                                             |
| A2 — never branch on a secret's truthiness       | A lint rule would need to know which identifiers are secrets. A1 already makes the branch pointless.                                                                 |
| A7 — rate limiting                               | "Costs money" is not a static property.                                                                                                                              |
| A8 — never return credentials                    | Would require taint tracking.                                                                                                                                        |
| A9 — constant-time comparison                    | Same problem as A2. `timingSafeEqual` exists; using it is review.                                                                                                    |
| ⏳ A10 — `ConvexError({ code })`                  | Mostly mechanisable; not built until an error convention has been exercised by real domains.                                                                         |
| Screen ≤ ~120 lines                              | A cap would fight legitimate layout composition.                                                                                                                     |
| A cross-layer change starts with a plan          | "Crosses two layers" is the judgement itself — any mechanism deciding it would have to *be* that judgement. See [plans/README.md](./plans/README.md).                |
| ⏳ A landed slice deletes its plan file           | Mechanisable — a plan whose branch is merged is stale. Not built until the practice has run on a real slice and the check has something real to assert.              |

**The rule about this section: do not promote a tag before its mechanism exists.** A 👁 that claims
to be 📐 is worse than no rule at all, because a green `pnpm verify` then certifies something nobody
checked.
