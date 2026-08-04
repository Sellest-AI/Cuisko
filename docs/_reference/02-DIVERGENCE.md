# 02 — Divergence: Documentation vs. Implementation

> `.readme/` declares itself authoritative:
> *"The documentation is the source of truth."* — `.github/copilot-instructions.md:20`
> *"Trust these instructions — only search codebase if information is incomplete or unclear."* — line 244
>
> This document measures how far that claim is from true. It matters because an AI agent instructed
> to trust `.readme/` over the code will write code that does not compile, does not run, or is
> insecure.

**Scope:** 24 documentation files, 5,176 lines, vs. ~660 source files.

---

## Severity scale

| Level | Meaning |
|---|---|
| 🔴 **Breaking** | Following the doc produces code that fails to compile, fails at runtime, or is insecure. |
| 🟠 **Misleading** | The doc describes something that does not exist; the reader wastes time or builds the wrong thing. |
| 🟡 **Stale** | Factually wrong but harmless — names, counts, paths that moved. |

---

## Summary table

| # | Divergence | Severity |
|---|---|---|
| D1 | Docs describe a **Next.js** app; the project is React Native | 🔴 |
| D2 | `publicMutation` is documented but does not exist | 🔴 |
| D3 | "Never import `_generated/server`" — a correct rule, abandoned after a misdiagnosis; 58 files drifted | 🔴 |
| D4 | Export-name contract documented as absolute; ~22% of exports break it | 🔴 |
| D5 | `@/lib/convex/server` and all `fetch*Server` helpers do not exist | 🟠 |
| D6 | `expo/middleware.ts` and route protection do not exist | 🟠 |
| D7 | `app/[route]/_components/` pattern used zero times | 🟠 |
| D8 | Four backend layers exist that no doc mentions | 🟠 |
| D9 | i18n documented as a feature; used in 1 file of 332 | 🟠 |
| D10 | UI docs describe shadcn/ui, `components.json`, web-only hooks | 🟠 |
| D11 | Filename conventions contradicted by the code's own better rule | 🟡 |
| D12 | Wrong filenames, wrong library, wrong commands, wrong folder names | 🟡 |
| D13 | Docs contradict *each other* on the `useMutation` return shape | 🟡 |

---

## 🔴 D1 — The documentation is for a different framework

`.readme/` is a lightly-edited fork of a **Next.js + Convex** boilerplate. Next.js concepts were
never removed, and in several places they are still presented as instructions.

| Doc location | What it says | Reality |
|---|---|---|
| `expo/LLM_SUMMARY.md:5` | *"This is the **Next.js 16+ frontend**… Uses App Router, server components by default"* | Expo 55 / React Native 0.83. No server components exist. |
| `expo/LLM_SUMMARY.md:31-44` | Teaches "Server vs Client Components", `export default async function Page()` | Impossible in React Native. |
| `expo/LLM_SUMMARY.md:60-73` | Teaches the Server Actions pattern with `"use server"` | Does not exist in the project. |
| `expo/EXPO_APP.md:3` | *"Next.js App Router pages and layouts"*, links to nextjs.org | The folder is Expo Router. |
| `expo/EXPO_APP.md:31-44` | Recommends the `preloadQuery` server→client hydration pattern | No server to preload on. |
| `convex/LLM_SUMMARY.md:5` | *"This is a **Next.js + Convex** boilerplate"* | It is Expo + Convex. |
| `convex/LLM_SUMMARY.md` tech stack | *"Frontend: Next.js 16+"* | — |
| `LLM_SUMMARY.md:435-437` | *"**Default**: Server components (cheaper, better performance)"* | Actively harmful advice here. |
| `LLM_SUMMARY.md:456-473` | Dev commands: `pnpm dev`, `pnpm dev:tunnel`, `pnpm build` | None of these scripts exist. |
| `LLM_SUMMARY.md:524` | Lists shadcn/ui and Tailwind as resources | NativeWind; shadcn is web-only. |
| `ROOT.md:492` | *"Start by exploring the `src/app/` directory"* | There is no `src/`. |

`expo/ROOT.md` and `expo/EXPO_PROVIDERS.md` were properly rewritten for Expo. Everything else was
not. The result is that roughly **40% of the frontend documentation describes a framework the
project does not use.**

**Consequence:** an AI told to "trust these instructions" will reach for `"use server"`,
`fetchQueryServer`, and server components — none of which exist.

---

## 🔴 D2 — `publicMutation` is documented but does not exist

Documented as a real procedure in at least three places:

- `LLM_SUMMARY.md:94` — `publicQuery`, `publicMutation` → export as `anon`
- `LLM_SUMMARY.md:307` — *"No auth: publicQuery/publicMutation (anon export)"*
- `convex/CONVEX_ROUTER.md:120` — `` `publicQuery`, `publicMutation`, `publicAction` → `anon` ``
- `convex/CONVEX_PROCEDURES.md:92` — same table

`convex/procedures.ts` exports **14 items**. `publicMutation` is not among them. A grep across the
whole `convex/` tree returns zero occurrences.

**This is not a cosmetic error — it caused a real violation.** A developer needing an unauthenticated
mutation found no `publicMutation`, so they imported the raw builder instead:

```ts
// convex/router/auth/getTestAccount.ts:1
import { mutation } from "../../_generated/server";   // ← the one rule the docs shout loudest about
```

A missing abstraction forced a rule violation. That is the whole story of this codebase in three
lines.

---

## 🔴 D3 — A correct rule was abandoned after a misdiagnosis, and 58 files drifted

The rule appears in **six** documents, always in bold or with a 🔴:

> *"**Golden Rule**: Never import from `_generated/` files directly. Always use `procedures.ts`."*
> — `convex/CONVEX_PROCEDURES.md:501`

**Reality: 58 files import from `_generated/server`.**

The reason is mechanical. `procedures.ts:11-12` re-exports exactly this:

```ts
export { internalMutation, internalQuery } from "./_generated/server";
export type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';
```

Here is what the 58 files actually needed, and whether `procedures.ts` could provide it:

| Import needed | Occurrences | Available from `procedures.ts`? |
|---|---:|---|
| `internalAction` | 35 | ❌ **not exported** |
| `internalQuery` | 11 | ✅ yes — these are gratuitous violations |
| `internalMutation` | 11 | ✅ yes — gratuitous |
| `httpAction` | 6 | ❌ **not exported** |
| `MutationCtx` (as value import) | 6 | ⚠️ type-only export; value import fails |
| `ActionCtx` | 5 | ⚠️ same |
| `QueryCtx` | 4 | ⚠️ same |
| `mutation` | 1 | ❌ **not exported** (see D2) |

**41 of the 58 files had no legal alternative.** The single most-repeated rule in 5,176 lines of
documentation was unfollowable for two thirds of the code that "broke" it.

### The rule is correct. It was abandoned because of a misdiagnosis.

There is a second cause, and it is the interesting one. `convex/_generated/**api**.d.ts` type-imports
*every module in the project*, and `procedures.ts:6` imports `internal` from it (needed for the
action-context user lookup at `procedures.ts:39`). That puts `procedures.ts` inside a project-wide
circular type reference, producing *"'X' implicitly has type 'any' because it is referenced directly
or indirectly in its own initializer."* `procedures.ts:15` records the moment:

```ts
// export { internal, api } from './_generated/api'; // CIRCULAR DEPENDENCY
```

That comment is **correct — and it is about `_generated/api`.** But the conclusion drawn from it was
applied to `_generated/server` as well, and the whole rule was dropped. The two generated modules are
not equivalent:

| Generated module | Contains | In the type cycle? | Can `procedures.ts` re-export it? |
|---|---|---|---|
| `_generated/**server**` | `query`, `mutation`, `action`, `internalAction`, `httpAction`, ctx types | ❌ **No** — its `.d.ts` imports only `convex/server` and `./dataModel.js` | ✅ **Yes, safely** |
| `_generated/**api**` | `internal`, `api` | ✅ **Yes** — type-imports all ~300 modules | ❌ No |

So the rule never needed abandoning. **`procedures.ts` can re-export every builder in
`_generated/server` today, with no cycle**, as long as it does not itself import `_generated/api` —
and that single import can be removed with `makeFunctionReference`, which yields a typed reference
from a string path without touching the api type graph.

The divergence, then, is not "the docs assert an impossible rule". It is:

> **A correct rule was abandoned because a neighbouring module's constraint was attributed to it,
> and 58 files drifted before anyone re-tested the assumption.**

This is the most instructive finding in the report, because nothing about it was careless: the
circular dependency was real, the investigation was real, and the comment documenting it is accurate.
Only the blast radius was wrong.

**The lessons for the blueprint:**

1. Before writing "never do X", verify "always do Y" is possible for every case X covers — then make
   a linter prove it, so the gap surfaces in minutes rather than in 58 files.
2. **When you hit a constraint, scope it precisely before generalising from it.** "Importing
   `_generated/api` from `procedures.ts` creates a cycle" and "`procedures.ts` cannot be the single
   import point" are very different claims, and only the first is true.
3. A rule with no mechanical enforcement gives you no signal when it stops holding. The 58 violations
   accumulated silently; a lint rule would have forced the re-test on the first one.

The blueprint **keeps and enforces this rule** — see [03-FLAWS #F8](./03-FLAWS.md),
[04-BLUEPRINT §3.2](./04-BLUEPRINT.md), and lint rules R2 / R2b in
[05-CONVENTIONS §3.1](./05-CONVENTIONS.md).

---

## 🔴 D4 — The export-name contract is presented as absolute; 22% of exports break it

The contract, repeated in four documents with a ⚠️ CRITICAL marker:

> *"All procedure exports **MUST** follow this naming convention"* — `CONVEX_PROCEDURES.md:88`
> Valid names: `anon`, `authed`, `admin`, `server`, `_internal`. Nothing else.
> *"❌ WRONG: `export const getUser = publicQuery({...})`"*

**Actual export names across `convex/router/`:**

| Name | Count | Contract |
|---|---:|---|
| `_internal` | 63 | ✅ |
| `authed` | 60 | ✅ |
| `anon` | 45 | ✅ |
| `admin` | 17 | ✅ |
| `server` | 8 | ✅ |
| **Total compliant** | **193** | |
| `_internal_step` / `_internal_step_*` | 14 | ❌ |
| `_internal_query` / `_internal_query_*` | 9 | ❌ |
| `_internal_cache` | 6 | ❌ |
| `action` | 6 | ❌ (all of `router/stripe/`) |
| `_internal_mutation` | 4 | ❌ |
| `_internal_delay` | 3 | ❌ |
| `_private` | 2 | ❌ (a whole new access tier, undocumented) |
| `settings`, `_internal_node`, `_internal_payment`, `_internal_clearCache`, `_internal_remove`, `_internal_trend_action`, `_internal_step_likes`, `_internal_step_bookmark`, `uploadImage`, `uploadManySharedHandler`, `uploadSingleArgs`, `stripeWebhookHttpAction` | 12 | ❌ |
| **Total non-compliant** | **55 (22%)** | **26 distinct invented names** |

**Root cause:** the contract allows exactly one internal export per file, but the async orchestration
pattern (§3.7 of the extraction) routinely needs 2–4 internal steps in one file. With no sanctioned
way to express that, every author invented their own suffix. Twenty-six times.

**The dangerous sub-case — names that lie about access level.** Because the export name is the *only*
signal of auth requirements at the call site, a mismatch is invisible:

| File:line | Export | Actual procedure | Consequence |
|---|---|---|---|
| `router/credits/getUserWallet.ts:48` | `admin` | `authQuery` | 🔴 **no admin check** — any user reads any wallet |
| `router/users/getAppearance.ts:19` | `admin` | `authQuery` | 🔴 **no admin check** — any user reads anyone's body data |
| `router/generations/getOne.ts:15` | `anon` | `authQuery` | requires auth despite the name |
| `router/outfits/getFromUser.ts:25` | `anon` | `authQuery` | requires auth despite the name |
| `router/auth/getTestAccount.ts:3` | `anon` | raw `mutation` | 🔴 public credential disclosure |

The first two are live authorization holes — see [03-FLAWS.md #F1](./03-FLAWS.md).

**Also undocumented:** `router/admin/config/getConfig.ts` and `router/admin/presets/findByName.ts`
export `anon = publicQuery` — fully public endpoints inside the `admin/` namespace.

---

## 🟠 D5 — An entire documented API surface does not exist

`.readme/expo/lib/LIB_CONVEX.md` (398 lines) and `convex/CONVEX_ROUTER.md:652-742` document a
server-side Convex access layer in detail:

> *"**File**: `@/lib/convex/server`"*
> Exports: `fetchQuery`, `fetchQueryServer`, `fetchMutationServer`, `fetchActionServer`,
> `fetchQueryAuth`, `fetchMutationAuth`, `fetchActionAuth`, `preloadQuery`, `preloadQueryAuth`,
> `getUserIdentity`
> *"⚠️ **IMPORTANT**: The `*Server` functions automatically include the `_serverKey` parameter."*

**`expo/lib/convex/server.ts` does not exist.** The folder contains `client.ts`, `api.ts`, `auth.ts`,
`agent.ts`, `storage.ts`, `upload.ts`, `utils.ts`. None of those ten functions exist anywhere.

`LIB_CONVEX.md:22` half-acknowledges this — *"`server.ts` exists for legacy compatibility but is not
used in React Native"* — but it does not exist at all, and the same document then spends three
sections (lines 277-314) teaching patterns built on it, including a "Server Action Pattern" with
`"use server"`.

Meanwhile `storage.ts` and `upload.ts`, which *do* exist, are documented nowhere.

**Knock-on effect:** the `server*` procedures in `procedures.ts` have no documented caller. They are
used by 12 backend exports and reachable only by manually passing `_serverKey`.

---

## 🟠 D6 — Authentication middleware does not exist

Referenced as a real file in four places:

- `expo/ROOT.md:20` — *"### middleware.ts — Authentication middleware for protected routes."*
- `LLM_SUMMARY.md:193` — shown in the folder tree as `expo/middleware.ts`
- `copilot-instructions.md:221` — listed under "Key Files to Review"
- `LLM_SUMMARY.md:450` — *"Routes under `/app/*` require authentication. Middleware redirects
  unauthenticated users to `/auth` with redirect parameter."*

`expo/middleware.ts` **does not exist**. Neither does route-level protection — Expo Router has no
middleware concept. Auth gating is done inside `expo/providers/auth.tsx` and per-screen.

The `/app/*` path in the last quote is also a Next.js URL path, not this project's `app/` folder —
another D1 artefact.

---

## 🟠 D7 — The documented screen structure is used zero times

`expo/EXPO_APP.md:50-90` specifies, in detail, a per-route folder convention:

```
app/example/
├── page.tsx
├── _components/          ← page-specific components
├── _hooks/               ← page-specific hooks
├── _utils/               ← page-specific utilities
└── modules/              ← complex page modules
```

A search for `_components`, `_hooks` or `_utils` directories under `app/` returns **nothing**. The
convention was never adopted.

What happened instead is better: shared screen code lives in `expo/modules/{domain}/`, and modules
use `_hooks/` internally. But no document describes `expo/modules/` beyond one sentence
(*"Feature-based modules for complex, reusable features"*, `expo/ROOT.md`), so the **most important
frontend convention in the codebase is effectively undocumented** while a fictional one gets 40 lines.

Also note `page.tsx` in that snippet — Expo Router uses `index.tsx`. Another D1 artefact.

---

## 🟠 D8 — Four backend layers exist that no document mentions

| Layer | Files | Purpose | Documented? |
|---|---:|---|---|
| `convex/workflows/` | 6 | `@convex-dev/workflow` durable multi-step jobs | ❌ never mentioned |
| `convex/crons/` | 4 | Cron job bodies | ❌ (docs describe `cron.ts`; the file is `crons.ts` and the bodies live in `crons/`) |
| `convex/http/` | 5 | Webhook handlers | ❌ (`CONVEX_HTTP.md` calls a folder a *"Future Consideration"* — it already exists) |
| `convex/utils/` | 1 | `isAuthorized` as an internalQuery | ❌ never mentioned |

`@convex-dev/workflow` is also missing from the components list in `convex/ROOT.md:222-229`, even
though `convex.config.ts:15` registers it.

Conversely, `convex/ROOT.md` documents `migrations.ts` as a live concern with examples, while the
real file contains exactly one migration for a table field that no longer exists in the schema
(`images.tags` is still there, but `clearImagesTags` has clearly already run).

---

## 🟠 D9 — i18n is documented as a feature; it is scaffolding

`.readme/TRANSLATIONS.md` is 148 lines. i18n appears in the tech stack of all four summary
documents. `ROOT.md:205-224` describes namespace organisation and full TypeScript support.

**Measured:**

| Metric | Value |
|---|---|
| Files importing `translations` / using `useTranslations` | **1 of 332** |
| Translation keys in `en/common.json` | 2 |
| Translation keys in `en/home.json` | 5 |
| Hardcoded English strings in JSX | ~30 |

Example of what ships instead (`app/(extra)/avatar/appearance.tsx:65`):

```tsx
<Text.H4 color={Colors.neutral[50]}>Physical Appearance</Text.H4>
```

The infrastructure works — it is simply not used. For the new project this is a fork in the road:
either enforce i18n from the first screen, or do not install it. Half-installed i18n is pure cost.

---

## 🟠 D10 — The UI documentation describes a web design system

`.readme/expo/EXPO_UI.md` (98 lines) is entirely un-ported:

| Claim | Reality |
|---|---|
| *"Configured via `components.json` at the project root"* | No `components.json` exists. |
| *"Install new components: `npx shadcn@latest add <name>`"* | shadcn/ui is web-only; the project uses NativeWind + custom components. |
| Paths given as `src/ui/components/` | The folder is `expo/ui/components/`. |
| *"**image.tsx**: Next.js Image wrapper"* | It wraps `expo-image`. |
| *"**motion.tsx**: Re-export of framer-motion"* | It re-exports `moti`. |
| Documents `useBreakpoint`, `useIsMobile`, `useHorizontalScroll`, `useTheme` | `expo/ui/hooks/` contains exactly three files: `use-color-scheme.ts`, `use-color-scheme.web.ts`, `use-number-increment.ts`. **None of the four documented hooks exist.** |
| Documents `getCookie`/`setCookie` as UI utils | `ui/utils/cookie.ts` exists but is dead code in a native app. |
| *"Theme support: Dark/light mode with Jotai persistence"* | Theme is a provider + a static `theme` module. |

The irony: the *rule* this document exists to state — UI isolation — is the one rule the codebase
follows perfectly. Everything around that rule is wrong.

---

## 🟡 D11 — The filename convention is contradicted by the code's own, better rule

Documented rule (`expo/ROOT.md`, `LLM_SUMMARY.md:20`, `copilot-instructions.md:86`):

> *"**Files**: kebab-case for components, hooks, and function files"*

**29 of 332 files use camelCase.** But they are not random — they cluster almost perfectly:

| Group | Convention used | Compliant with doc? |
|---|---|---|
| `expo/ui/components/*` (73 files) | kebab-case | ✅ |
| `app/**` (96 files) | kebab-case | ✅ |
| `expo/modules/**/*.tsx` | kebab-case + dot-notation (`category.color.tsx`) | ✅ |
| **All hook files** in `expo/hooks/` and `expo/modules/*/_hooks/` (19 files) | **camelCase** (`useDebounce.ts`, `useItem.ts`) | ❌ |
| `expo/lib/revenue-cat/`, `expo/lib/posthog/` (4 files) | camelCase | ❌ |

So the codebase's *de facto* rule is **"components and screens are kebab-case; hooks are camelCase,
matching the exported hook name."** That is arguably the better rule — `useItem.ts` exporting
`useItem` is more greppable than `use-item.ts`.

The problem is that it was never written down, so it is applied inconsistently:
`expo/ui/hooks/use-color-scheme.ts` is kebab-case while `expo/hooks/useDebounce.ts` is camelCase —
two hook folders, two conventions, in the same project.

The blueprint picks one and states it explicitly.

---

## 🟡 D12 — Wrong names, wrong libraries, wrong commands

| Doc | Says | Actually |
|---|---|---|
| `convex/ROOT.md:110`, `CONVEX_CRON.md` | `cron.ts` | `crons.ts` |
| `ROOT.md:62` | env uses `@t3-oss/env-nextjs` | `@t3-oss/env-core` |
| `ROOT.md:70` | `eslint.config.mjs` | `eslint.config.js` |
| `ROOT.md:54`, `LLM_SUMMARY.md:73` | `env.NEXT_PUBLIC_API_KEY` | Prefix is `PUBLIC_`, mapped from `EXPO_PUBLIC_*` |
| `ROOT.md:363` | *"Copy `.env.example` to `.env.local`"* | No `.env.example` exists |
| `LLM_SUMMARY.md:249-256` | `utils/routes.ts`, `utils/path.ts` shown as the main utils | They exist but `convex-allowed/` holds 11 of the 15 files |
| `ROOT.md:36`, `LLM_SUMMARY.md` | `pnpm dev`, `pnpm dev:tunnel`, `pnpm build` | Not in `package.json` |
| `LLM_SUMMARY.md:79`, `ROOT.md:112` | `.readme/` contains an `LLM/` subfolder | It does not |
| `convex/ROOT.md:222-229` | Lists 5 components | 5 registered, but `workflow` is missing from the list and `rag` ordering differs |
| `CONVEX_SCHEMA.md` | `usersExtended.role` has 3 values | 4 — `BOT` was added |
| `CONVEX_PROCEDURES.md:170` | User object shape | Missing `revenueCatUserId`, `plan`, `username`, `imageId`, `isPremium` |
| `copilot-instructions.md:250` | *"For schema changes: document in migrations.ts"* | One migration exists; schema has changed far more than once |
| `copilot-instructions.md:9` | *"~50+ files in expo/, ~50+ in convex/, ~10+ in app/"* | 236 / 314 / 96 |

---

## 🟡 D13 — The documents contradict each other

Same hook, two shapes, in two documents that are both current:

```ts
// convex/CONVEX_ROUTER.md:627
const { execute, isLoading, isSuccess, isError } = useMutation(api.router.users.updateOne.authed);

// expo/lib/LIB_CONVEX.md:41
const { mutate, isLoading, isSuccess, isError } = useMutation(api.router.users.updateOne.authed);
```

The implementation (`expo/lib/convex/client.ts:52`) returns `{ mutate, isLoading, isSuccess,
isError }` — `LIB_CONVEX.md` is right, `CONVEX_ROUTER.md` is wrong. Internally, `client.ts` names the
variable `execute` and renames it on the way out, which is presumably how the drift happened.

`LIB_CONVEX.md:38` also shows `useQuery` returning `{ data, isPending }` while `CONVEX_ROUTER.md:53`
shows `{ data, isPending }` — these agree — but `LLM_SUMMARY.md:110` shows `const { data } =
useQuery(...)` inside a React Native component described as returning a `<View>`, in a section titled
"Next.js: Server vs Client Components".

---

## Why this happened — and the one rule that follows

The pattern is consistent: **the documentation records intent at the moment a decision was made, and
was never reconciled with what the code did afterwards.** The Next.js origin was never scrubbed; new
layers (`workflows/`, `crons/`, `http/`) were added without doc updates; rules were written before
checking they were satisfiable.

`.github/copilot-instructions.md:252-287` even contains an elaborate protocol requiring the assistant
to warn about architectural changes and offer to update the docs. The protocol exists. It clearly did
not fire — four whole layers were added without a line of documentation.

**The rule this generates for the new project:**

> A rule that cannot be checked by a machine will be violated, and the documentation asserting it will
> become a liability rather than an asset. Every architectural rule in the blueprint must have a
> mechanical check — a lint rule, a type constraint, a CI script — or it must be downgraded from
> "rule" to "guideline" and written as such.

[04-BLUEPRINT.md](./04-BLUEPRINT.md) §Enforcement implements this. [05-CONVENTIONS.md](./05-CONVENTIONS.md)
marks every rule with the mechanism that enforces it.
