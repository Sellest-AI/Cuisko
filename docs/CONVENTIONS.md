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
| 📐 **SCRIPT** | A custom check in `pnpm verify` (C1–C16)              |
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
| A module's screens                         | **named for what they do**           | `list-screen.tsx`, `editor-screen/index.tsx`     | 👁             |
| Module components with **several** parents | `_components/`                       | `_components/recipe-form.tsx`                    | 👁             |
| A module's public hooks                    | `hooks.ts` at the module root        | `export { useX } from "./_hooks/useX"`           | 🔒 R8          |
| Platform variants                          | `.native.ts` / `.web.ts` / `.ios.ts` | `download.web.ts`                                | 🔒 Metro       |
| Convex Node-runtime half of an operation   | `<operation>Node.ts`                 | `importOneNode.ts`                               | 📐 C2          |
| Companion types of one component           | `<name>.types.ts`                    | `select.types.ts`                                | 👁             |
| Test of anything, `_model/` included       | `__tests__/<subject>.test.ts`        | `step.ts` → `__tests__/step.test.ts`             | 📐 C10         |

**The hook exception is deliberate, not an oversight.** The predecessor's docs said "kebab-case
everywhere", its code used camelCase for all 19 hook files, and the two conventions coexisted in two
different hook folders. Pick the greppable one: `useRecipes.ts` exporting `useRecipes` means the
filename and the symbol match, so searching for either finds both. **Write it down, then never mix.**

> Files with **multiple dots** (`*.test.ts`, `*.d.ts`, `*.config.ts`) are skipped by Convex's
> bundler, which is why test and ambient-type files can live inside `convex/` without being pushed
> to a deployment. The rule is `(base.match(/\./g) || []).length > 1` in `entryPoints()`
> (`node_modules/convex/dist/cjs/bundler/index.js`), and it skips at `logVerbose` level — a
> registered function in such a file is dropped **silently**, and only fails when something calls it.
> `scripts/checks/c7-generated-api.mjs` encodes the same list.

#### A module names its screens for what they do 👁

**One screen, and it is `screen.tsx`.** The module has nothing to disambiguate, and the name says
the only true thing about it: this is the screen.

**Several screens, and each is named for its behaviour** — `list-screen.tsx`, `editor-screen/`,
`step-by-step-screen/`. Keeping one of them as the generic `screen.tsx` because it happens to sit
behind the module's index route is what the rule exists to stop: in a module with four screens,
`screen.tsx` no longer identifies one, and the reader has to open it to find out which.

```
✅ account/screen.tsx                      one screen — nothing to distinguish
✅ home/screen/index.tsx                   one screen, three parts or more — a folder, still `screen`
✅ recipes/list-screen.tsx                 four screens — each says which
   recipes/editor-screen/index.tsx
   recipes/step-by-step-screen/index.tsx
❌ recipes/screen.tsx + recipes/editor-screen.tsx
```

The `-screen` suffix is what separates a screen from a component sitting beside it at the module
root: `weekly-plan.tsx` is a component `home/` renders, `list-screen.tsx` is a route's destination.

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

#### The same threshold applies to hooks — the folder becomes a sub-module 👁

A hook file that grows a second and third export is the same situation as the component above, and
gets the same answer: a folder named for what the hooks are *about*, entered through `index`. Inside
it, one hook per file, each camelCase matching its export — so the rule in the table above holds
literally, rather than acquiring an exception.

```
✅ modal-sheet/index.ts                    the barrel — the only door
   modal-sheet/state.ts                    the atom the three share; NOT re-exported
   modal-sheet/useMeasuredModalSheet.ts
   modal-sheet/useDeclaredModalSheet.ts
   modal-sheet/useModalSheetFrameHeight.ts
❌ modal-sheet.tsx exporting all three, with the atom above them
```

**The barrel is the door, and the shared state is what it keeps out.** Several hooks over one atom,
ref or context need somewhere to keep it; inside a folder that is `state.ts`, which `index.ts`
deliberately does not re-export. Know the trade before you take it: in a flat file the atom is a
module-scoped `const` that nothing can import, and splitting *forces* you to export it so the hook
files can share it. What the barrel buys is the naming rule holding literally and each hook being
findable by filename; what it costs is that the atom's privacy stops being a language guarantee and
becomes a convention — a deep import of `modal-sheet/state` compiles, and no lint rule stops it. Take
the folder at three hooks, as with components. Below that the flat file is genuinely stricter.

**A sub-module carries the same shape as a module**, one level down — it may grow its own
`_components/`, `_hooks/` and `_model/` on exactly the rules its parent follows. See
[`src/modules/AGENTS.md`](../src/modules/AGENTS.md) for the full contract; `modal-sheet/` is the
small end of it and `planning/tunnel/` the large.

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

### 1.5 Tests 📐 C10 · [ADR 0008](./adr/0008-tests-are-layered.md)

**Two Vitest projects, because the code has two runtimes.** A test's location decides which one
runs it, so location is not a matter of taste:

| Project  | Environment                    | Collects                 | For                                                                   |
| -------- | ------------------------------ | ------------------------ | --------------------------------------------------------------------- |
| `convex` | `edge-runtime` + `convex-test` | `convex/**`, `shared/**` | backend functions, and the rejection tests C5 requires                |
| `app`    | `jsdom` + `react-native-web`   | `src/**`, `app/**`       | `_model/` logic, hooks mounted with `renderHook`, components rendered |

A `.tsx` test only runs in the `app` project. Putting one under `convex/` does not fail — it is
**silently never collected**, which is why C10 asks Vitest itself which files it claims and fails
on any test file no project picked up.

**Where the file goes — `__tests__/` beside the subject. No exceptions.** 📐 C10

```
convex/router/cellars/addToCellar.ts   → convex/router/cellars/__tests__/addToCellar.test.ts
src/modules/recipes/_model/step.ts     → src/modules/recipes/_model/__tests__/step.test.ts
shared/recipes.ts                      → shared/__tests__/recipes.test.ts
```

`_model/` and `_hooks/` co-located until C10 gained rule 3; they do not any more. The rule is
mechanical on purpose — given a path there is exactly one legal place for its test, so a reviewer
never needs an opinion, and neither "once the folder gets crowded" nor "except in `_model/`" is a
thing anyone has to remember.

**Mandatory, everything else is judgement:**

- every file in `src/modules/*/_model/` has a test in that folder's `__tests__/` 📐 C10
- every access-gated Convex export has a rejection test 📐 C5
- every `convex-test` file that calls through `api.` / `internal.` preloads its module in a
  `beforeAll` — the glob is lazy, and the first test would otherwise pay the import against its
  own timeout ([ADR 0008](./adr/0008-tests-are-layered.md), "The first test pays for the import") 📐 C10

**A test for a reported bug** (the rule and the report format: `AGENTS.md`, "Tests" 👁). Write it
around what the user saw, not the code path: the number on the screen, before and after. Assert
the invariant ("buying N reduces toBuy by exactly N") over the intermediate values. A defect once
shipped green because the tests checked lines, receipts and the cellar separately, so nothing
caught a purchase counted twice. Where the fix replaces wrong behaviour, keep the old output as an
explicit counter-example, so the file records what the bug was.

Coverage targets are not a rule ([§9](#9-rules-deliberately-not-made)). What replaces them is
altitude: assert a domain rule against a plain object in `_model/`, and spend a mount only on what
a mount can see — that a hook's write reaches the state its read subscribes to.

`test/setup.dom.ts` carries the browser APIs jsdom omits, and nothing else. A fake for one of our
own modules belongs in the test that needs it, where a reader can see it.

### 1.6 Known limitations — `@limitation` 👁

**A known choice, taken with its downside and accepted** is declared with an `@limitation` block
tag in the doc comment of the code that makes it — a behaviour bounded on purpose, a side effect,
a case not handled, a cost paid for something worth more. It is not always a flaw; it is always
deliberate. TSDoc has no standard tag for this; `@remarks` hides it among ordinary prose and
`@todo` reads as unfinished work. `grep -rn "@limitation"` lists every one in the repo.

**Two kinds, told apart by the first words:**

- **a trade we would reverse if it got cheap** — the downside is real and a fix is wanted
  someday. It carries the four parts below.
- **a design choice we mean to keep** (latency paid for correctness, a value hard-coded until
  someone asks to vary it) — opens with `Design choice:` so nobody reads it as waiting on a fix,
  and needs only what it costs and why:
  `@limitation Design choice: resolving the ingredients is inside that wait, so creating is slower.`

The first kind carries four things, so the next reader does not rediscover them:

```ts
/**
 * Merges the catalog's aliases with the learned ones.
 *
 * @limitation The seed can no longer REMOVE an alias: a word deleted from the catalog is
 * re-emitted on every seed. **Accepted because** the alternative erased the learned cache.
 * **Until fixed**, remove the alias by hand against the deployment. **The fix** is a second
 * `learnedAliases` column the seed never writes — a schema change, so not this slice.
 */
```

- **the downside**, from the outside — the first sentence, readable alone;
- **why it is accepted** — the cost of the alternative, or the worse failure it avoids;
- **the workaround** until it changes, if there is one;
- **the fix**, when it is known, so reversing it starts from a plan rather than a rediscovery.

**The tag goes last in the comment.** A TSDoc block tag runs until the next tag, so any
paragraph written after it reads as part of the limitation. Two limitations in one place are two
tags.

**Pin it where you can.** A test asserting today's accepted behaviour, named for it —
`"limitation: still splits en conserve"` — turns red the day someone changes it, and the
existing-assertion rule ([AGENTS.md](../AGENTS.md), "Tests") then makes the change a stated
decision rather than a surprise. Lifting a limitation deletes the tag and rewrites that test in the
same commit.

---

## 2. The export contract 📐 C1

**The closed grammar for module-level exports in `convex/router/**`:**

```
^(anon|authed|admin|server|_internal(_[a-z][a-zA-Z0-9]*)?)$
```

| Export             | Required builder                                                                                                      | Callable by                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `anon`             | `publicQuery` / `publicMutation` / `publicAction`                                                                     | anyone, unauthenticated                  |
| `authed`           | `authQuery` / `authMutation` / `authAction` / `ownedQuery` / `ownedMutation` / `householdQuery` / `householdMutation` | signed-in users                          |
| `admin`            | `adminQuery` / `adminMutation` / `adminAction`                                                                        | `role === 'ADMIN'`                       |
| `server`           | `serverQuery` / `serverMutation` / `serverAction`                                                                     | holders of `SERVER_PRIVATE_KEY`          |
| `_internal`        | `internalQuery` / `internalMutation` / `internalAction`                                                               | Convex functions only                    |
| `_internal_<verb>` | same                                                                                                                  | Convex functions only — a **named step** |

Most builders above have an `*I18n` sibling (`publicQueryI18n`, `authMutationI18n`,
`ownedQueryI18n`, `householdQueryI18n`, `householdMutationI18n`). `server*` and `internal*` do
not. A new sibling goes beside the others in `procedures.ts` and into `ALLOWED_BUILDERS` in
`scripts/checks/c1-export-contract.mjs`. **`scripts/checks/c1-export-contract.mjs` is the authority
on this list, not this table.** The plain builder takes no locale
and exposes no `ctx.i18n`; the `I18n` variant adds a required `locale` arg and `ctx.i18n.resolve`
for reading `Localized` fields. Use the plain one unless the handler actually reads translated
content — most don't, and forcing a `locale` arg on them would be dead weight at every call site.

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

### 2.2 `<operation>Node.ts` — the runtime split, and the only reason to split 📐 C2

A second file for one operation is justified by **`"use node"`, and by nothing else.**

Convex decides the runtime **per module** — `determineEnvironment` in the bundler, called once per
entry point — and the Node runtime hosts only actions. So an operation that needs a Node API *and*
must persist what it produced cannot be one file.

**The split is directional: the Node half is what moves out, and it holds nothing else.**

```
router/recipes/importOne.ts                    →  export const authed, _internal_persist
router/recipes/importOneNode.ts   "use node"   →  export const _internal_parse
```

`importOne.ts` stays in the isolate runtime and keeps the entry point and every mutation.
`importOneNode.ts` carries the directive and only the actions that genuinely need Node. **The entry
point never has to move** — an isolate action reaches a Node one through `ctx.runAction`, so the
client-facing export stays with the rest of the operation, and the Node bundle stays as small as the
one thing that forced it.

Named for the runtime rather than for "the other steps", because the runtime is what a future reader
must not undo. `importOneSteps.ts` invites being merged back; `importOneNode.ts` says why it cannot
be.

**One dot in the filename, deliberately.** `importOne.node.ts` has two, which is exactly what the
note in §1 says the bundler drops. Those exports would never register, the module would be absent
from `internal.router.recipes`, and nothing would say so until a call failed in production — C1, C2,
C7 and `tsc` all stay green, because the generated API is derived from the same filtered tree.

> ⚠️ **A router file over 90 lines is not a reason to make one.** That is domain logic sitting a
> layer too high; it belongs in `functions/`, and a sibling file only moves the violation. C2 fails
> a `*Node.ts` that does not declare `"use node"`, and fails an `<operation>.ts` that declares it
> while a `*Node.ts` sibling exists — so the escape hatch cannot be borrowed for the line cap, and
> the half that moved cannot quietly become the whole operation.

---

## 3. Layer boundaries

### 3.1 Backend

| Layer                        | May do                                                         | May **not** do                                  | Tag   |
| ---------------------------- | -------------------------------------------------------------- | ----------------------------------------------- | ----- |
| `router/`                    | validators, procedure wrappers, arg shaping, call `functions/` | >90 lines                                       | 📐 C2  |
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
| `src/modules/` | anything below, and another module's **root**             | `app/`, another module's `_hooks/`, `_components/` or `_model/`     | 🔒 R8 |
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

**A bundled image is a static `import`, never a `require()`.** 👁

```ts
// ✅ resolves under Metro AND under Vitest
import saucepan from "assets/images/cuisko/cuisko-saucepan.webp";

// ❌ typechecks, ships, and takes down every test that reaches this module
const saucepan = require("assets/images/cuisko/cuisko-saucepan.webp");
```

`require()` is Node's CJS resolver under Vitest, and it reads neither the `paths` block in
`tsconfig.json` nor the alias list in `vitest.config.mts`. So a `require()`d asset does not fail
where it is written — it fails in every test that transitively imports that module, with
`Cannot find module` naming a file the test never mentions. Expo types `require()` as `any`, which
is why nothing catches it earlier.

A static import needs the declarations in `assets/images.d.ts`, which type an asset as
`number | string` because the two bundlers disagree and both are right: Metro resolves one to a
numeric registry id, Vite to a URL string. `expo-image` accepts either.

---

### 3.3 Language 👁

**French and English are both first-class, from launch** — see
[PRODUCT.md § Bilingual by nature](./PRODUCT.md).

| Layer                  | Rule                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `translations/`        | The only home for user-facing copy. Every locale carries the same keys 📐 C8 — plurals excepted. The words for a `shared/` vocabulary live in `Vocabulary.*`, one key per entry 📐 C12. |
| `src/ui/`              | Never imports `translations` — a component receives its strings as props 🔒 R1.                   |
| `app/`, `src/modules/` | Resolve the key here; pass the resulting string down.                                            |
| Generated content      | Follows the user's language, model output included. A half-translated recipe is a broken recipe. |

**A stored vocabulary token is English; the word a cook reads is a translation key.** That much is
S11, and it costs nothing for tags, diets and cuisines because the user TAPS a chip — nothing is
typed, so nothing has to be understood on the way in. `UNITS` is the first vocabulary a cook also
*types*, and it needs the other half of the rule: **input accepts a per-language spelling and
normalises it to the stored token before anything stores it.**

```ts
// shared/ingredients.ts
const UNIT_ALIASES = new Map<string, Unit>([["cs", "tbsp"], ["cc", "tsp"]]);

normalizeUnit("cs")  // → "tbsp", the STORED code. Never the caller's own string.
```

**A `Map`, not an object literal.** The table is asked about whatever a person typed or a deep link
carried, and an object answers for `Object.prototype` too: `aliases["constructor"]` is a function,
which is truthy, so the value reaches a caller that then indexes a total `Record<Unit, …>` with it
and throws. A `Map` has no such keys to reach.

The codes went English because `cc` is not merely unfamiliar to a language model, it is *familiar
and wrong* — the cubic centimetre, 1 ml. A recipe came back asking for `15 cc` of brown sugar; the
catalog weighs `cc` at 5 ml, so that line reached the plate as fifteen teaspoons, five times what
the cook wrote, and nothing flagged it. A prompt sentence can argue with a wrong prior but cannot
remove it.

**A normaliser, never a type guard**, and that shape is forced rather than chosen. A guard narrows
the string the caller already holds and hands it back, so `isUnit("cs")` returning true writes
`"cs"` into a mutation whose `vUnit` no longer carries that literal: the search bar accepts a word
and the save fails. Callers use the returned token. Every alias in the table is a spelling the app
itself once stored, so deleting it as dead French is deleting a word the app taught people to type.

**Key naming.** Namespaces and groups are `PascalCase`; the text keys under them are `snake_case`.
A key whose string interpolates a value marks it with `_x_` — the key alone then tells you, at the
call site, that the string takes a variable.

```jsonc
{
  "Cellar": {                                    // namespace / group → PascalCase
    "add_item": "Add an item",                   // plain text key → snake_case
    "added_x_name": "{{name}} is in the cellar"  // _x_ → this string takes a variable
  }
}
```

**Plurals.** A counted string is one key per plural category **of its own locale**, suffixed with
the CLDR category name. The locales do *not* carry the same suffixes, and that is the point:

```jsonc
// en — English has two categories
"to_buy_x_items_one":   "{{count, number}} item to buy",
"to_buy_x_items_other": "{{count, number}} items to buy"

// fr — French has three
"to_buy_x_items_one":   "{{count, number}} article à acheter",
"to_buy_x_items_many":  "{{count, number}} d'articles à acheter",
"to_buy_x_items_other": "{{count, number}} articles à acheter"
```

**`many` is not "a lot".** It is a CLDR category, and in French it means *millions* — `300` selects
`other`, `1000000` selects `many`. That is why the French `many` form carries the elision (*un
million **de** produits*) and the others do not. Read the category as a rule, never as a quantity.

`, number` runs the count through `Intl.NumberFormat` for the active locale — `1 000 000` in
French, `1,000,000` in English. Use it on **every** form of a family or none: the form most likely
to be forgotten is `many`, which is the only one whose number is large enough for grouping to
matter.

Call it by the **base name** — `t("QuickAccess.to_buy_x_items", { count })`. `TranslationKeys` in
`translations/types.ts` strips the suffixes, so a family is one key at the call site and naming a
form directly is a type error. Two rules make that hold, and 📐 C8 enforces both:

- **The counted variable is always `count`.** i18next picks the form from that property and from
  nothing else, so `t(key, { n })` finds no form and renders the key itself on screen. C8's
  assertion 6 reads `src/` and `app/` to check this — it cannot be checked in `translations/`,
  because a form is allowed to omit the number entirely ("One item to buy").
- **Never end an ordinary key with a category name** — `_zero` `_one` `_two` `_few` `_many`
  `_other`. `translations/types.ts` and C8 both read that suffix as proof of a plural and neither
  looks deeper, so a stray `step_one` is reported as a family missing its other forms.

Give a locale one category too few and i18next finds no form, falls through to `fallbackLng`, and
renders **English at a French user** — at `count: 1000000`, which no test would think to try. French
needs `_many` and English has no such category, so comparing key sets literally would call the
correct French wrong and the broken French right. C8 therefore measures each locale against
`Intl.PluralRules` rather than against `en`.

The heading stays 👁 for the half still unmechanised: nothing rejects a user-facing string literal
written straight into a component. Promote it in the commit that adds that lint rule.

---

## 4. Schema rules

| #   | Rule                                                                                            | Tag  |
| --- | ----------------------------------------------------------------------------------------------- | ---- |
| S1  | Every `ctx.db.query()` is immediately followed by `.withIndex()` / `.withSearchIndex()`         | 📐 C3 |
| S2  | Indexes named `by_<field>[_and_<field>]`                                                        | 📐 C3 |
| S3  | **Never `.filter()` together with `.paginate()`** — put the predicate in the index              | 📐 C3 |
| S4  | Never store `createdAt`; `_creationTime` already exists                                         | 👁    |
| S5  | Mutable tables declare `updatedAt: v.number()`, or are marked `@immutable <reason>`             | 📐 C4 |
| S5b | A join table **never** declares `updatedAt` — nothing on the row can change                     | 📐 C4 |
| S6  | Polymorphic refs use `v.union` of discriminated objects, never parallel optional FKs            | 👁    |
| S7  | Every table has ≥1 index, or is marked `@singleton <reason>`                                    | 📐 C4 |
| S8  | Join tables carry `position: v.number()` when order is meaningful                               | 👁    |
| S9  | Concurrent counters use `@convex-dev/sharded-counter`                                           | 👁    |
| S10 | A foreign key ships **together with** the index its cascade needs and its `CASCADE` entry       | 📐 C4 |
| S11 | Enums: `const X = [...] as const` → `v.union(...X.map(v.literal))` → `typeof X[number]`         | 👁    |
| S12 | A field a model writes whose value is a locale-dependent word is a closed vocabulary (S11)      | 👁    |
| S13 | A closed vocabulary fixed **outside** this app is `v.array` of literals on the row, not a table | 👁    |
| S14 | A field whose emptiness is a CLAIM is optional, so `undefined` ≠ `[]` — never a second flag     | 👁    |

The `@immutable` / `@singleton` markers go in the table's leading comment and must carry a reason.
They are the sanctioned exemption, so an intentional exception is a visible declaration rather than
a silent gap — C4 fails on an unmarked table.

**S5b needs no marker: C4 derives it from the shape.** A table whose fields are two or more
`v.id()` foreign keys — plus at most a `position` (S8) — is a join table, and its rows are
asserted or retracted, never edited. An `updatedAt` there would record the moment of the insert and
never change again, so C4 rejects the field rather than exempting the table.

Rationale for S1/S3/S10: [ADR 0007](./adr/0007-every-query-uses-an-index.md).
Rationale for S12: [ADR 0010](./adr/0010-a-model-returns-names-not-ids.md).
Rationale for S15/S16: [ADR 0011](./adr/0011-derived-search-fields-have-one-sanitizer.md).

**S16 is the one with teeth.** A search expression matches ANY of its terms and ranks the rest, so
`search("pepper vegan")` returns pork stews — lower down, but returned, and inside a 1024-result
scan budget the rarer term dominates. Filtering afterwards removes what came back and cannot recover
what did not, so the cook silently sees fewer recipes than exist. A `filterField` narrows candidates
inside the scan and matches exactly. Convex documents relevance order as "subject to change", which
settles it: a dietary guarantee cannot rest on a ranking the vendor may re-tune. Tokenization is the
second half — `SimpleTokenizer` splits on punctuation, so `gluten-free` indexes as `gluten` + `free`
and that `free` is shared with `nut-free` and `dairy-free`.

**S13 — the test is who owns the list, not how many rows it has.** `ingredients.allergens` was
first built as an `allergens` table plus an `ingredientAllergens` join, on the reasoning that an
array of `v.id()` cannot be cascaded. True, and irrelevant: the fourteen allergens are fixed by EU
regulation 1169/2011, so they are literals like `CATEGORIES` and `UNITS`, there is no table, and
nothing needs cascading. A table buys a renameable, translatable row — worth it for data the app
owns, never for a list someone else maintains. What it costs is a join table, two `CASCADE` entries
and a read per lookup.

**The reverse query is not lost, but it is not free either.** Convex has no indexable equality for
array membership, so `allergens` alone cannot answer "every ingredient containing gluten". The
answer is the pattern `search` on that same table already uses: serialize the array into a
companion string and put a `searchIndex` over it. That is a genuine index, not a scan, and it is
unusually well behaved here — the string holds only the fourteen vocabulary tokens and never free
text, and those fourteen are far enough apart that typo tolerance cannot match one allergen to
another, so the search is exact in practice.

**Such a blob is ONE field, not one per locale** — the opposite of `search` beside it, and for the
reason that distinguishes the two. `search` is per-locale because `name` and `aliases` are words a
shopper TYPES, and "crème" and "cream" are different strings. A closed vocabulary is locale-free by
construction (S11): the stored token is `milk`, the French word is a translation key, and the client
sends the token because the user tapped a chip rather than typing. Packing both languages into one
blob (`fr:lait en:milk`) is worse than either: a `searchField` is tokenized, so every row would
share `fr` and `en` as very high-frequency terms and the ranking the index exists to provide is
polluted by them.

Its cost is the denormalization. A derived field is only correct while **every** writer recomputes
it, and the writers are about to stop being just the seed: a cook's own ingredient, enriched from
OpenFoodFacts or an LLM, writes this row too. A missed recompute has no symptom — the row is simply
never found. So add the field when a screen actually asks the reverse question, write it through
`serializeAllergens` so one function owns the format, and never let a caller build the string
itself.

```ts
// ✅ the list is someone else's, and will never change under us
allergens: v.optional(v.array(v.union(...ALLERGENS.map(v.literal))))
```

**S14 — `undefined` and `[]` are two answers, and collapsing them is how a false claim ships.** On a
field whose emptiness asserts something — "carries no allergen", "has no restrictions" — absent must
mean *nobody established this* and empty must mean *established, and there are none*. An array on
the document says both for free. A join table cannot, which is what tempts a second
`somethingCheckedAt` column beside it; two fields that must agree is a bug waiting for the one
writer that forgets. Readers must refuse to answer on `undefined` rather than treating it as empty.

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
| A7  | Endpoints that cost money are rate-limited (ADR 0018); writes on demand stay review          | 📐 C16 + 👁     |
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

Is it domain logic with no React, Jotai or Convex import — types, invariants, pure functions?
├─ Has rules worth a test of their own,               → src/modules/{domain}/_model/
│  or several `_hooks/` files need it?                  named for the concept, never the hook
│  (unit-tested directly, no provider tree — see src/modules/groceries/_model/model.ts)
└─ A trivial helper, one `_hooks/` file uses it?      → stays inline in that hook, for now

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
└─ A payload shape built from that vocabulary,        → convex/schema/{domain}Payloads.ts
   crossing a function boundary but never a row?

Is it user-facing copy?                               → translations/   (en + fr, keys in sync)

Is it a test?                                           📐 C10 · [ADR 0008](./adr/0008-tests-are-layered.md)
├─ Where does it go?                                  → __tests__/<subject>.test.ts beside the
│                                                       subject. Always — `_model/` included
└─ Which runner picks it up?                          → convex/** and shared/** → `convex` project
                                                        src/** and app/**       → `app` project
                                                        scripts/**              → `scripts` project
```

**Domain logic goes to `_model/` for what it holds, not for how many files call it.** A state
machine with edge cases — `navigation/_model/voice.ts` decides when a spoken entry ends, and every
one of its rules is a bug somebody hit — earns `_model/` from its first caller: pinned there against
plain data, each rule is one line of test, where inline it needs the hook mounted over a fake
recognizer. A `formatLabel` one-liner stays in its hook until a second one needs it. Either way the
file is named for what it holds — `voice.ts`, not `useVoiceInput.helpers.ts`: a name tied to one
hook reads as misplaced the day a second hook imports it.

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
- [ ] Router file under 90 lines 📐
- [ ] Authorization test added for each new gated export 📐

**Frontend**

- [ ] Nothing in `src/ui/` imports Convex 🔒
- [ ] Screen contains no `useQuery` 🔒
- [ ] Data access lives in the module's `_hooks/` 👁
- [ ] UI props are structural types, not `Doc<'x'>` 🔬
- [ ] Screen under ~120 lines 👁

**Tests**

- [ ] Every new `_model/` file has its test in `__tests__/` 📐 C10
- [ ] Every new gated Convex export has its rejection test 📐 C5
- [ ] A hook whose write changes what a screen reads is mounted, not re-implemented 👁
- [ ] No test file left where no project collects it 📐 C10

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

| Not a rule                          | Why                                                                                                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Never use `any`"                   | Sometimes correct at a vendor boundary. Enforce `noImplicitAny` (🔬) and review the rest — a new `any` needs a comment justifying it.                                                                                                                       |
| "100% test coverage"                | Coverage targets produce tests that assert nothing. Two things are mandatory — the authorization suite (A6) and a test per `_model/` file (C10) — and the rest is judgement about altitude, not a number. See [ADR 0008](./adr/0008-tests-are-layered.md). |
| "Every file needs a header comment" | Comment density should match the surrounding code. Noise ages badly.                                                                                                                                                                                       |
| "One export per file"               | The multi-access-level pattern is *better* than splitting: the shared handler is the point.                                                                                                                                                                |
| "No barrel files"                   | `functions/*/index.ts` barrels worked well in the predecessor (13/13 domains). Keep them; avoid deep re-export chains.                                                                                                                                     |

---

## 10. Commits and branches 🔒

**Conventional Commits**, enforced by the `commit-msg` hook against
[commitlint.config.js](../commitlint.config.js).

```
<type>(<scope>)?: <imperative subject, ≤72 chars, lowercase, no full stop>

<body: why this change exists, and what changed at the LAYER level>

<footers: BREAKING CHANGE:, Refs: #12>
```

```
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

```
fix(convex): reject paginated queries that filter post-index

Convex paginates the index read and applies .filter() to the resulting page, so a page
requested with numItems 24 could return 3 documents while still reporting isDone false —
infinite scroll stopped early and silently hid recipes.

The predicate moves into the index (by_public_and_user), so pagination operates on the
filtered set. Check C3 now fails this shape at commit time, per ADR 0007.

Refs: #48
```

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

| Rule                                             | Why no mechanism                                                                                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router files contain no loop or domain branching | C2's line cap is a proxy. A precise version would have to distinguish "a loop shaping arguments" from "a loop doing domain work", which is the judgement itself. |
| S4 — never store `createdAt`                     | Trivially greppable, but a field legitimately named `createdAt` from an external system is not a violation.                                                      |
| S6 — polymorphic refs                            | Detectable in the easy case; the interesting cases turn on whether the field is indexed, which is a design call.                                                 |
| S8 — `position` on ordered join tables           | Requires knowing whether order is meaningful. Nothing but a human knows.                                                                                         |
| S9 — sharded counters                            | Requires knowing whether a counter is concurrently written.                                                                                                      |
| S11 — enum pattern                               | A style preference with real exceptions.                                                                                                                         |
| S12 — model-written fields are vocabularies      | Requires knowing that a field is filled in by a generation tool, and that its value is a word rather than a name. Neither is visible in the schema file.         |
| A2 — never branch on a secret's truthiness       | A lint rule would need to know which identifiers are secrets. A1 already makes the branch pointless.                                                             |
| A7 — rate limiting of writes on demand           | C16 follows what a paid call imports and what a `@costly` action is called by; a write that costs nothing outside the database has no such mark to follow.        |
| A8 — never return credentials                    | Would require taint tracking.                                                                                                                                    |
| A9 — constant-time comparison                    | Same problem as A2. `timingSafeEqual` exists; using it is review.                                                                                                |
| ⏳ A10 — `ConvexError({ code })`                  | Mostly mechanisable; not built until an error convention has been exercised by real domains.                                                                     |
| Screen ≤ ~120 lines                              | A cap would fight legitimate layout composition.                                                                                                                 |
| A cross-layer change starts with a plan          | "Crosses two layers" is the judgement itself — any mechanism deciding it would have to *be* that judgement. See [plans/README.md](./plans/README.md).            |
| A reported bug is pinned; assertions stay put     | Whether the user reported a bug, or approved a behaviour change, lives in the conversation, not the repo. A changed `expect(...)` is visible in the diff; whether it was allowed is not. |
| A known, accepted choice carries `@limitation`   | Whether a behaviour is a chosen cost or just how the code works is the judgement itself. The tag makes the answer greppable once someone has given it.           |
| ⏳ A landed slice deletes its plan file           | Mechanisable — a plan whose branch is merged is stale. Not built until the practice has run on a real slice and the check has something real to assert.          |

**The rule about this section: do not promote a tag before its mechanism exists.** A 👁 that claims
to be 📐 is worse than no rule at all, because a green `pnpm verify` then certifies something nobody
checked.
