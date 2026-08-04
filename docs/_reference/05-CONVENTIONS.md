# 05 — Conventions: The Enforceable Rulebook

> The operational companion to [04-BLUEPRINT.md](./04-BLUEPRINT.md).
> Written to be pasted into `docs/CONVENTIONS.md` of the new project and read by both humans and AI
> agents before writing any file.

**Every rule carries an enforcement tag.** This is the discipline that Predecessor lacked and that
[02-DIVERGENCE.md](./02-DIVERGENCE.md) exists to justify:

| Tag | Meaning |
|---|---|
| 🔒 **LINT** | ESLint fails the build |
| 🔬 **TYPE** | TypeScript makes the violation impossible or an error |
| 🧪 **TEST** | A test in CI asserts it |
| 📐 **SCRIPT** | A custom check in `pnpm verify` |
| 👁 **REVIEW** | Human judgement — a guideline, not a rule |

**A rule with no tag does not exist.** If you cannot tag it, write it as a guideline (👁) and accept
that it will drift. Do not write it in bold and pretend it is binding — that is exactly how
`.readme/` became untrustworthy.

---

## 1. Naming

### 1.1 Files

| Location | Convention | Example | Tag |
|---|---|---|---|
| `convex/**` | **camelCase** | `getOne.ts`, `createRecipe.ts` | 👁 |
| `src/ui/**`, `src/modules/**` (components) | **kebab-case** | `recipe-card.tsx` | 👁 |
| `app/**` (routes) | **kebab-case** | `saved-recipes.tsx` | 🔒 Expo Router |
| **Hook files, everywhere** | **camelCase, matching the export** | `useRecipes.ts` exports `useRecipes` | 👁 |
| Sub-components of one parent | **dot notation** | `recipe-form.tsx`, `recipe-form.ingredients.tsx` | 👁 |
| Platform variants | `.native.ts` / `.web.ts` / `.ios.ts` | `download.web.ts` | 🔒 Metro |
| Convex step files | `<operation>.steps.ts` | `createOne.steps.ts` | 👁 |

**The hook exception is deliberate, not an oversight.** Predecessor's docs said "kebab-case everywhere",
its code used camelCase for all 19 hook files, and the two conventions coexisted in two different hook
folders (`ui/hooks/use-color-scheme.ts` vs `hooks/useDebounce.ts`). Pick the greppable one:
`useRecipes.ts` exporting `useRecipes` means the filename and the symbol match, so searching for
either finds both. **Write it down, then never mix.**

### 1.2 Code

| Kind | Convention | Example |
|---|---|---|
| React components | `PascalCase` | `RecipeCard` |
| Hooks | `useCamelCase` | `useRecipes` |
| Functions, variables | `camelCase` | `scaleIngredients` |
| Module-private helpers | `_camelCase` | `_normalizeUnit` |
| Constants | `SCREAMING_SNAKE` | `MAX_SERVINGS` |
| Const arrays feeding validators | `SCREAMING_SNAKE` plural | `UNITS`, `CATEGORIES` |
| Convex validators built from them | `v` + `PascalCase` | `vUnit`, `vCategory` |
| Types & interfaces | `PascalCase`, no `I` prefix | `Recipe`, not `IRecipe` |

### 1.3 Convex router files — operation-based

The folder already names the resource. The file names the **operation**.

```
✅ router/recipes/getOne.ts          ❌ router/recipes/getRecipe.ts
✅ router/recipes/getPaginated.ts    ❌ router/recipes/getRecipes.ts
✅ router/recipes/createOne.ts       ❌ router/recipes/createRecipe.ts
```

| Operation | Meaning |
|---|---|
| `getOne` / `getMany` / `getPaginated` | reads |
| `createOne` / `updateOne` / `deleteOne` | writes |
| `searchMany` | search-index query |
| `<verb>One` / `<verb>Many` | domain verbs: `scaleOne`, `duplicateOne`, `toggleFavorite` |

### 1.4 Convex indexes

```
by_<field>[_and_<field>…]     fields in the same order as the index definition
```

```ts
.index("by_user", ["userId"])
.index("by_recipe", ["recipeId"])
.index("by_public_and_category", ["isPublic", "category"])
.searchIndex("search_title", { searchField: "title", filterFields: ["userId"] })
```

📐 **SCRIPT** — a check asserts every index name matches its field list. Predecessor had one index called
`status` among 90 named `by_*`.

---

## 2. The export contract 📐 **SCRIPT**

**The closed grammar for module-level exports in `convex/router/**`:**

```
^(anon|authed|admin|server|_internal(_[a-z][a-zA-Z0-9]*)?)$
```

| Export | Required builder | Callable by |
|---|---|---|
| `anon` | `publicQuery` / `publicMutation` / `publicAction` | anyone, unauthenticated |
| `authed` | `authQuery` / `authMutation` / `authAction` / `ownedQuery` / `ownedMutation` | signed-in users |
| `admin` | `adminQuery` / `adminMutation` / `adminAction` | `role === 'ADMIN'` |
| `server` | `serverQuery` / `serverMutation` / `serverAction` | holders of `SERVER_PRIVATE_KEY` |
| `_internal` | `internalQuery` / `internalMutation` / `internalAction` | Convex functions only |
| `_internal_<verb>` | same | Convex functions only — a **named step** |

**Check C1 verifies the name matches the builder on every commit.** This is the single most valuable
rule in this document: Predecessor's `export const admin = authQuery({ args: { userId } })` appeared twice
and produced two live IDORs ([03-FLAWS #F1](./03-FLAWS.md)). The name promised an admin check that the
builder never performed, and nothing caught it for the life of the project.

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
> **nothing**. Each step must be its own top-level export — this is a platform constraint, and it is
> why the suffix form exists rather than a namespace.

**Name steps by verb, never by number.** Predecessor used `_internal_step_1`, `_internal_step1`,
`_internal_step3`, `_internal_step4` — and `_internal_step2` is missing from
`router/admin/storage/images/replaceOneMutationInternal.ts` because a step was deleted and nothing was
renumbered. `_internal_persist` survives refactoring; `_internal_step3` does not.

**When the file exceeds 80 lines**, move the steps to a sibling:

```
router/recipes/importOne.ts          export const authed
router/recipes/importOne.steps.ts    export const _internal_fetchPage, _internal_parse, …
```

---

## 3. Layer boundaries

### 3.1 Backend

| Layer | May do | May **not** do | Tag |
|---|---|---|---|
| `router/` | validators, procedure wrappers, arg shaping, call `functions/` | loops, domain branching, domain-library imports, >80 lines | 📐 |
| `functions/` | touch `ctx.db`, domain logic, call `lib/` | be a registered Convex procedure | 👁 |
| `lib/` | vendor SDKs, pure helpers | touch `ctx.db` | 👁 |
| `llm/` | import `ai` / `@convex-dev/agent` | be imported by `ui/` | 🔒 |
| `http/` | define webhooks **via `verifiedWebhook`** | call `httpAction` directly | 🔒 R5 |
| `procedures.ts` | import `_generated/server` | **import `_generated/api`** (type cycle) | 🔒 R2b |
| everything else in `convex/` | import `_generated/api` | import `_generated/server` | 🔒 R2 |

**The `_generated` split is subtle and is the reason the original rule collapsed** — get it right:

- `_generated/**server**` → **banned** outside `procedures.ts`. It has no api types, so
  `procedures.ts` can safely re-export everything from it. 🔒 R2
- `_generated/**api**` → **allowed everywhere except `procedures.ts`.** Router files genuinely need
  `internal` and `api`; those cannot be re-exported without creating the project-wide type cycle
  described in [04-BLUEPRINT §3.2](./04-BLUEPRINT.md). 🔒 R2b

### 3.2 Frontend

| Layer | May import | May **not** import | Tag |
|---|---|---|---|
| `app/` | `~/modules/*`, `@ui/*`, `expo-router` | `~/lib/convex/client`, `api`, `useQuery` | 🔒 R4 |
| `src/modules/` | anything below | `app/` | 👁 |
| `src/lib/` | vendor SDKs, `~/lib/*` | `~/modules/*`, `app/` | 👁 |
| `src/ui/` | `react`, `react-native`, `@ui/*`, `theme`, animation libs | **anything Convex**, `~/modules/*`, `~/providers/*`, `translations` | 🔒 R1 |

**`src/ui/` prop types are structural, never `Doc<'x'>` / `Id<'x'>.** 🔬 **TYPE**

```tsx
// ✅ the component describes the shape it needs → no reason to import from convex
type Props = { id: string; title: string; minutes: number; onPress?: () => void };

// ❌ couples the design system to the database schema
type Props = { recipe: Doc<'recipes'> };
```

This one technique is why Predecessor achieved **0 violations across 75 UI files**. It makes the isolation
rule free to obey, which is the only reason it survived.

**Only `src/lib/convex/api.ts` may import `convex/_generated`.** 🔒 R3

---

## 4. Schema rules

| # | Rule | Tag |
|---|---|---|
| S1 | Every `ctx.db.query()` is immediately followed by `.withIndex()` / `.withSearchIndex()` | 📐 |
| S2 | Indexes named `by_<field>[_and_<field>]` | 📐 |
| S3 | **Never `.filter()` together with `.paginate()`** — put the predicate in the index | 📐 |
| S4 | Never store `createdAt`; `_creationTime` already exists | 👁 |
| S5 | Mutable tables declare `updatedAt: v.number()` | 🧪 |
| S6 | Polymorphic refs use `v.union` of discriminated objects, never parallel optional FKs | 👁 |
| S7 | Every table has ≥1 index, or a comment declaring it a singleton | 🧪 |
| S8 | Join tables carry `position: v.number()` when order is meaningful | 👁 |
| S9 | Concurrent counters use `@convex-dev/sharded-counter` | 👁 |
| S10 | A foreign key is added **together with** the index its cascade needs, and a `CASCADE` entry | 🧪 |
| S11 | Enums: `const X = [...] as const` → `v.union(...X.map(v.literal))` → `typeof X[number]` | 👁 |

**S3 is the one people get wrong.** Convex paginates the *index read*, then applies `.filter()` to the
page — so a page of 24 can return 3 documents while reporting `isDone: false`, and infinite scroll
stops early. Predecessor had the correct index defined and used `.filter()` anyway
([03-FLAWS #F12](./03-FLAWS.md)).

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

**Why the split.** Convex *does* support dot-separated index paths (`["userId",
"target.recipeId"]`) and it typechecks against a union — but a field absent from a document is
indexed as `undefined`, which sorts before everything else. So every *ingredient* row still occupies
a slot in the `target.recipeId` index. Lookups stay correct; the index still spans the whole table,
which is the exact property the optional-FK design had. Nested unions buy write-validity and type
narrowing, **not** index selectivity. Use the flat `targetId` union whenever the field is indexed.

---

## 5. Security rules

| # | Rule | Tag |
|---|---|---|
| A1 | Env is Zod-validated and **throws at boot**. Never `?? ''` on a secret. | 🔬 |
| A2 | Never gate a security check on the truthiness of its secret | 👁 |
| A3 | Ownership checks go through `ownedQuery` / `ownedMutation`, never a remembered call | 🔬 |
| A4 | `isAuthorized` is never called from `router/` — only from `functions/` | 🔒 |
| A5 | Webhooks are defined with `verifiedWebhook`; `verify` has no default | 🔒 R5 + 🔬 |
| A6 | Every non-`anon` export has a test asserting the wrong caller is rejected | 🧪 |
| A7 | Endpoints that cost money or write on demand are rate-limited | 👁 |
| A8 | Never return credentials, tokens or secrets from any procedure | 👁 |
| A9 | Constant-time comparison for secret equality | 👁 |
| A10 | Errors are `ConvexError({ code })`, never bare `Error` with a message the UI parses | 👁 |

**A2 is the rule that closes a whole class.** These three shapes are all the same bug, and Predecessor had
all three ([03-FLAWS #F3](./03-FLAWS.md)):

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
├─ Domain-shaped but pure (recipe card)?              → src/ui/cards/
└─ Needs Convex data?                                 → src/modules/{domain}/

Is it a React hook?
├─ Owns a domain's Convex bindings?                   → src/modules/{domain}/_hooks/use{Domain}.ts
├─ Generic, no Convex (useDebounce)?                  → src/hooks/
└─ Presentation-only (useColorScheme)?                → src/ui/hooks/

Is it a screen?                                       → app/  (routing only — no useQuery)

Is it backend code?
├─ Callable from the client?                          → convex/router/{domain}/{operation}.ts
├─ Reusable and touches ctx.db?                       → convex/functions/{domain}/
├─ Wraps a vendor SDK, no ctx.db?                     → convex/lib/{vendor}/
├─ Uses an LLM?                                       → convex/llm/  (called from router/)
├─ A webhook?                                         → convex/http/  (via verifiedWebhook)
├─ Runs on a schedule?                                → convex/crons/  + schedule in crons.ts
└─ Multi-step, must survive failure?                  → convex/workflows/

Does it run in BOTH Expo and Convex?                  → shared/   (no browser/Node APIs)

Is it a table definition?                             → convex/schema/{domain}.ts
```

---

## 7. Pull-request checklist

**Backend**

- [ ] Export name matches its builder — `admin` ⇒ `admin*` 📐
- [ ] Every `ctx.db.query()` uses an index 📐
- [ ] No `.filter()` with `.paginate()` 📐
- [ ] Mutations touching a user document use `ownedMutation` 🔬
- [ ] New FK ⇒ index added **and** `CASCADE` entry added 🧪
- [ ] New webhook uses `verifiedWebhook` 🔒
- [ ] New secret added to the Zod schema in `convex/env.ts` 🔬
- [ ] Router file under 80 lines 📐
- [ ] Authorization test added for each new non-`anon` export 🧪

**Frontend**

- [ ] Nothing in `src/ui/` imports Convex 🔒
- [ ] Screen contains no `useQuery` 🔒
- [ ] Data access lives in the module's `_hooks/` 👁
- [ ] UI props are structural types, not `Doc<'x'>` 🔬
- [ ] Screen under ~120 lines 👁

**Always**

- [ ] `pnpm verify` passes
- [ ] `docs/` updated if a layer, convention or table changed 📐
- [ ] No `@deprecated` code left behind — delete it, git remembers 👁
- [ ] No empty `catch {}` 🔒

---

## 8. The twelve rules that matter most

If everything else is forgotten, these prevent every 🔴 and 🟠 finding in
[03-FLAWS.md](./03-FLAWS.md):

1. **Env is Zod-validated and throws at boot.** No `?? ''`, ever. → F3
2. **Never gate a security check on its secret being truthy.** → F3
3. **Webhooks cannot be defined without a verifier.** → F2
4. **Export name must match its builder** — enforced by script. → F1
5. **Ownership is a procedure capability, not a remembered call.** → F1, F6
6. **`src/ui/` never imports Convex** — enabled by structural prop types. → the rule that worked
7. **Screens never fetch.** Data lives in `modules/*/_hooks/`. → F20
8. **Every query uses an index; never `.filter()` with `.paginate()`.** → F9, F10, F12
9. **A foreign key ships with its cascade index and `CASCADE` entry.** → F15
10. **All Convex builders and ctx types come from `procedures.ts`** — nothing else imports
    `_generated/**server**` (R2). Its mirror image: **`procedures.ts` never imports
    `_generated/**api**`** (R2b), which is the only real type cycle. Two modules, two rules — treating
    them as one is what collapsed this rule in Predecessor. → F8
11. **Multi-step internals are `_internal_<verb>`, top-level, named not numbered.** → F17
12. **`pnpm verify` runs in CI from the first commit.** → F7, and everything above

---

## 9. Rules deliberately *not* made

Written down so nobody re-litigates them, and so the omissions read as decisions rather than
oversights:

| Not a rule | Why |
|---|---|
| "Never use `any`" | Sometimes correct at a vendor boundary. Enforce `noImplicitAny` (🔬) and review the rest. |
| "100% test coverage" | Coverage targets produce tests that assert nothing. The authorization suite (A6) is mandatory; the rest is judgement. |
| "Every file needs a header comment" | Comment density should match the surrounding code. Noise ages badly. |
| "One export per file" | Predecessor's multi-access-level pattern is *better* than splitting: the shared handler is the point. |
| "No barrel files" | `functions/*/index.ts` barrels worked well in Predecessor (13/13 domains). Keep them; avoid deep re-export chains. |
| "i18n everything" | Either enforce from screen one or do not install it. See [04-BLUEPRINT §5.7](./04-BLUEPRINT.md) — recommendation is English-only until a second market is real. |
