# 01 — Extraction: Predecessor's Architecture As Implemented

> This document describes what the code **actually does**, derived by reading it.
> Where the `.readme/` documentation says something different, that is recorded in
> [02-DIVERGENCE.md](./02-DIVERGENCE.md), not here.

---

## 1. What Predecessor is

A cross-platform (iOS / Android / Web) consumer app with a user-generated-content domain, built on
the same Expo + Convex stack as Cuisko. The product itself is not the point of this document; three
properties of it are, because they shaped every layer:

- **heavy binary assets** — images and video, uploaded and processed;
- **long-running third-party jobs** — external AI providers that call back by webhook;
- **a social graph with counters** — likes, follows, and a ranked feed.

Table and domain names throughout (`items`, `outfits`, `generations`, `presets`, …) are retained
because the evidence is anchored to them; they are not the subject.

---

## 2. Top-level layout

```
predecessor/
├── app/                  # Expo Router — file-based routing. Screens only.        96 files / 11.2k
├── expo/                 # All non-routing frontend source.                      236 files / 19.8k
│   ├── ui/               #   Isolated design system. NO Convex, NO business logic.
│   ├── modules/          #   Feature modules. Own the Convex bindings.
│   ├── lib/              #   Third-party integration wrappers (convex, image, s3, posthog, RC).
│   ├── providers/        #   React context tree.
│   ├── hooks/            #   Cross-feature generic hooks.
│   └── global/           #   Theme, routes, website constants.
├── convex/               # Backend: database, API, jobs, AI.                     314 files / 18.3k
├── utils/                # Code shared between Expo and Convex.                   15 files / 0.9k
│   └── convex-allowed/   #   ⚠️ Must be edge-runtime compatible.
├── translations/         # react-i18next. (Present but ~unused — see 02.)
├── assets/               # Fonts, images, videos, logos.
├── android/              # Native project (checked in, gitignored).
├── .readme/              # 24 architecture docs, 5,176 lines.
├── env.js                # Client env, @t3-oss/env-core + Zod.
├── app.json / eas.json   # Expo + EAS build config.
├── convex.json           # Declares Node-only externals: sharp, runpod-sdk, expo-server-sdk.
├── tsconfig.json         # Root TS config + path aliases. ⚠️ excludes convex/.
└── metro.config.js       # NativeWind + tslib pin + .history blocklist.
```

Two TypeScript projects, deliberately:

- **Root `tsconfig.json`** covers `app/`, `expo/`, `utils/`. It **excludes `convex/`**.
- **`convex/tsconfig.json`** covers `convex/` plus `../utils/convex-allowed/*`, with its own aliases.

This split is correct — the two runtimes differ (React Native vs Convex's edge/V8) — and it is why
`utils/convex-allowed/` exists as a physically separate bridge folder.

### Path aliases

| Alias | Resolves to | Available in |
|---|---|---|
| `@/*` | `expo/*` | Root project |
| `@ui/*` | `expo/ui/components/*` | Root project |
| `@ui/hooks/*` | `expo/ui/hooks/*` | Root project |
| `@ui/utils` | `expo/ui/utils` | Root project |
| `@utils/*` | `utils/*` | Root project |
| `theme` | `expo/global/theme.ts` | Root project |
| `routes` | `expo/global/routes.ts` | Root project |
| `global` | `expo/global/website.ts` | Root project |
| `translations` | `translations/` | Root project |
| `assets/*` | `assets/*` | Root project |
| `env` | `env.js` | Root project |
| `@shared/utils` | `utils/convex-allowed` | **Both** |
| `@/lib/*` | `convex/lib/*` | Convex project |
| `@shared/node/*` | `utils/convex-allowed/lib/*` | Convex project |

Note the collision hazard: **`@/` means `expo/` in the app and `convex/lib/` in the backend.** Same
prefix, different meaning depending on which tsconfig owns the file. This works but is a real
cognitive trap; the blueprint renames it.

---

## 3. Backend — `convex/`

### 3.1 Structure

```
convex/
├── procedures.ts         # ★ Custom function builders. The auth layer.
├── schema.ts             # Aggregates 39 app tables + authTables from schema/.
├── schema/               # 21 files, one per domain. Table defs + shared validators.
├── router/               # ★ Public API surface. 20 domains, ~150 files.
├── functions/            # Reusable DB logic. 13 domains, each with an index.ts barrel.
├── lib/                  # Third-party clients (stripe, s3, replicate, runpod, kie, byteplus…).
├── llm/                  # ★ All AI. agents / config / tools / triggers / rag / utils.
├── workflows/            # @convex-dev/workflow durable multi-step jobs.
├── crons/                # Cron job bodies (crons.ts is the schedule).
├── http/                 # Webhook handlers (http.ts is the route table).
├── utils/                # 1 file: isAuthorized as an internalQuery.
├── auth.ts               # convexAuth config: Apple, Google, Password.
├── auth.config.ts        # JWT provider config.
├── convex.config.ts      # Components: migrations, action-cache, agent, rag, workflow.
├── crons.ts              # 5 scheduled jobs.
├── http.ts               # 6 webhook routes + auth routes.
├── env.ts                # ⚠️ Plain object, process.env with '' fallbacks. No validation.
└── migrations.ts         # @convex-dev/migrations. 1 migration defined.
```

`workflows/`, `crons/`, `http/` and `utils/` are **layers the documentation never mentions**. They
emerged as the app grew and are architecturally reasonable, but undocumented.

### 3.2 The procedure layer — `procedures.ts`

This is the load-bearing file. It wraps Convex's raw `query`/`mutation`/`action` with
`convex-helpers`' `customQuery`/`customMutation`/`customAction` to inject authentication.

**What it exports (all 14):**

| Export | Built from | Injects into ctx | Auth gate |
|---|---|---|---|
| `publicQuery` | `query` (raw alias) | — | none |
| `publicAction` | `action` (raw alias) | — | none |
| `authQuery` | `customQuery` | `user`, `userId` | must be signed in |
| `authMutation` | `customMutation` | `user`, `userId` | must be signed in |
| `authAction` | `customAction` | `user`, `userId` | must be signed in |
| `adminQuery` | `customQuery` | ⚠️ `ctx`, `args` (bug) | signed in + `role === 'ADMIN'` |
| `adminMutation` | `customMutation` | ⚠️ `ctx`, `args` (bug) | signed in + `role === 'ADMIN'` |
| `adminAction` | `customAction` | `user`, `userId` | signed in + `role === 'ADMIN'` |
| `serverQuery` | `customQuery` | — | `_serverKey` arg equals `SERVER_PRIVATE_KEY` |
| `serverMutation` | `customMutation` | — | same |
| `serverAction` | `customAction` | — | same |
| `internalQuery` | re-export | — | Convex-internal only |
| `internalMutation` | re-export | — | Convex-internal only |
| `userCheck` | helper fn | — | returns `{user,userId}` or `null` |

**Note what is absent:** `publicMutation` does not exist. Neither does `internalAction` or
`httpAction`. That omission is why 58 files import `_generated/server` directly, and why one router
reaches for the raw `mutation` builder.

The omission traces back to a real constraint that was scoped too broadly. `procedures.ts:6` imports
`internal` from `./_generated/**api**` for the action-context branch of `userCheck`, and
`_generated/api.d.ts` type-imports *every module in the project* — so `procedures.ts` sits inside a
project-wide circular type reference. Line 15 records it:

```ts
// export { internal, api } from './_generated/api'; // CIRCULAR DEPENDENCY
```

**That comment is correct, and it is about `_generated/api`.** But `_generated/**server**` is a
different module with a different dependency graph: its `.d.ts` imports only `convex/server` and
`./dataModel.js`, so it is **not** in the cycle and re-exporting it is completely safe. The
constraint on one generated module was applied to the other, and the rule was dropped for both.

The rule is therefore sound and should be enforced — see [03-FLAWS #F8](./03-FLAWS.md) for the fix
(remove the one `_generated/api` import via `makeFunctionReference`, complete the re-export surface,
lint it).

**The user identity model** (`procedures.ts:31-67`) is worth understanding, because it recurs:

```
users            ← owned by @convex-dev/auth. Do not modify.
usersExtended    ← app-owned profile, 1:1 via index by_user_id.
```

`userCheck` reads both and **merges them into one object**, with `usersExtended` fields first so
`users` fields win on collision, plus `_idExtended` to reach the extended row and a hand-resolved
`name`/`image` preference. It also handles the action context, where `ctx.db` is unavailable, by
falling back to `ctx.runQuery(internal.router.users.getAccount._internal)`.

This "auth table + extended table, merged in the procedure" pattern is **good and worth keeping** —
it lets you extend the user without forking the auth component.

### 3.3 The router — API surface

The convention is a direct filesystem→API mapping:

```
convex/router/{domain}/[{subdomain}/]{operation}.ts  →  export const {access}
                    ↓
        api.router.{domain}.[{subdomain}.]{operation}.{access}
```

Concretely, `convex/router/storage/images/getOne.ts` exporting `anon` becomes
`api.router.storage.images.getOne.anon`.

**File names are operation-based** (`getOne.ts`, `getPaginated.ts`, `createOne.ts`, `deleteOne.ts`,
`toggleLike.ts`) because the resource is already implied by the folder. This is a genuinely good
convention — it keeps call sites readable and prevents `items/getItem.ts` stutter.

**Export names encode the access level**, so `api.…getOne.authed` tells you the auth requirement at
the call site without opening the file. This is the strongest idea in the whole architecture *when it
holds*.

**Actual API surface — 20 domains:**

```
router/
├── admin/          bots, config, items, outfits, presets, statistics, storage, users
├── auth/           getTestAccount, linkStripeSubscription, postCreateOrUpdate
├── collection/     bookmarks
├── credits/        wallet, daily claim, cost, grant/deduct/refund, transactions
├── feed/           paginated feed, by outfit, by preset
├── generations/    AI generation lifecycle + predictions
├── items/          wardrobe items — CRUD, search, colour search, SKU lookup
├── likes/          toggle + counters
├── notifications/  in-app + push tokens
├── outfits/        CRUD, search, suggest, cover generation, wear count
├── presets/        photoshoot presets — CRUD, category/user browse, search
├── quests/         gamification
├── safety/         block, unblock, report
├── storage/        images/, videos/ — upload, save, delete, sizes
├── stripe/         checkout, billing portal, webhook (legacy/web)
├── subscriptions/  lifecycle
├── users/          account, appearance, username, image, follows/
└── waitlist/       codes, statistics
```

**Procedure distribution.** 275 procedures are defined across the backend; 243 of them live in
`convex/router/` (which has 248 `export const` statements in total — the remaining 5 are helper
values and plain functions leaking into the API surface, see [03-FLAWS #F17](./03-FLAWS.md)).
Counting by builder across `router/`, `llm/triggers/`, `crons/` and `utils/`:

| Procedure | Count | | Procedure | Count |
|---|---:|---|---|---:|
| `internalMutation` | 61 | | `authMutation` | 22 |
| `publicQuery` | 37 | | `authAction` | 13 |
| `internalAction` | 36 | | `adminQuery` | 9 |
| `authQuery` | 34 | | `publicAction` / `adminAction` | 6 / 6 |
| `internalQuery` | 26 | | `server*` (3 kinds) | 12 |

Internal functions are **50%** of the backend. That is the signature of a webhook- and
scheduler-driven system: the public API is a thin shell over an internal orchestration graph.

### 3.4 The `router/` ↔ `functions/` split

The rule: **`functions/` holds reusable logic that touches the database; `lib/` holds pure/external
logic that does not.** `functions/` files take `ctx` as their first parameter and are plain async
functions — not Convex procedures — so they compose freely.

```
convex/functions/
├── credits/       canPay, createUserWallet, deductCredits, grantCredits, getUserWallet, credits.config
├── feed/          updateFeedScore, feed.config
├── generations/   createPrediction, getGenerationDetails, getGenerationMax, getPrediction
├── images/        getImage, saveImage
├── items/         createItem, getItem, searchItems, sanitizeItem, sanitizePrice, extractPosition
├── notifications/ saveNotification (375 lines — the largest), readNotification, registerToken
├── outfits/       generator (243 lines), getOutfit, getBackgroundColor, isOutfitNFSW
├── presets/       getPreset, sanitizePresets
├── quests/        updateQuest
├── subscriptions/ getUserSubscription, isSubscriptionActive, subscription.config
├── users/         getAccount, getAppearance, isAuthorized, isPremium
├── videos/        getVideo
└── waitlist/      updateWaitlist
```

Every domain has an `index.ts` barrel (13/13), so imports read `from "../../functions/users"`.

**The payoff pattern** — one handler, several access levels. From
`router/items/getPaginated.ts`:

```ts
const handler = async (ctx: QueryCtx, args: Args) => { /* … the real work … */ }

export const authed = authQuery({
  args,
  handler: async (ctx, args) => handler(ctx, { ...args, userId: ctx.userId })   // own data
})

export const admin = adminQuery({
  args: { ...args, userId: v.id("users") },
  handler: async (ctx, args) => handler(ctx, args)                              // anyone's data
})
```

This is the single most reusable idea in the codebase: **the access level lives in the wrapper, the
logic lives in one shared function.** It generalises to 3–5 variants (`anon` / `authed` / `admin` /
`server` / `_internal`) with no duplication. The blueprint keeps it verbatim.

Its failure mode is equally instructive: because the wrapper is chosen by hand, a wrong choice is
invisible. `credits/getUserWallet.ts:48` uses `authQuery` for an export named `admin`, and nothing
catches it.

### 3.5 Schema — 39 app-defined tables (plus the auth component's)

```
convex/schema/
├── auth.ts          re-exports authTables from @convex-dev/auth
├── users.ts         usersExtended, usersAppearance, bots
├── items.ts         items          + ITEMS_SCHEMA (reusable field set)
├── outfits.ts       outfits, outfitItems, suggestedOutfits
├── images.ts        images, imageSizes, imageObjects, userImages
├── videos.ts        videos, userVideos
├── generations.ts   generations, predictions
├── presets.ts       presets, presetCategories, presetGenerations
├── likes.ts         likes, likeStats
├── collection.ts    bookmarks, bookmarkStats
├── follows.ts       follows, followStats
├── feed.ts          feedScores
├── quests.ts        quests, userQuestProgress
├── wallets.ts       userWallets, creditTransactions
├── subscriptions.ts subscriptions (@deprecated), subscriptionsHistory
├── notifications.ts notifications, pushTokens
├── safety.ts        userBlocks, userReports
├── waitlist.ts      waitlist, waitlistCodes
├── statistics.ts    statistics
├── config.ts        config
└── constants.ts     CONTENT_RATINGS, ITEM_STYLES, OUTFIT_PALETTES
```

**Schema techniques used, and whether they're worth copying:**

| Technique | Example | Verdict |
|---|---|---|
| **Const array → validator → TS type**, one source of truth | `items.ts:7-28`, `presets.ts:8-33` | ✅ Copy. `const X = [...] as const` → `v.union(...X.map(v.literal))` → `type = typeof X[number]`. Gives you runtime validation, DB validation and a TS type from one declaration. |
| **Exported field-set spread into a table** | `ITEMS_SCHEMA` reused by `items` table *and* by `router/items/createOne.ts` mutation args | ✅ Copy. Keeps args and storage in lockstep. |
| **Separate `*Stats` counter tables** | `likeStats`, `bookmarkStats`, `followStats` | ⚠️ Right idea, unsafe implementation — hand-maintained counters race. Use `@convex-dev/sharded-counter`. |
| **Join tables for M:N** | `outfitItems`, `userImages`, `userVideos` | ✅ Copy — but add an ordering column (see below). |
| **Ownership via join table, not FK** | `images` has no `userId`; `userImages` carries it | ⚠️ Costs a hop on every authorization check. Only worth it for genuinely shared assets. |
| **Polymorphic optional FKs** | `likes { type, generationId?, outfitId? }` | ❌ Avoid. Nothing enforces "exactly one is set". Every read needs a discriminating branch. |
| **Audit-trail table for value movements** | `creditTransactions` with `fromId`/`toId`/`type`/`balanceAfter` | ✅ Copy for anything money-like. |
| **Pre-computed snapshot table** | `statistics`, refreshed by cron | ✅ Copy for dashboards. |

**Consistency gaps in the schema itself:**

- `updatedAt` is manual and present on only some tables (`outfits`, `images`, `notifications`,
  `feedScores` have it; `items`, `generations`, `presets` do not).
- `createdAt` is optional on `likes` and `follows` and absent elsewhere — everything else relies on
  `_creationTime`. Two sources of truth for "when".
- Index naming is mostly `by_*` but `predictions` has one called `status` (`generations.ts:31`).
- `videos`, `subscriptionsHistory`, `waitlist` and `config` have **no indexes at all**.
- `outfitItems` has no position column, so outfit item order is whatever the DB returns.
- `subscriptions` is marked `@deprecated` but is still registered in `schema.ts` and still written to
  by the Stripe webhook path.

### 3.6 AI layer — `llm/`

```
convex/llm/
├── agents/default.ts    Single Agent instance (@convex-dev/agent) + usageHandler
├── config/
│   ├── models.ts        Named model tiers: orchestrator / vision / reasoning / offload
│   ├── providers.ts     Per-model pricing + OpenRouter routing (provider order, fallbacks, effort)
│   └── embedding.ts
├── tools/               8 typed LLM tools (itemCategorizer, presetCreator, trendExtractor, …)
├── triggers/            10 callable entry points — same convention as router/
├── rag/rag.ts           @convex-dev/rag + Voyage embeddings
└── utils/
    ├── createTool.ts    Wraps @convex-dev/agent's createTool, re-attaching .handler
    ├── wrapAgent.ts     Creates/deletes a temp thread when none exists
    ├── usageHandler.ts  ⚠️ Stub — logs a TODO, charges nothing
    └── sanitizeAiText.ts
```

**This layer is the best-encapsulated part of the backend.** The `ai` SDK and `@convex-dev/agent` are
imported in exactly 6 files, all inside `llm/`. No router, function, or frontend file touches them.
The rule "always go through `defaultAgent`" is followed by all 8 tools.

Two ideas worth stealing:

- **Semantic model tiers.** Call sites ask for `models.vision.smart` or `models.offload.cheapest`,
  never `"google/gemini-3-flash-preview"`. Swapping providers is a one-file change.
- **Pricing co-located with the model.** `providers.ts` stores `inputTokens`/`outputTokens` cost next
  to the routing config, so cost accounting has a single source.

One idea worth *not* stealing: `llm/triggers/` duplicates `router/`'s conventions in a parallel tree.
It is exposed to clients identically (`api.llm.triggers.removeBackground.authed` is called from
`expo/modules/items/_hooks/useItem.ts:45`), so it is really just a router domain that lives outside
`router/`. Two places to look for an endpoint, for no gain.

**Also note:** `llm/config/index.ts:2` contains `export * from './index'` — a self-referential
barrel export. And `usageHandler.ts:50` is a `console.log('TODO: …')` inside a `try` with an empty
`catch {}`, so LLM token cost is computed and then discarded.

### 3.7 Async orchestration

Long-running AI work cannot fit in a mutation, so the backend uses a consistent four-step pattern:

```
1. authAction         validates, charges credits, calls the provider, gets a job id
2. internalMutation   stores a `predictions` row  { predictionId, status: 'LOADING' }
3. HTTP webhook       provider calls back → convex/http/{provider}.ts
4. internalAction     downloads output → uploads to S3 → internalMutation updates status
                                                       → notification + quest progress
```

Worked example — `items/createOne.ts`:

```
authAction authed ──> createItem() ──> internalMutation _internal_mutation
                                              │
                                              └─> scheduler.runAfter(0, _internal_trend_action)
                                                        │
                                                        └─> internalAction
                                                              ├─ runQuery  items.getOne._internal
                                                              ├─ runAction llm.triggers.trendExtractor
                                                              └─ runMutation items.editOne._internal
```

Note `ctx.scheduler.runAfter(0, …)` used as "fire and forget after this transaction commits". This is
the right Convex idiom for post-write side effects and is used consistently.

**Durable workflows** (`@convex-dev/workflow`) are used for the three jobs that must survive
failure mid-sequence: `workflows/statistics/update.ts`, `workflows/wardrobe/generate.ts`, and the
`workflows/database/count*` helpers. Everything else uses the scheduler.

**Crons** — 5 jobs, bodies in `crons/`, schedule in `crons.ts`:

| Job | Cadence | Body |
|---|---|---|
| Recent feed rescore (0–72h) | 1h | `crons/feedRecentUpdate.ts` |
| Older feed rescore (72h+) | 24h | same, different args |
| Admin statistics snapshot | daily 12:00 UTC | `crons/updateStatistics.ts` |
| Notify stale in-review predictions | 12h | `crons/notifyInReviews.ts` |
| Generate suggested wardrobes | daily 02:00 UTC | `crons/generateWardrobe.ts` |

**Webhooks** — 6 routes in `http.ts`:

| Handler | Verification |
|---|---|
| `router/stripe/http.webhook.ts` | ✅ `stripe.webhooks.constructEventAsync` |
| `http/revenuecat.ts` | ⚠️ only if secret env var is set |
| `http/kie.ts` | ⚠️ only if HMAC env var is set |
| `http/replicate.ts` | ❌ none |
| `http/runpod/removeBackground.ts` | ❌ none |
| `http/runpod/generateVideo.ts` | ❌ none |

> 🔒 **Route paths redacted.** The `http.ts` route table paired these handlers with their public
> URLs. Since three of them verify nothing, that pairing was a target list; the handler names alone
> carry the architectural point.

Note also that the Stripe handler is the only one still living under `router/` rather than `http/` —
the migration to a dedicated `http/` folder was never finished.

---

## 4. Frontend — `expo/` and `app/`

### 4.1 The four-layer model

```
┌─ app/ ──────────────── Expo Router. Screens: routing, layout composition, params.
│                        45 of 95 screens also call Convex directly.
├─ expo/modules/ ─────── Feature modules. Screens, sections and _hooks/ per domain.
│                        Owns the domain's Convex bindings + module-level Jotai state.
├─ expo/lib/ ─────────── Integration wrappers. The ONLY place that imports a vendor SDK.
└─ expo/ui/ ──────────── Design system. Pure presentation. Zero Convex, zero business logic.
```

Data flows strictly downward. `ui/` never reaches up.

### 4.2 `expo/ui/` — the isolation success story

**75 files. Zero violations.** A full import audit found not a single reference to `convex`,
`@/lib/convex`, `@/modules`, `@/hooks`, or `@/providers`. Its complete external dependency set is:

```
react, react-native, theme, @ui/*          ← the intended surface
react-native-reanimated, moti, react-native-gesture-handler, react-native-worklets,
react-native-svg, react-native-safe-area-context, @shopify/flash-list,
expo-image, expo-video, expo-haptics, expo-blur, expo-linear-gradient, expo-symbols,
phosphor-react-native, lucide-react-native, clsx, tailwind-merge
                                            ← presentation libraries, all legitimate
expo-router (5×), jotai (1×)                ← mild coupling, see below
```

**Why it held.** Three reinforcing reasons, all worth reproducing deliberately:

1. **The boundary was complete.** `@ui/*`, `@ui/hooks/*`, `@ui/utils` and `theme` gave a UI file
   everything it needed. Nothing was missing, so nobody had a reason to reach outside.
2. **The alias made violations visible.** A UI file importing `@/lib/convex/client` looks wrong on
   sight because everything around it imports `@ui/…`.
3. **Structural prop types instead of `Doc` types.** This is the key technique. From
   `ui/components/cards/post.tsx:32-55`:

   ```ts
   image?: { _id: string; url: string; contentFit?: 'cover' | 'contain'; backgroundColor?: string }
   users?: { name: string; username: string; imageUrl?: string; isPremium?: boolean; onPress?: () => void }[]
   ```

   Note `_id: string`, **not** `Id<'images'>`. Because the component describes the *shape it needs*
   rather than importing the backend's type, it has no reason to import from `convex/` at all. The
   module layer adapts documents to these shapes.

**The one nuance:** `ui/components/cards/` contains `post.tsx`, `quest.tsx`, `notification.tsx`,
`report.modal.tsx` — domain-*named* components. The boundary still holds technically (they are pure
and prop-driven), but they are not reusable outside this product. This is a legitimate design
choice, not a violation; the blueprint makes it explicit by splitting `ui/components/`
(product-agnostic) from `ui/cards/` (domain-shaped but still pure).

**Dead code:** `ui/utils/cookie.ts` is a browser cookie helper in a React Native app — a leftover
from the Next.js boilerplate this project was forked from.

### 4.3 `expo/modules/` — feature modules

19 modules, 1–14 files each:

```
expo/modules/
├── items/          14   ├── generations/  4   ├── camera/     3
├── outfits/        10   ├── search/       4   ├── safety/     3
├── profiles/       10   ├── collection/   3   ├── scan/       3
├── feed/            4   ├── presets/      3   ├── config/     2
├── tabs/            2   ├── photoshoot/   2   ├── premium/    2
└── admin/ bots/ credits/ waitlist/ — 1 each
```

The internal shape is consistent:

```
modules/{domain}/
├── screen.tsx          # the main composed screen
├── {section}.tsx       # sections, dot-notation for sub-parts (category.color.tsx)
├── _hooks/
│   └── use{Domain}.ts  # ★ owns the Convex bindings for this domain
└── {sub-feature}/      # nested feature (items/add-items/, outfits/randomizer/)
```

**The `_hooks/use{Domain}.ts` pattern is the most valuable undocumented convention in the frontend.**
It bundles query + mutation + module-scoped state behind one call. From
`modules/items/_hooks/useItem.ts`:

```ts
const itemIdAtom = atom<Id<'items'> | null>(null);          // module-scoped, survives navigation

export const useItem = (_id?: Id<'items'> | null) => {
  const [fallbackId, setId] = useAtom(itemIdAtom);
  useEffect(() => { if (_id) setId(_id) }, [_id, setId])
  const id = _id || fallbackId;

  const { data: item, isPending } = useQueryCached(api.router.items.getOne.anon, id ? { itemId: id } : 'skip');
  const { mutate } = useMutation(api.router.items.editOne.authed);

  const update = (data: Omit<Parameters<typeof mutate>[0], 'itemId'>) =>
    id ? mutate({ ...data, itemId: id }) : undefined;

  return { item, isLoading: isPending, update };
}
```

Three techniques here are worth naming explicitly:

- **`'skip'` for conditional queries** — Convex's idiom for "don't run yet", avoiding a conditional hook.
- **Module-scoped Jotai atom as the fallback id**, so a detail screen keeps working when navigated to
  without params.
- **`Omit<Parameters<typeof mutate>[0], 'itemId'>`** — deriving the public argument type from the
  generated mutation signature, so a backend arg change surfaces as a frontend type error.

**State management overall:** Convex's reactive `useQuery` is the source of truth for server state.
Jotai appears in only 9 files, always for genuinely local/ephemeral UI state (pending uploads,
current id, streak animation). There is no Redux-style global store, and no client cache layer
duplicating server state. This restraint is correct and should be preserved.

### 4.4 `expo/lib/` — integration wrappers

```
expo/lib/
├── convex/        ★ client.ts, api.ts, auth.ts, agent.ts, storage.ts, upload.ts, utils.ts
├── image/
│   ├── client/    base64/, editing/, metadata/, heic-converter, download   (+ .web.ts variants)
│   └── server/    upload, post-upload, utils/  ⚠️ all marked @deprecated
├── s3/            storage.cloud.ts (+ a .deprecated.ts sibling)
├── posthog/       index.ts, useTrackValues.ts
├── revenue-cat/   getPermission, presentPaywall, presentManager
└── video/         downloadVideo.native.ts
```

`lib/convex/api.ts` is the **single choke point** to the generated API — 8 lines that re-export
`api`, `Doc`, `Id` and the schema constants. Everything else imports from here, never from
`convex/_generated/` directly. This is a clean, cheap seam and it holds.

`lib/convex/client.ts` adds real value over raw `convex/react`:

- `useMutation` / `useAction` return `{ mutate, isLoading, isSuccess, isError }` instead of a bare
  function — removes hand-rolled loading state from every call site.
- `useQueryCached` via `convex-helpers/react/cache` — persists results across unmounts, which matters
  for tab navigation.
- `useQueryCachedData` — a Jotai-backed cache for **action** results (actions aren't reactive, so
  they need explicit caching).

The `.native.ts` / `.web.ts` file-extension split for platform-specific implementations
(`download.ts` / `download.web.ts`, `apply-watermark.native.ts` / `.web.ts`) is Metro's built-in
mechanism and is used correctly.

**Dead weight:** the entire `lib/image/server/` tree is marked `@deprecated` in favour of the Convex
equivalents, and `lib/s3/storage.cloud.deprecated.ts` still ships.

### 4.5 `app/` — routing

96 files, 11.2k lines, organised with Expo Router groups:

```
app/
├── _layout.tsx           root: providers + fonts + splash
├── index.tsx             entry / redirect
├── auth.tsx              sign in
├── +native-intent.ts     deep-link resolution
├── (tabs)/               feed, explore, new, collection/, profile/(tabs)/
├── (modals)/             daily-streak, import-item, new-outfit, pick-outfit, pick-user, …
├── (extra)/              notifications, search, settings/, avatar/
├── (links)/              i/[id], o/[id], p/[id], u/[id]  — short share links
├── item/[id]/  outfit/[id]/  post/[id]/  preset/  user/[id]/  photoshoot/  scan/  generations/
├── admin/                bots/, statistics/, users/
└── welcome/              step-1..3, wait-list
```

**Observations:**

- The documented `app/[route]/_components/` + `_hooks/` + `_utils/` pattern is **used zero times**.
  All shared screen code went to `expo/modules/` instead. That is the better outcome — but it means
  the doc describes a structure that does not exist.
- Data access is split roughly evenly: **42 `useQuery` calls in `app/` screens, 36 in
  `expo/modules/`.** There is no rule about which layer owns fetching, so both do.
- Screen size ranges from ~30 to **437 lines** (`app/outfit/[id]/index.tsx`), with 14 screens over
  250 lines. The large ones mix layout, data fetching and business logic.
- Three separate route trees address a user profile: `app/user/[id]/`, `app/user/u/[id]/`, and
  `app/(links)/u/[id].tsx`.

### 4.6 Providers

13 nested providers in `expo/providers/index.tsx`, ordered outermost→innermost:

```
ConvexClientProvider → I18nProvider → ThemeProvider → MotionProvider → BlurProvider
  → SafeAreaProvider → KeyboardAvoiderProvider → AuthProvider → AsyncProviders
    → ShareIntentProvider → ToastsProvider → PostHogProvider → RevenueCatProvider
```

`AsyncProviders` (`providers/async/`) groups the non-blocking concerns — fonts, deep links, OTA and
native update checks, notifications, iOS tracking permission — so they don't delay first paint. That
separation of *blocking context* from *deferred side effects* is a good idea worth keeping.

---

## 5. Shared code — `utils/convex-allowed/`

```
utils/convex-allowed/
├── index.ts                barrel
├── typescript.helpers.ts   notEmpty(), type guards
├── color.ts                HSL/hex conversion, dominant colour extraction
├── dimensions.ts           aspect-ratio / resize maths
├── text.ts                 string normalisation
├── queue.ts                concurrency limiter
├── retry.ts                retry with backoff
├── random.ts               seeded random
├── routes.ts               shared route builders
├── s3.helpers.ts           key construction
└── lib/                    re-exports from expo/lib for Convex, RELATIVE PATHS ONLY
    ├── images.ts           → ../../../expo/lib/image/server/utils
    ├── color.ts
    └── s3.ts
```

Reached as `@shared/utils` from **both** tsconfigs. The constraint is that everything here must run
on Convex's edge runtime: no `window`, no `document`, no Node built-ins, no heavy dependencies.

The `lib/` subfolder is a deliberate re-export bridge that must use **relative paths, never aliases**,
because the two TS projects resolve aliases differently. It is a slightly awkward mechanism but it
does what it claims, and the "colour maths runs identically on client and server" property it buys is
real.

---

## 6. Cross-cutting layers

### Environment variables — two systems

| | Client (`env.js`) | Backend (`convex/env.ts`) |
|---|---|---|
| Library | `@t3-oss/env-core` + Zod | none — a plain object literal |
| Validation | ✅ throws on invalid | ❌ none |
| Missing value | ✅ fails at startup | ⚠️ silently becomes `''` |
| Prefix | `PUBLIC_` mapped from `EXPO_PUBLIC_*` | raw `process.env` |

The client side is done correctly. The backend side is 26 lines of
`KEY: process.env.KEY ?? ''`, and that `?? ''` is the root cause of the fail-open webhook
authentication described in [03-FLAWS.md #F3](./03-FLAWS.md).

### i18n

Configured (react-i18next, `en` + `fr`, synchronous bundled init, typed namespaces) and documented in
a 148-line guide — but **used in 1 file out of 332**, with 7 translation keys total. UI text is
hardcoded English in ~30 places. This is scaffolding, not a working feature.

### Analytics, payments, notifications

- **PostHog** — `expo/lib/posthog/`, provider-mounted, plus `useTrackValues` for declarative
  property tracking.
- **RevenueCat** — the live mobile payment path. `expo/lib/revenue-cat/` + webhook →
  `usersExtended.plan` + credits.
- **Stripe** — legacy/web path, still wired (`router/stripe/`, `lib/stripe/`, webhook) and still
  writing to the `@deprecated` `subscriptions` table. Two payment systems coexist.
- **Push** — `expo-notifications` + `expo-server-sdk`, tokens in `pushTokens`, fan-out via
  `router/notifications/sendPushNotification.ts`.

### Quality tooling

| Tool | Status |
|---|---|
| ESLint | ✅ `eslint-config-expo`, but 6 `import/*` rules disabled |
| TypeScript | ⚠️ `strict: true` in both projects, but **no `typecheck` script** |
| Tests | ❌ none |
| CI | ❌ none |
| Formatter | ❌ none configured (`prettier-plugin-tailwindcss` present with no Prettier) |

`package.json` scripts are `start`, `android`, `ios`, `web`, `convex:dev`, `playground`, `lint`.
Nothing runs `tsc`. Nothing runs in CI. Every rule in `.readme/` is enforced by human attention only —
which is precisely why the compliance numbers look the way they do.

---

## 7. Summary — what to carry forward

**Keep, unchanged:**

1. `expo/ui/` total isolation, enforced through structural prop types.
2. `router/{domain}/{operation}.ts` + access-level export names.
3. Shared `handler` + thin procedure wrappers for multi-access-level endpoints.
4. `functions/` (touches DB) vs `lib/` (doesn't) split, with `index.ts` barrels.
5. `procedures.ts` as the single auth injection point, and the `users` + `usersExtended` merge.
6. `llm/` as a sealed AI boundary with semantic model tiers and co-located pricing.
7. `_hooks/use{Domain}.ts` feature hooks owning each domain's Convex bindings.
8. `utils/convex-allowed/` as the edge-compatible shared bridge.
9. `lib/convex/api.ts` as the single choke point to generated types.
10. Const-array → validator → type schema pattern.
11. Convex reactivity as server state; Jotai only for ephemeral local state.

**Keep the idea, fix the implementation:**

12. Counter tables → use `@convex-dev/sharded-counter`.
13. `llm/triggers/` → fold into `router/` as a normal domain.
14. Ownership checks → make them a procedure, not an optional helper call.
15. Backend env → validate with Zod, fail at boot.

**Drop:**

16. Polymorphic optional-FK tables.
17. The unused `app/[route]/_components/` convention.
18. i18n scaffolding you won't populate (or enforce it from day one — pick one).
19. Two parallel payment systems.
20. `@deprecated` code left in the tree.
