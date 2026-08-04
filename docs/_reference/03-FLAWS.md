# 03 — Flaws: Defects, Evidence, and Fixes

> Every finding here is anchored to a file and line. Each carries a severity, the mechanism that
> produced it, and a concrete fix. The **Fix** blocks are written to be transplantable into the new
> project — they are the raw material for [04-BLUEPRINT.md](./04-BLUEPRINT.md).

**Severity scale**

| | Meaning |
|---|---|
| 🔴 **Critical** | Exploitable today, or will corrupt data / leak data. Fix before anything else. |
| 🟠 **High** | Will cause outages, data loss or security failure under realistic conditions. |
| 🟡 **Medium** | Degrades correctness, performance or maintainability at scale. |
| 🔵 **Low** | Hygiene, consistency, dead weight. |

---

## Index

| # | Flaw | Severity |
|---|---|---|
| F1 | Two endpoints expose any user's private data to any signed-in user | 🔴 |
| F2 | Three webhooks accept unauthenticated requests | 🔴 |
| F3 | Missing env vars silently disable security checks | 🔴 |
| F4 | A public mutation returns working credentials | 🔴 |
| F5 | `adminQuery` / `adminMutation` inject the wrong context | 🟠 |
| F6 | Ownership checks are optional and applied in 7 of 22 places | 🟠 |
| F7 | No typecheck, no tests, no CI | 🟠 |
| F8 | `procedures.ts` is incomplete; a correct rule was dropped after a misdiagnosis (58 files) | 🟠 |
| F9 | Full-table scans in user-facing hot paths | 🟡 |
| F10 | Webhook lookups scan an unindexed table | 🟡 |
| F11 | Hot-document write contention on counter tables | 🟡 |
| F12 | Post-index `.filter()` breaks pagination page sizes | 🟡 |
| F13 | Polymorphic optional-FK tables permit invalid states | 🟡 |
| F14 | Business logic accumulates in router files | 🟡 |
| F15 | Manual, incomplete cascade deletes | 🟡 |
| F16 | 17 empty `catch` blocks silently swallow errors | 🟡 |
| F17 | Ad-hoc export names defeat the access-level contract | 🟡 |
| F18 | Two payment systems coexist; one writes to a deprecated table | 🟡 |
| F19 | Dead code and unfinished migrations shipped | 🔵 |
| F20 | Screens carry too much responsibility | 🔵 |
| F21 | Self-referential barrel export | 🔵 |
| F22 | Naming and timestamp inconsistencies across the schema | 🔵 |

---

## 🔴 F1 — Two endpoints expose any user's private data to any signed-in user

**Evidence**

```ts
// convex/router/credits/getUserWallet.ts:48-51
export const admin = authQuery({                    // ← authQuery, NOT adminQuery
  args: { userId: v.id("users") },
  handler: async (ctx, args) => handler(ctx, args.userId)
});
```

```ts
// convex/router/users/getAppearance.ts:19-24
export const admin = authQuery({                    // ← authQuery, NOT adminQuery
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => getAppearance(ctx, userId)
})
```

**Mechanism.** Both are named `admin`, which by the project's own contract means "ADMIN role
required". Both actually use `authQuery`, which checks only that *someone* is signed in. The `userId`
comes from the caller's arguments and is never compared against `ctx.userId`. This is a textbook
IDOR: any authenticated client can call
`api.router.users.getAppearance.admin({ userId: <anyone> })`.

**Impact.** `getAppearance` returns `usersAppearance`: height in cm, gender, body size classification,
and the ids of the user's front/side/smile portrait images. `getUserWallet` returns credit balance
and streak history. Both are private user data, exposed for every user in the system.

**Why it survived.** The export name is the only place the access level is visible at the call site.
The name says `admin`. Nothing — not the type system, not a lint rule, not a test — checks that the
name matches the builder.

**Fix — immediate**

```ts
export const admin = adminQuery({ ... });   // both files
```

**Fix — structural (this is the one that matters).** Make the name/procedure mismatch impossible by
deriving the export name from the procedure. Two mechanisms, use both:

1. A lint rule that reads the export name and the builder identifier in the same statement and fails
   on mismatch. ~30 lines of ESLint AST work; see [04-BLUEPRINT.md §Enforcement](./04-BLUEPRINT.md).
2. Better: eliminate the class entirely with an **ownership-aware procedure** that delegates to the
   existing `isAuthorized` helper, so "read another user's row" is not expressible without saying so:

```ts
// convex/procedures.ts
import { isAuthorized } from "./functions/users/isAuthorized";

/**
 * Loads `args.id`, asserts the caller owns it, exposes it as `ctx.doc`.
 * The ownership RULES stay in isAuthorized (functions/); this wrapper only
 * guarantees they are always APPLIED — which is the half Predecessor left optional.
 */
export const ownedQuery = <T extends OwnedTable>(table: T) =>
  customQuery(query, {
    args: { id: v.id(table) },
    input: async (ctx, { id }) => {
      const { user, userId } = await userCheckOrThrow(ctx);
      const doc = await isAuthorized({ ...ctx, userId, user }, id);   // throws on denial
      return { ctx: { user, userId, doc: doc as Doc<T> }, args: {} };
    },
  });
```

Reusing `isAuthorized` rather than reimplementing the check matters: it already handles indirect
ownership (a `prediction` is owned by whoever owns its parent `generation`), and that logic should
exist once. See [04-BLUEPRINT §3.2](./04-BLUEPRINT.md) for the full version and the accompanying rule
that `isAuthorized` is never called from `router/` directly.

---

## 🔴 F2 — Three webhooks accept unauthenticated requests

**Evidence**

```ts
// convex/http/replicate.ts:5-8
export const replicateHandler = httpAction(async (ctx, request) => {
  const json = await request.json();
  const body = parseReplicateWebhook(json);   // ← Zod shape parse only. No signature check.
```

`parseReplicateWebhook` (`convex/lib/replicate/utils.ts:33-40`) is `ReplicateWebhookSchema.safeParse`
— it validates the JSON *shape* and nothing else. `convex/http/runpod/removeBackground.ts` and
`convex/http/runpod/generateVideo.ts` contain no signature, secret, or authorization check at all
(grep for `signature|authorization|secret|verify|401` returns zero hits in both).

**Impact.** These endpoints are public URLs on the Convex site. An attacker who can guess or observe
a `predictionId` can:

- POST `{ status: "succeeded", output: "https://attacker/image.png", … }` and have the backend
  download that URL, upload it to the project's S3, and attach it to the **real owner's** generation
  (the owner is resolved server-side from the prediction id, so the payload lands in a victim's
  account);
- POST `{ status: "failed" }` to destroy any in-flight generation;
- replay any captured payload indefinitely.

For comparison, `convex/router/stripe/http.webhook.ts:15-24` does it correctly with
`stripe.webhooks.constructEventAsync`.

**Fix**

```ts
// convex/http/replicate.ts
export const replicateHandler = httpAction(async (ctx, request) => {
  const raw = await request.text();                       // read raw body BEFORE parsing
  await verifyReplicateSignature(request.headers, raw);   // throws → 401
  const body = parseReplicateWebhook(JSON.parse(raw));
  …
});
```

Replicate signs with an `svix`-compatible scheme (`webhook-id`, `webhook-timestamp`,
`webhook-signature`). RunPod requires either a shared bearer secret in the callback URL or an
HMAC over the body — whichever the provider supports, **the handler must reject when it is absent**.

**Structural fix.** No `httpAction` should be registered without verification. Make it
unrepresentable:

```ts
// convex/http/verified.ts
export const verifiedWebhook = <T>(opts: {
  verify: (req: Request, raw: string) => Promise<void>;   // REQUIRED — no default
  parse: (json: unknown) => T;
  handle: (ctx: ActionCtx, body: T) => Promise<Response>;
}) => httpAction(async (ctx, request) => {
  const raw = await request.text();
  try { await opts.verify(request, raw); }
  catch { return new Response('Unauthorized', { status: 401 }); }
  return opts.handle(ctx, opts.parse(JSON.parse(raw)));
});
```

Then forbid bare `httpAction` outside `http/verified.ts` with a lint rule. There is no way to
register a webhook without supplying a verifier.

---

## 🔴 F3 — Missing environment variables silently disable security checks

**Evidence**

```ts
// convex/env.ts:1-26  (all 26 lines follow this shape)
export const env = {
  SERVER_PRIVATE_KEY: process.env.SERVER_PRIVATE_KEY ?? '',
  KIE_WEBHOOK_HMAC_KEY: process.env.KIE_WEBHOOK_HMAC_KEY ?? '',
  REVENUECAT_WEBHOOK_SECRET: process.env.REVENUECAT_WEBHOOK_SECRET ?? '',
  …
}
```

Three consumers turn that `''` into an open door:

```ts
// convex/http/revenuecat.ts:32-36
const webhookSecret = env.REVENUECAT_WEBHOOK_SECRET;
if (webhookSecret && authorization !== webhookSecret) {   // ← '' is falsy → check SKIPPED
  return new Response("Unauthorized", { status: 401 });
}
```

```ts
// convex/http/kie.ts:12-18
if (env.KIE_WEBHOOK_HMAC_KEY) {                            // ← '' is falsy → check SKIPPED
  … verifyKieWebhookSignature …
}
```

```ts
// convex/procedures.ts:92 (and :102, :110)
if (_serverKey !== env.SERVER_PRIVATE_KEY) throw new Error("Invalid API key");
// ← if SERVER_PRIVATE_KEY is unset, passing _serverKey: "" authenticates successfully
```

**Impact.** A deployment that forgets one environment variable does not fail — it comes up healthy
with authentication disabled on the corresponding surface. For `SERVER_PRIVATE_KEY`, all 12
`server*` procedures become callable by anyone who sends `_serverKey: ""`. RevenueCat's handler grants
subscription entitlements and credits, so an unauthenticated caller could mint premium accounts.

This is the highest-leverage fix in the report: it is one file, and it closes a whole class.

**Fix — validate at module load, fail loudly**

```ts
// convex/env.ts
import { z } from "zod";

const schema = z.object({
  // Required — deployment refuses to start without these
  CONVEX_SITE_URL:            z.string().url(),
  SERVER_PRIVATE_KEY:         z.string().min(32),
  REVENUECAT_WEBHOOK_SECRET:  z.string().min(16),
  KIE_WEBHOOK_HMAC_KEY:       z.string().min(16),
  STRIPE_SECRET_KEY:          z.string().startsWith("sk_"),
  // Genuinely optional — must be explicitly typed as such
  BYTEPLUS_API_KEY:           z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    "Invalid Convex environment:\n" +
    parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join("\n")
  );
}
export const env = parsed.data;
```

**Rules that follow:** never `?? ''` on a secret. Optional means `.optional()` and `string |
undefined`, so the type system forces the caller to handle absence. And never gate a security check
on the truthiness of the secret — if the secret is missing, that is a fatal error, not a reason to
skip verification.

Also fix the comparison itself: `_serverKey !== env.SERVER_PRIVATE_KEY` is a non-constant-time string
compare. Use a constant-time equality helper.

---

## 🔴 F4 — A public mutation returns working credentials

**Evidence**

```ts
// convex/router/auth/getTestAccount.ts — the entire file
import { mutation } from "../../_generated/server";

export const anon = mutation({
  handler: async () => {
    return { email: '<redacted>', password: '<redacted>' }   // ← a real, working account
  }
})
```

> 🔒 **Redacted.** The literal credentials were removed from this document. They existed in the
> source and were valid at audit time; if the endpoint has not been deleted, redacting a write-up
> changes nothing. See the fix below.

**Impact.** `api.router.auth.getTestAccount.anon` is callable by anyone with the deployment URL, with
no authentication. It returns credentials for an account that the `Password` provider
(`convex/auth.ts:40`) will accept. Whatever that account can do, an anonymous internet caller can do.

**Secondary finding.** This file is also the sole use of the raw `mutation` builder — a direct
consequence of `publicMutation` not existing (see F8 and [02-DIVERGENCE #D2](./02-DIVERGENCE.md)).
The missing abstraction produced both the rule violation *and* the vulnerability.

**Fix.** Delete the file and the test account. Test credentials belong in a local `.env`, an E2E test
fixture, or a seed script gated on `NODE_ENV !== 'production'` — never in a callable endpoint.

---

## 🟠 F5 — `adminQuery` and `adminMutation` inject the wrong context

**Evidence**

```ts
// convex/procedures.ts:115-131
export const adminAction = customAction(action, customCtx(async (ctx) => {
  const data = await userCheckOrThrow(ctx);
  if (data.user.role !== 'ADMIN') throw new Error("Unauthorized");
  return data;                                   // ✅ returns { user, userId }
}))

export const adminQuery = customQuery(query, customCtx(async (ctx) => {
  const data = await userCheckOrThrow(ctx);
  if (data.user.role !== 'ADMIN') throw new Error("Unauthorized");
  return { ctx, args: {} };                      // ❌ returns the wrong shape
}))

export const adminMutation = customMutation(mutation, customCtx(async (ctx) => {
  …
  return { ctx, args: {} };                      // ❌ same
}))
```

**Mechanism.** Verified against the installed `convex-helpers` source
(`node_modules/convex-helpers/server/customFunctions.js`):

```js
export function customCtx(modifyCtx) {
  return { args: {}, input: async (ctx, _, extra) => ({ ctx: await modifyCtx(ctx, extra), args: {} }) };
}
```

`customCtx` already wraps the return value in `{ ctx: … }`. The builder then spreads that over the
original context. So `adminQuery`'s handler receives `{ ...originalCtx, ctx: originalCtx, args: {} }`
— it gains useless `ctx.ctx` and `ctx.args` properties, and **`ctx.user` / `ctx.userId` are absent**.
`adminAction`, which returns `data` directly, is correct.

**Severity: High, not Critical — and the distinction is worth being precise about.** The role check
runs *before* the return, so authorization is not bypassed. And no current handler depends on it: the
four `admin` exports that appear alongside `ctx.user` usage
(`generations/getPaginated.ts`, `items/getPaginated.ts`, `outfits/createOne.ts`,
`users/getAccount.ts`) all confine `ctx.user` to their `authed` export and take an explicit `userId`
argument in the `admin` one. **The bug is live but latent.** The first admin handler written against
`ctx.user` will read `undefined` — and because the shared-handler pattern makes `admin` and `authed`
look symmetric, that mistake is very easy to make.

**Fix**

```ts
const requireAdmin = customCtx(async (ctx) => {
  const data = await userCheckOrThrow(ctx);
  if (data.user.role !== 'ADMIN') throw new ConvexError("Forbidden");
  return data;                                   // { user, userId } — same as adminAction
});

export const adminQuery    = customQuery(query, requireAdmin);
export const adminMutation = customMutation(mutation, requireAdmin);
export const adminAction   = customAction(action, requireAdmin);
```

One shared customization for all three, so they cannot drift apart again.

---

## 🟠 F6 — Ownership checks are optional, and applied in 7 of 22 places

**Evidence.** `convex/functions/users/isAuthorized.ts` is a well-built generic ownership checker: it
accepts an id or a document across five tables, walks `doc.userId`, falls back to
`doc.generationId → generation.userId` for nested resources, and throws by default.

It is called in exactly 7 locations:

```
router/generations/publishRest.ts:11      router/items/editOne.ts:24
router/generations/updatePrediction.ts:139 router/outfits/deleteOne.ts:11
router/items/deleteOne.ts:20              router/outfits/editOne.ts:15
router/presets/updateOne.ts:14            (via internal.utils.isAuthorized._internal)
```

There are **22 files** in `convex/router/` defining `authMutation` handlers. Every one that accepts a
document id and does not call `isAuthorized` is relying on the handler author having remembered to
compare `doc.userId` by hand — or having simply not needed to.

**Mechanism.** Authorization is a *convention* (call this helper) rather than a *capability* (the
procedure gives you a pre-authorized document). Conventions decay; capabilities do not.

Note the inconsistency this already produced: `router/presets/updateOne.ts:14` reaches the check via
`ctx.runQuery(internal.utils.isAuthorized._internal, …)` — a round trip through a wrapper in
`convex/utils/` — while six siblings call the function directly. Two mechanisms for one concern.

**Fix — make the check the only way to get the document**

```ts
// convex/procedures.ts
type Owned = 'recipes' | 'ingredients' | 'items';   // tables with a userId column

/**
 * Loads `args.id`, asserts the caller owns it, and hands it to the handler.
 * There is no code path that reaches the handler with an unowned document.
 */
export const ownedMutation = <T extends Owned>(table: T) =>
  customMutation(mutation, {
    args: { id: v.id(table) },
    input: async (ctx, { id }) => {
      const { user, userId } = await userCheckOrThrow(ctx);
      const doc = await ctx.db.get(id);
      if (!doc)               throw new ConvexError('Not found');
      if (doc.userId !== userId && user.role !== 'ADMIN')
                              throw new ConvexError('Forbidden');
      return { ctx: { user, userId, doc }, args: {} };
    },
  });

// usage — ownership is structural, not remembered
export const authed = ownedMutation('recipes')({
  args: { name: v.string() },
  handler: async (ctx, { name }) => ctx.db.patch(ctx.doc._id, { name }),
});
```

---

## 🟠 F7 — No typecheck, no tests, no CI

**Evidence.** `package.json` scripts, in full:

```json
"start", "start:no-cache", "android", "ios", "web", "convex:dev", "playground", "lint", "postinstall", "preinstall"
```

There is no `tsc --noEmit`. There is no test runner in `devDependencies`. There is no
`.github/workflows/`. `.readme/` states it plainly (`copilot-instructions.md:172`): *"No automated
tests currently"*, *"No CI/CD workflows currently configured"*.

**Impact.** This is the meta-flaw. Every other finding in this document — the naming mismatches, the
58 import violations, the missing `publicMutation`, the fail-open env vars — is the kind of thing a
50-line CI job catches on the first commit. `strict: true` is set in both tsconfigs and nothing ever
runs the compiler.

**Fix**

```jsonc
// package.json
"scripts": {
  "typecheck":      "tsc --noEmit && tsc --noEmit -p convex/tsconfig.json",
  "test":           "vitest run",
  "lint":           "expo lint",
  "verify":         "pnpm typecheck && pnpm lint && pnpm test"
}
```

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
```

Backend tests use `convex-test`, which runs queries/mutations in-memory with a mock identity — no
deployment needed. Start with the authorization tests: for every `authed`/`admin` export, one test
asserting the wrong caller is rejected. That single suite would have caught F1 and F5.

---

## 🟠 F8 — `procedures.ts` is incomplete, and a correct rule was dropped as a result

**Evidence.** `procedures.ts` provides 14 exports. The code needs more:

| Needed by router/http/llm code | Files affected | In `procedures.ts`? |
|---|---:|---|
| `internalAction` | 35 | ❌ |
| `httpAction` | 6 | ❌ |
| `publicMutation` | 1 | ❌ |
| `MutationCtx` / `ActionCtx` / `QueryCtx` as *value* imports | 15 | ⚠️ type-only |
| `internalQuery` / `internalMutation` | 22 | ✅ (these violations are gratuitous) |

**41 of 58 violating files had no legal alternative.**

**There is a second cause, and diagnosing it precisely is what makes the rule recoverable.**
`convex/_generated/**api**.d.ts` type-imports **every module in the project**
(`import type * as router_items_getOne from "../router/items/getOne.js"`, ×300). And
`convex/procedures.ts:6` imports `internal` from it, needed for the action-context branch of
`userCheck` (`procedures.ts:39`).

That single import puts `procedures.ts` **inside a project-wide circular type reference**:

```
router/items/getOne.ts ──imports──> procedures.ts ──imports──> _generated/api
        ▲                                                            │
        └────────────────────── type-imports every module ───────────┘
```

TypeScript responds with *"'X' implicitly has type 'any' because it is referenced directly or
indirectly in its own initializer"*. `procedures.ts:15` documents the finding accurately:

```ts
// export { internal, api } from './_generated/api'; // CIRCULAR DEPENDENCY
```

**But the constraint belongs to `_generated/api` only.** The two generated modules have different
dependency graphs:

| Module | Its `.d.ts` imports | In the cycle? | Safe to re-export from `procedures.ts`? |
|---|---|---|---|
| `_generated/**server**` | `convex/server`, `./dataModel.js` | ❌ no | ✅ **yes** |
| `_generated/**api**` | every module in the project | ✅ yes | ❌ no |

So the rule never needed to be abandoned. `procedures.ts` can re-export `internalAction`,
`httpAction` and every ctx type **today, with no cycle** — provided it does not itself import
`_generated/api`. The rule is correct and should be enforced.

**Fix — remove the one cycle-causing import, then complete the surface:**

```ts
// convex/procedures.ts
// ⚠️ INVARIANT: never import "./_generated/api" here — it creates a project-wide type cycle.
import { makeFunctionReference } from "convex/server";

/** Typed reference by string path — no api type graph, no cycle. */
const getAccountRef = makeFunctionReference<"query", { userId: Id<'users'> }, AppUser | null>(
  "router/users/getAccount:_internal"
);

// …in the action branch of userCheck, replace
//   ctx.runQuery(internal.router.users.getAccount._internal, { userId })
// with
//   ctx.runQuery(getAccountRef, { userId })
```

Then, and only then, complete the surface:

```ts
// convex/procedures.ts — export everything a function file could need
export {
  internalQuery, internalMutation, internalAction, httpAction,
} from "./_generated/server";
export type { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
export const publicQuery    = query;
export const publicMutation = mutation;      // ← the missing one
export const publicAction   = action;
```

```js
// eslint.config.js — now that compliance is possible, make it mandatory
{
  files: ['convex/**/*.ts'],
  ignores: ['convex/_generated/**', 'convex/procedures.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['**/_generated/server'],
        message: 'Import builders and ctx types from convex/procedures.ts instead.',
      }],
    }],
  },
}
```

**`_generated/api` must stay permitted everywhere else.** Router files legitimately need `internal`
and `api`, and those genuinely cannot come from `procedures.ts` — `procedures.ts:15` already carries
the comment `// CIRCULAR DEPENDENCY` acknowledging exactly this. Restricting the wrong generated
module is what would break the rule a second time: the constraint is on `_generated/api`, the rule is
about `_generated/server`, and conflating them is how the original rule became unfollowable.

---

## 🟡 F9 — Full-table scans in user-facing hot paths

**Evidence**

```ts
// convex/router/outfits/deleteOne.ts:24-29 — runs on EVERY outfit deletion
const presetGenerations = await ctx.db.query('presetGenerations').collect();
for (const record of presetGenerations) {
  if (record.outfitId === args.outfitId) await ctx.db.delete(record._id);
}
```

The table **has** the index this needs — `presetGenerations.index("by_outfit_id", ["outfitId"])`
(`convex/schema/presets.ts:134`). It simply is not used.

Other unindexed `.collect()` calls over whole tables:

| Location | Table | Context |
|---|---|---|
| `router/users/deleteAccount.ts:205` | `quests` | account deletion |
| `router/quests/getAll.ts:5` | `quests` | public query |
| `router/quests/initAll.ts:391` | `quests` | admin init |
| `router/admin/items/fixColors.ts:32` | `items` | admin batch |
| `router/admin/items/fixTrends.ts:6` | `items` | admin batch |
| `router/admin/outfits/fixTrends.ts:6` | `outfits` | admin batch |
| `router/admin/outfits/regenerateCovers.ts:6` | `outfits` | admin batch |
| `router/admin/bots/getAll.ts:6` | `bots` | admin list |
| `router/admin/config/initConfig.ts:13,25` | `waitlist`, `config` | one-off init |

The `quests` scans are bounded (quests are a small fixed catalogue) and the admin ones are acceptable
if genuinely one-off — though Convex will hard-fail a `.collect()` that exceeds its read limits, so
`items`/`outfits` scans become outages as those tables grow.

**Fix — the hot path**

```ts
const presetGenerations = await ctx.db
  .query('presetGenerations')
  .withIndex('by_outfit_id', q => q.eq('outfitId', args.outfitId))
  .collect();
for (const { _id } of presetGenerations) await ctx.db.delete(_id);
```

**Fix — the class.** Adopt the rule *every `ctx.db.query()` is immediately followed by `.withIndex()`
or `.withSearchIndex()`*, with the only exceptions being tables documented as bounded catalogues.
For admin batch jobs over unbounded tables, use `.paginate()` in a workflow — the codebase already
does this correctly in `workflows/database/countUserMetrics.ts:87-89`.

---

## 🟡 F10 — Webhook lookups scan an unindexed table

**Evidence**

```ts
// convex/router/subscriptions/cancelSubscription.ts:13-14
const subscription = await ctx.db.query("subscriptions")
  .filter((q) => q.eq(q.field("stripeSubscriptionId"), args.stripeSubscriptionId))
```

```ts
// convex/router/subscriptions/updateSubscriptionStatus.ts:16-17
const subscription = await ctx.db.query("subscriptions")
  .filter((q) => q.eq(q.field("stripeSubscriptionId"), stripeSubscriptionId))
```

`subscriptions` has exactly one index: `by_user_id_and_active`. There is no index on
`stripeSubscriptionId`, so `.filter()` here is a **post-scan filter over every subscription row**, on
the Stripe webhook path — the path that must be fastest and most reliable.

**Fix**

```ts
// convex/schema/subscriptions.ts
.index("by_user_id_and_active", ["userId", "isActive"])
.index("by_stripe_subscription_id", ["stripeSubscriptionId"])   // add
```

**The general rule:** `.filter()` on a Convex query never uses an index. If you are filtering on a
field you look documents up by, you want an index and `.withIndex()`. Reserve `.filter()` for
narrowing an already-indexed, already-small result set.

---

## 🟡 F11 — Hot-document write contention on counter tables

**Evidence.** `likeStats`, `bookmarkStats` and `followStats` each hold one row per target, updated
in-line by the toggling mutation (`router/likes/toggleLike.ts:51,62` → `updateStats(ctx, …, ±1)`).

**Be precise about what is and is not wrong here.** Convex mutations are serializable ACID
transactions, so this is **not** a lost-update race — the count will not silently drift. The problem
is throughput: every like on a given post writes the *same* document. Convex resolves write conflicts
with optimistic concurrency and retries, so as concurrency on one post rises, mutations retry, then
fail. A post going viral is precisely when likes break.

`waitlist` (`schema/waitlist.ts:5-11`) is the same shape and worse — a **single global row** holding
four counters, written by every signup.

**Fix**

```ts
// convex/convex.config.ts
import shardedCounter from "@convex-dev/sharded-counter/convex.config";
app.use(shardedCounter);
```

```ts
// convex/functions/likes/counter.ts
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { components } from "../../_generated/api";

export const likeCounter = new ShardedCounter(components.shardedCounter, {
  defaultShards: 16,          // 16 documents share the write load
});

// in the mutation
await likeCounter.add(ctx, generationId, +1);
// on read
const count = await likeCounter.count(ctx, generationId);
```

The component shards writes across N documents and sums on read, which is exactly the trade the
workload wants. Use it for any counter that can be written concurrently by many users.

---

## 🟡 F12 — Post-index `.filter()` breaks pagination page sizes

**Evidence**

```ts
// convex/router/generations/getPaginated.ts:40-44
const result = await ctx.db.query("generations")
  .withIndex("by_user_id", (q) => q.eq("userId", userId))
  .order("desc")
  .filter(q => q.eq(q.field("publication"), "PUBLISHED"))    // ← applied AFTER the index read
  .paginate(paginationOpts);
```

**Mechanism.** Convex paginates over the *index* read, then applies `.filter()` to the page. A page
requested with `numItems: 24` can therefore return anywhere from 0 to 24 documents depending on how
many drafts happen to fall in that window — while still reporting `isDone: false`. Infinite-scroll UIs
that stop when a page looks short will terminate early and silently hide content.

**Fix.** Put the filter in the index so pagination operates on the filtered set:

```ts
// schema/generations.ts — this index already exists and is the right one
.index("by_publication_status_and_user_id", ["publication", "userId"])
```

```ts
const result = await ctx.db.query("generations")
  .withIndex("by_publication_status_and_user_id",
    q => q.eq("publication", "PUBLISHED").eq("userId", userId))
  .order("desc")
  .paginate(paginationOpts);
```

The correct index was already defined and simply not used. **Rule: never combine `.filter()` with
`.paginate()`.**

---

## 🟡 F13 — Polymorphic optional-FK tables permit invalid states

**Evidence**

```ts
// convex/schema/likes.ts:6-17
export const likes = defineTable({
  userId: v.id("users"),
  type: LIKEABLE_TYPE,                       // "generation" | "outfit"
  generationId: v.optional(v.id("generations")),
  outfitId: v.optional(v.id("outfits")),
})
```

Same shape in `bookmarks` (three optional FKs), `likeStats`, `bookmarkStats`, `userReports` (four),
`feedScores`, `predictions`, `notifications` (five).

**Mechanism.** The schema permits both FKs set, neither set, or `type` disagreeing with whichever is
set. Nothing at the database layer prevents it. The invariant is enforced by hand at runtime, in each
writer:

```ts
// convex/router/likes/toggleLike.ts:26-29
const providedIds = [generationId, outfitId].filter(Boolean);
if (providedIds.length !== 1)
  throw new ConvexError("Exactly one of generationId or outfitId must be provided");
```

That check is correct — and it has to be re-implemented, correctly, in every writer forever. Readers
pay too: every consumer branches on `type` and then non-null-asserts the matching field
(`outfitId: outfitId!` at `toggleLike.ts:64`).

**Fix — one polymorphic id, not N optional ones**

The cleanest shape for a "this row points at one of several tables" relationship is a **single field
whose type is a union of id types**, plus a discriminant:

```ts
export const likes = defineTable({
  userId:     v.id("users"),
  targetType: v.union(v.literal("generation"), v.literal("outfit")),
  targetId:   v.union(v.id("generations"), v.id("outfits")),
})
  .index("by_user_and_target", ["userId", "targetId"])
  .index("by_target",          ["targetId"])
  .index("by_user_and_type",   ["userId", "targetType"]);
```

Why this and not a nested discriminated union:

- **The database rejects invalid rows.** There is no way to express "both ids set" or "neither set",
  so the hand-written guard at `toggleLike.ts:26-29` disappears — and cannot be forgotten in the next
  writer.
- **Indexes carry only relevant rows.** Convex ids are globally unique strings, so
  `by_target` answers "everything pointing at this outfit" in one index — which is exactly the
  cascade lookup that [F15](#-f15--manual-incomplete-cascade-deletes) showed was missing.
- **Reads narrow cleanly.** `if (like.targetType === "outfit")` narrows `targetId` to
  `Id<"outfits">`, so the `outfitId!` non-null assertions disappear.

> ⚠️ **A note on the nested-union alternative.** You *can* write
> `target: v.union(v.object({ kind: v.literal("generation"), generationId: v.id("generations") }), …)`
> and index `["userId", "target.generationId"]` — Convex supports dot-separated paths on nested
> documents, and it typechecks. **But it does not fix the index problem.** Fields missing from a
> document are indexed as `undefined` (which sorts before `null` and everything else), so every
> *outfit* like still occupies a slot in `by_user_generation` under the `undefined` key. Lookups stay
> correct, but the index spans the whole table — exactly the property the optional-FK design had.
> The nested union improves write-validity and type narrowing; it does **not** improve indexing. Use
> the flat `targetId` union above when the field is indexed, and reserve nested discriminated unions
> for data you *don't* index on — like the `source` field in
> [04-BLUEPRINT §4.2](./04-BLUEPRINT.md).

---

## 🟡 F14 — Business logic accumulates in router files

**Evidence.** The stated architecture is *routers are thin; reusable DB logic lives in `functions/`*.
Measured reality:

| `convex/router/` | lines | | `convex/functions/` | lines |
|---|---:|---|---|---:|
| **Total** | **8,215** | | **Total** | **2,037** |

The router is **4× the size** of the layer meant to hold the logic. Examples:

- `router/quests/initAll.ts` — 429 lines, a hardcoded quest catalogue in a router file
- `router/outfits/updateCover.ts` — 313 lines of image composition
- `router/users/deleteAccount.ts` — 296 lines of cascade logic
- `router/outfits/createOne.ts:21-67` — the "create outfit" handler does dominant-colour extraction,
  nearest-colour-name lookup against `color-name-list`, and Faker-based name generation, all inline

**Fix.** Sharpen the rule so the boundary is decidable rather than aesthetic:

> A `router/` file may contain **only**: `args` validators, procedure wrappers, and a `handler` that
> is a call into `functions/` plus argument shaping. If a router file contains a loop, a conditional
> branch on domain state, or an import of a domain library (`color-name-list`, `@faker-js/faker`), the
> logic belongs in `functions/`.

Enforceable approximation: **cap router files at ~80 lines** in CI. Crude, but it makes the boundary
observable, and every current offender is a genuine violation.

---

## 🟡 F15 — Manual, incomplete cascade deletes

**Evidence.** `router/outfits/deleteOne.ts` deletes an outfit and cleans up `outfitItems`,
`feedScores` and `presetGenerations` by hand. `router/users/deleteAccount.ts` is 296 lines of the
same, across ~15 tables.

Nothing guarantees completeness. When a new table gains an `outfitId` column, every hand-written
cascade must be found and updated. The schema has 39 app-defined tables and the relationships are implicit.

Concretely: `deleteOne.ts` cleans `outfitItems`, `feedScores` and `presetGenerations` — but six other
tables carry an `outfitId` and are **not** cleaned. Deleting an outfit orphans rows in all of them:

| Table | Has `outfitId` | Index usable for cleanup |
|---|---|---|
| `likes` | ✅ optional | ❌ only `by_user_outfit` `["userId","outfitId"]` — unusable without a userId |
| `likeStats` | ✅ optional | ✅ `by_outfit_id` |
| `bookmarks` | ✅ optional | ❌ only `by_user_outfit` |
| `bookmarkStats` | ✅ optional | ✅ `by_outfit_id` |
| `notifications` | ✅ optional | ❌ **no index on `outfitId` at all** |
| `userReports` | ✅ optional | ❌ **no index on `outfitId` at all** |

A compound index led by `userId` cannot answer "all rows for this outfit", so cleaning `likes` and
`bookmarks` correctly requires **adding** `by_outfit_id` indexes first. This is the second-order cost
of hand-written cascades: the schema was never designed to support the deletes the app needs.

**Fix.** Add the missing indexes, then declare relationships once and derive the cascade:

```ts
// convex/functions/cascade.ts
const CASCADE: Record<string, { table: TableNames; index: string; field: string }[]> = {
  outfits: [
    { table: 'outfitItems',       index: 'by_outfit_id', field: 'outfitId' },
    { table: 'feedScores',        index: 'by_outfit_id', field: 'outfitId' },
    { table: 'presetGenerations', index: 'by_outfit_id', field: 'outfitId' },
    { table: 'likes',             index: 'by_outfit_id', field: 'outfitId' },  // index to add
    { table: 'likeStats',         index: 'by_outfit_id', field: 'outfitId' },
    { table: 'bookmarks',         index: 'by_outfit_id', field: 'outfitId' },  // index to add
    { table: 'bookmarkStats',     index: 'by_outfit_id', field: 'outfitId' },
    { table: 'notifications',     index: 'by_outfit_id', field: 'outfitId' },  // index to add
    { table: 'userReports',       index: 'by_outfit_id', field: 'outfitId' },  // index to add
  ],
};

export const cascadeDelete = async (ctx: MutationCtx, table: string, id: GenericId<any>) => {
  for (const rel of CASCADE[table] ?? []) {
    const rows = await ctx.db.query(rel.table)
      .withIndex(rel.index, q => q.eq(rel.field, id)).collect();
    for (const r of rows) await ctx.db.delete(r._id);
  }
  await ctx.db.delete(id);
};
```

Now adding a dependent table is one line in one place, and a test can assert that every table with an
`outfitId` column appears in `CASCADE.outfits` **and** that each referenced index exists — which is
exactly the check that would have caught the four missing indexes above. For very large fan-outs,
schedule the cascade in batches rather than doing it in one mutation.

The deeper lesson feeds the blueprint: **design the delete path when you design the table.** Every
foreign key you add creates a cascade obligation, and the index that satisfies it must be declared at
the same moment — otherwise you discover the gap only when data starts leaking.

---

## 🟡 F16 — 17 empty `catch` blocks silently swallow errors

**Evidence.** 17 occurrences of `catch {}` / `catch (e) {}` across `convex/`, `expo/` and `app/`.
The most consequential:

```ts
// convex/llm/utils/usageHandler.ts:49-60
try {
  console.log('TODO: Implement usageHandler to charge tokens', ratio);
  // await ctx.runMutation(internal.router.subscription.cost.payTokens._internal, { … });
} catch { }
```

LLM token usage is computed, logged as a TODO, and discarded. The billing hook the architecture
documents as existing does not exist.

**Fix.** Empty catch blocks are only acceptable with a comment stating why the error is safe to
ignore. Otherwise log with context, or let it throw. Enforce with ESLint `no-empty` (which fires on
empty blocks) plus a review rule.

---

## 🟡 F17 — Ad-hoc export names defeat the access-level contract

Quantified in [02-DIVERGENCE #D4](./02-DIVERGENCE.md): 55 of 248 exports (22%) use one of 26 invented
names.

**Root cause, restated as a design failure:** the contract permits one `_internal` export per file,
but the async orchestration pattern needs 2–4 internal steps per file. No sanctioned way to express
that was ever defined, so authors invented `_internal_step`, `_internal_cache`, `_internal_query`,
`_internal_mutation`, `_internal_delay`, `_internal_node`, `_internal_payment`,
`_internal_trend_action`, `_private`, `action`, `settings`…

**Fix — sanction the case that forced the workaround**

```ts
// The five access-level exports keep their exact names, always:
export const anon    = publicQuery({ … });
export const authed  = authMutation({ … });
export const admin   = adminQuery({ … });
export const server  = serverMutation({ … });

// Multi-step internals get ONE namespace, with descriptive members:
export const _internal = {
  main:      internalMutation({ … }),
  fetchData: internalAction({ … }),
  persist:   internalMutation({ … }),
};
```

Call sites read `internal.router.items.createOne._internal.fetchData` — the shape stays predictable,
the names stay descriptive, and no author needs to invent a convention. Enforce with a lint rule
whitelisting exactly `anon | authed | admin | server | _internal` as module-level export names in
`router/`.

---

## 🟡 F18 — Two payment systems coexist; one writes to a deprecated table

**Evidence.** `convex/schema/subscriptions.ts:30` marks the `subscriptions` table `@deprecated`, yet
`schema.ts:35` still registers it and `router/stripe/` + `router/subscriptions/` still write to it.
The live mobile path is RevenueCat → `usersExtended.plan` + `userWallets.credits`.

So subscription state has two homes: `usersExtended.plan` (current) and `subscriptions` (deprecated
but still written by the Stripe webhook). Determining whether a user is premium depends on which path
created them — `functions/users/isPremium.ts:25` reads only `user.plan.id`, meaning a Stripe-only
subscriber whose state lives in `subscriptions` would not be recognised as premium.

**Fix.** Pick one system as the source of truth, migrate the other's rows into it, delete the losing
table and its writers. If web payments are still needed, make Stripe write to the *same*
`usersExtended.plan` shape rather than a parallel table.

---

## 🔵 F19 — Dead code and unfinished migrations shipped

| Item | Location |
|---|---|
| Whole `@deprecated` tree, superseded by Convex equivalents | `expo/lib/image/server/` (upload, post-upload, utils) |
| `@deprecated` S3 helper still shipping | `expo/lib/s3/storage.cloud.deprecated.ts` |
| Browser cookie helpers in a React Native app | `expo/ui/utils/cookie.ts` |
| Commented-out RLS scaffolding | `convex/procedures.ts:2,51` (`wrapDatabaseReader`) |
| Commented-out cron | `convex/crons.ts:8-12` |
| One migration for a completed change | `convex/migrations.ts` |
| `prettier-plugin-tailwindcss` with no Prettier configured | `package.json` devDependencies |
| Stripe webhook handler still under `router/` | `router/stripe/http.webhook.ts` (all others moved to `http/`) |

**Fix.** Delete. Git remembers. Dead code is read by every future developer and by every AI agent
that greps the tree, and both will assume it is live.

---

## 🔵 F20 — Screens carry too much responsibility

**Evidence.** 14 screens exceed 250 lines; the largest is `app/outfit/[id]/index.tsx` at 437.
`useQuery` is called 42 times in `app/` and 36 times in `expo/modules/` — there is no rule about
which layer owns fetching, so both do.

Three route trees serve the user profile: `app/user/[id]/`, `app/user/u/[id]/`, and
`app/(links)/u/[id].tsx`.

**Fix.** State the layer contract explicitly (blueprint §Frontend layers):

> A file in `app/` may contain: route params, `<Stack.Screen>` options, layout composition, and a
> single call to the feature hook. **All data access lives in `expo/modules/{domain}/_hooks/`.**
> If a screen exceeds ~120 lines, it is composing too much — extract a module section.

This is already how the best modules work (`modules/items/_hooks/useItem.ts`); it just was never
made a rule.

---

## 🔵 F21 — Self-referential barrel export

```ts
// convex/llm/config/index.ts
export * from './embedding';
export * from './index';      // ← exports itself
export * from './models';
export * from './providers';
```

Harmless in practice (bundlers dedupe), but it is a circular import that some tools will warn on or
choke over. Delete line 2.

---

## 🔵 F22 — Naming and timestamp inconsistencies across the schema

| Issue | Detail |
|---|---|
| Index naming | Almost all indexes are `by_*`; `predictions` has one called `status` (`schema/generations.ts:31`) |
| `updatedAt` | Manual and present on only some tables — `outfits`, `images`, `notifications`, `feedScores`, `videos` have it; `items`, `generations`, `presets`, `bookmarks` do not |
| `createdAt` | Optional on `likes` and `follows`, absent everywhere else; the rest rely on `_creationTime`. Two sources of truth for "when" |
| Missing indexes | `videos`, `subscriptionsHistory`, `waitlist`, `config` have **no indexes at all** |
| Ordering | `outfitItems` has no position column, so outfit item order is non-deterministic |
| Field-name drift | `usersExtended` has both `name` and `firstName`/`lastName`, with `userCheck` resolving the precedence by hand at `procedures.ts:60` |

**Fix.** Adopt a schema checklist (blueprint §Schema rules): every table declares `updatedAt` or
explicitly documents that `_creationTime` suffices; never store `createdAt` (it duplicates
`_creationTime`); every index is named `by_<field>[_and_<field>]`; every join table carries a
`position` if order is meaningful; every table has at least one index or is documented as a
singleton.

---

## Priority order for the new project

If the blueprint is built from scratch, these are the fixes that must be structural from day one —
because retrofitting them costs 10× more:

1. **F3** — validated env, no `?? ''`. One file. Closes the whole fail-open class.
2. **F7** — `typecheck` + `test` + CI on the first commit. Catches most of the rest automatically.
3. **F8** — complete `procedures.ts` *then* lint-enforce it. Makes the golden rule followable.
4. **F6 / F1** — ownership as a procedure capability, not an optional helper call.
5. **F2** — no `httpAction` without a mandatory verifier.
6. **F17** — sanction the `_internal` namespace so nobody invents a 27th name.
7. **F13** — discriminated unions instead of optional-FK soup, from the first table.
8. **F9 / F10 / F12** — index rules stated and enforced before the tables have data.
