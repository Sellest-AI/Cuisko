# 04 — Blueprint: Target Architecture

> The founding architecture document for a new Expo + Convex application.
> It inherits Predecessor's proven layering, corrects the defects catalogued in
> [03-FLAWS.md](./03-FLAWS.md), and closes the enforcement gap that caused
> [02-DIVERGENCE.md](./02-DIVERGENCE.md).
>
> The worked example throughout is a **cooking app: recipes and ingredients**. It is present to make
> the patterns concrete, not to specify the product. Everything outside the `recipes/` and
> `ingredients/` domains is domain-agnostic and transfers to any app.

---

## Part 0 — The governing principles

Five rules, derived directly from what succeeded and what failed in Predecessor. Everything below is an
application of one of them.

### P1 — A rule needs an affordance, or it will be broken

`expo/ui/` held at **0 violations in 75 files** because `@ui/*` gave UI files everything they needed.
`"never import _generated/server"` was broken by **58 files** because `procedures.ts` did not export
`internalAction`.

> **Before writing "never do X", verify that "always do Y" is possible for every case X covers.**
> If a legitimate case has no Y, the rule will be broken and the documentation asserting it becomes a
> liability.

### P2 — A rule needs a machine check, or it will decay

Predecessor has zero CI, zero tests, and no `typecheck` script. Its rules eroded to 22% non-compliance on
export names and 9% on filenames.

> **Every rule is either mechanically enforced or explicitly labelled a guideline.**
> [05-CONVENTIONS.md](./05-CONVENTIONS.md) tags each rule with its enforcement mechanism. A rule with
> no mechanism is a guideline, and must be written as one.

### P3 — Make the safe path the only path

`isAuthorized()` existed and was excellent — and was called in 7 of 22 places, producing two live
IDORs. Security that depends on remembering will be forgotten.

> **Prefer capability over convention.** If the procedure hands you a pre-authorized document, there
> is no code path that forgets the check.

### P4 — Fail loudly at boot, never silently at runtime

`process.env.SECRET ?? ''` turned three missing environment variables into three disabled
authentication checks.

> **Configuration is validated at module load and throws.** A misconfigured deployment must refuse to
> start, not come up insecure.

### P5 — Documentation describes what is, not what was intended

`.readme/` still describes a Next.js app two frameworks later, plus a middleware file, a server
client, and a screen structure that never existed.

> **Docs live next to the code they describe and are checked in CI.** Trees are generated, not typed
> by hand. Claims about the API surface are asserted by a test.

---

## Part 1 — Stack

Unchanged from Predecessor; it was the right choice.

| Concern | Choice | Note |
|---|---|---|
| App framework | **Expo (SDK 55+) + Expo Router** | iOS / Android / Web from one codebase |
| Backend & DB | **Convex** | Reactive queries remove the entire client-cache layer |
| Styling | **NativeWind 4** + a `theme` module | Tailwind semantics on native |
| Local state | **Jotai** | Only for ephemeral UI state; Convex owns server state |
| Auth | **@convex-dev/auth** | Apple, Google, Password |
| Payments | **RevenueCat** | One system. Not two. |
| AI | **@convex-dev/agent** + OpenRouter | Behind a sealed `llm/` boundary |
| Analytics | **PostHog** | |
| Validation | **Zod** (edges) + **Convex validators** (DB) | |
| Package manager | **pnpm** | |
| Testing | **Vitest** + **convex-test** | ← new; Predecessor had none |

**Convex components to register on day one:**

```ts
// convex/convex.config.ts
import migrations     from "@convex-dev/migrations/convex.config";
import agent          from "@convex-dev/agent/convex.config";
import workflow       from "@convex-dev/workflow/convex.config";
import shardedCounter from "@convex-dev/sharded-counter/convex.config";   // ← fixes F11
import rateLimiter    from "@convex-dev/rate-limiter/convex.config";      // ← new: abuse control
import { defineApp } from "convex/server";

const app = defineApp();
app.use(migrations);
app.use(agent);
app.use(workflow);
app.use(shardedCounter);
app.use(rateLimiter);
export default app;
```

Add `action-cache` and `rag` when a feature actually needs them — not before.

---

## Part 2 — Repository layout

```
cooking-app/
├── app/                      # Expo Router. SCREENS ONLY — see §5 for the hard limits.
├── src/                      # ← renamed from Predecessor's `expo/` (see note below)
│   ├── ui/                   #   Design system. Zero Convex. Zero domain logic.
│   ├── modules/              #   Feature modules. Own all Convex bindings.
│   ├── lib/                  #   Vendor SDK wrappers. The only place an SDK is imported.
│   ├── providers/            #   React context tree.
│   ├── hooks/                #   Generic cross-feature hooks.
│   └── global/               #   theme, routes, constants.
├── convex/                   # Backend.
├── shared/                   # ← renamed from `utils/convex-allowed/`. Runs in BOTH runtimes.
├── translations/             # Only if i18n is enforced from screen one. Otherwise omit entirely.
├── assets/
├── docs/                     # Architecture docs. Checked by CI. ← replaces `.readme/`
├── .github/workflows/ci.yml  # typecheck + lint + test on every push.
├── env.ts                    # Client env — Zod validated.
├── eslint.config.js          # Carries the architectural lint rules.
├── tsconfig.json             # Root project (app/, src/, shared/).
└── convex/tsconfig.json      # Backend project (convex/, shared/).
```

**Two renames from Predecessor, both deliberate:**

- `expo/` → **`src/`**. Predecessor's `expo/` folder name suggests "Expo-specific code", but it holds the
  entire application. `src/` says what it is. It also frees the `@/` alias from ambiguity.
- `utils/convex-allowed/` → **`shared/`**. Shorter, and the name states the property that matters
  (shared between runtimes) rather than a permission ("allowed in Convex").

### Path aliases

The most important change: **`@/` is retired.** In Predecessor's tree it meant `expo/` in the app and
`convex/lib/` in the backend — the same prefix with two meanings depending on which tsconfig owned
the file. Every alias below is unambiguous in both projects.

```jsonc
// tsconfig.json — root project
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,     // ← catches arr[i] being undefined
    "paths": {
      "~/*":        ["./src/*"],          // application code
      "@ui/*":      ["./src/ui/components/*"],
      "@ui/hooks/*":["./src/ui/hooks/*"],
      "@ui/utils":  ["./src/ui/utils"],
      "@shared/*":  ["./shared/*"],       // dual-runtime code
      "theme":      ["./src/global/theme.ts"],
      "routes":     ["./src/global/routes.ts"],
      "env":        ["./env.ts"],
      "assets/*":   ["./assets/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts"],
  "exclude": ["node_modules", "convex"]
}
```

```jsonc
// convex/tsconfig.json — backend project
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@convex/*":  ["./*"],              // was `@/lib/*` — now unambiguous
      "@shared/*":  ["../shared/*"]       // SAME meaning as in the root project
    }
  },
  "include": ["./**/*", "../shared/**/*"],
  "exclude": ["./_generated"]
}
```

| Alias | Root project | Convex project |
|---|---|---|
| `~/*` | `src/*` | — |
| `@ui/*` | `src/ui/components/*` | — |
| `@convex/*` | — | `convex/*` |
| `@shared/*` | `shared/*` | `shared/*` |

---

## Part 3 — Backend

### 3.1 Folder structure

```
convex/
├── procedures.ts        ★ THE auth layer. Complete surface. Nothing else may touch _generated/server.
├── env.ts               ★ Zod-validated. Throws at boot on anything missing.
├── schema.ts            Aggregates schema/.
├── schema/              One file per domain. Tables + shared validators + constants.
├── router/              ★ Public API. {domain}/{operation}.ts.
├── functions/           Reusable logic that TOUCHES the database. ctx-first plain functions.
├── lib/                 Third-party clients. Does NOT touch the database.
├── llm/                 ★ Sealed AI boundary. agents / config / tools.
├── workflows/           Durable multi-step jobs (@convex-dev/workflow).
├── crons/               Cron bodies. crons.ts holds the schedule.
├── http/                ★ Webhooks. verified.ts is the ONLY way to define one.
├── auth.ts              convexAuth providers + lifecycle callbacks.
├── convex.config.ts     Component registration.
├── crons.ts             Schedule table.
├── http.ts              Route table.
└── migrations.ts        @convex-dev/migrations.
```

Two changes from Predecessor:

- **`llm/triggers/` is gone.** AI-invoking endpoints are normal `router/` files that call into
  `llm/`. Predecessor's parallel tree meant two places to look for an endpoint for no benefit.
- **`convex/utils/` is gone.** Its one file belonged in `functions/`.

### 3.2 `procedures.ts` — complete, so the rule is followable (fixes F2, F5, F6, F8)

> ### ⚠️ First, the constraint that shapes this file: the `_generated/api` type cycle
>
> `convex/_generated/api.d.ts` contains `import type * as X from "../<module>.js"` for **every module
> in the project**. So any file that imports `_generated/api` and is *also* imported by router files
> forms a circular type reference, and TypeScript starts emitting
> *"'X' implicitly has type 'any' because it is referenced directly or indirectly in its own
> initializer."*
>
> This is what put Predecessor's `procedures.ts` inside the cycle: line 6 is
> `import { internal } from "./_generated/api"`, needed for the action-context user lookup.
>
> **Crucially, the constraint stops there.** `_generated/**server**.d.ts` imports only
> `convex/server` and `./dataModel.js` — it does **not** reference the api types and is **not** part
> of the cycle. Predecessor generalised one module's problem to the other and dropped the
> "always import from `procedures.ts`" rule entirely; 58 files then routed around it. That rule was
> right, and this blueprint enforces it.
>
> **Two separate rules, because they are two separate modules:**
>
> | Module | Rule | Lint |
> |---|---|---|
> | `_generated/**server**` | Only `procedures.ts` may import it. Everything else goes through `procedures.ts`. | R2 |
> | `_generated/**api**` | Import it anywhere **except** `procedures.ts`. | R2b |
>
> To keep `procedures.ts` on the right side of R2b, replace its `internal.…` reference with
> `makeFunctionReference`, which produces a typed function reference from a string path without
> pulling in the api type graph.

```ts
// convex/procedures.ts
// ⚠️ INVARIANT: this file must NEVER import from "./_generated/api".
//    Doing so puts it inside the api type cycle and breaks every module that imports it.
import { customAction, customCtx, customMutation, customQuery }
  from "convex-helpers/server/customFunctions";
import { getAuthUserId } from "@convex-dev/auth/server";
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";   // no api types → safe
import { action, mutation, query } from "./_generated/server";        // no api types → safe
import { env } from "./env";

/** String-based reference: gives us the function without importing the api type graph. */
const getAccountRef = makeFunctionReference<"query", { userId: Id<'users'> }, AppUser | null>(
  "router/users/getAccount:_internal"
);

/* ─── 1. Complete re-export surface (P1: make the rule followable) ───────── */
export { internalQuery, internalMutation, internalAction, httpAction } from "./_generated/server";
export type { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";

export const publicQuery    = query;
export const publicMutation = mutation;    // ← Predecessor's omission; caused F4 and a raw-builder import
export const publicAction   = action;

/* ─── 2. Identity ────────────────────────────────────────────────────────── */
/** Merged `users` (auth-owned) + `usersExtended` (app-owned). */
export type AppUser = Omit<Doc<'usersExtended'>, '_id'> & Doc<'users'> & {
  _idExtended: Id<'usersExtended'>;
};

const loadUser = async (ctx: any): Promise<{ user: AppUser; userId: Id<'users'> } | null> => {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  // Action contexts have no ctx.db — hop through an internal query.
  // Uses the string-based ref above, NOT `internal.…`, to stay outside the api type cycle.
  if (!ctx.db) {
    const user = await ctx.runQuery(getAccountRef, { userId });
    return user ? { user, userId } : null;
  }

  const [base, extended] = await Promise.all([
    ctx.db.get(userId),
    ctx.db.query("usersExtended").withIndex("by_user_id", q => q.eq("userId", userId)).first(),
  ]);
  if (!base || !extended) return null;

  const { _id: _idExtended, ...ext } = extended;
  return { user: { ...ext, ...base, _idExtended }, userId };
};

const requireUser = async (ctx: any) => {
  const result = await loadUser(ctx);
  if (!result) throw new ConvexError({ code: "UNAUTHENTICATED" });
  return result;
};

const requireAdmin = async (ctx: any) => {
  const result = await requireUser(ctx);
  if (result.user.role !== "ADMIN") throw new ConvexError({ code: "FORBIDDEN" });
  return result;                            // ← returns {user,userId}, fixing Predecessor's F5
};

/* ─── 3. Authenticated ───────────────────────────────────────────────────── */
export const authQuery    = customQuery(query,       customCtx(requireUser));
export const authMutation = customMutation(mutation, customCtx(requireUser));
export const authAction   = customAction(action,     customCtx(requireUser));

/* ─── 4. Admin — ONE customization for all three, so they cannot drift ───── */
export const adminQuery    = customQuery(query,       customCtx(requireAdmin));
export const adminMutation = customMutation(mutation, customCtx(requireAdmin));
export const adminAction   = customAction(action,     customCtx(requireAdmin));

/* ─── 5. ★ Ownership as a capability, not a convention (fixes F1, F6) ────── */
import { isAuthorized } from "./functions/users/isAuthorized";

type OwnedTable = Extract<TableNames, 'recipes' | 'ingredients' | 'recipeSteps'>;

/**
 * Loads `args.id`, asserts the caller owns it, exposes it as `ctx.doc`.
 * There is NO code path that reaches the handler with an unowned document —
 * this is the difference between P3 (capability) and Predecessor's optional helper.
 *
 * Delegates to `isAuthorized` so the ownership RULES live in exactly one place;
 * this wrapper only guarantees the rules are always APPLIED.
 */
export const ownedMutation = <T extends OwnedTable>(table: T) =>
  customMutation(mutation, {
    args: { id: v.id(table) },
    input: async (ctx, { id }) => {
      const { user, userId } = await requireUser(ctx);
      const doc = await isAuthorized({ ...ctx, userId, user }, id);   // throws on denial
      return { ctx: { user, userId, doc: doc as Doc<T> }, args: {} };
    },
  });

export const ownedQuery = <T extends OwnedTable>(table: T) =>
  customQuery(query, {
    args: { id: v.id(table) },
    input: async (ctx, { id }) => {
      const { user, userId } = await requireUser(ctx);
      const doc = await isAuthorized({ ...ctx, userId, user }, id);
      return { ctx: { user, userId, doc: doc as Doc<T> }, args: {} };
    },
  });
```

**Why `isAuthorized` stays a separate helper rather than being inlined here.** Predecessor's
`functions/users/isAuthorized.ts` is genuinely good: it accepts an id *or* an already-loaded
document, and it walks indirect ownership (a `prediction` is owned by whoever owns its parent
`generation`). Those rules are domain knowledge and belong in `functions/`. Keeping them there means:

- **Rules in one place, application guaranteed by another.** The helper answers "who may touch this?";
  the procedure guarantees the question is always asked. Predecessor had the first half and made the
  second optional — which is exactly how it ended up with two live IDORs (F1) and 7-of-22 coverage
  (F6).
- **The helper stays callable directly** for the cases a wrapper cannot cover — batch operations,
  checks on already-loaded documents, actions that must verify before a `runMutation`.
- **Indirect ownership stays extensible.** For the cooking app, `recipeSteps` and `recipeIngredients`
  are owned through their parent recipe — precisely the `doc.generationId → generation.userId` shape
  Predecessor's helper already handles:

```ts
// convex/functions/users/isAuthorized.ts — the extension point
if ("recipeId" in doc && doc.recipeId) {
  const recipe = await ctx.db.get(doc.recipeId);
  if (recipe?.userId === userId) return doc;
}
```

One rule to close the loop: **`isAuthorized` is never called from a `router/` file.** If a router
needs an ownership check, it uses `ownedQuery`/`ownedMutation`. Direct calls belong in `functions/`.
That prevents the drift where six files called it directly and a seventh reached it through an
`internalQuery` round-trip (`router/presets/updateOne.ts:14`).

### 3.3 `env.ts` — validated, fails at boot (fixes F3)

```ts
// convex/env.ts
import { z } from "zod";

const schema = z.object({
  // Required — the deployment refuses to start without these.
  CONVEX_SITE_URL:           z.string().url(),
  SERVER_PRIVATE_KEY:        z.string().min(32),
  REVENUECAT_WEBHOOK_SECRET: z.string().min(16),
  OPENROUTER_API_KEY:        z.string().min(1),
  S3_APP_KEY:                z.string().min(1),
  S3_APP_KEY_ID:             z.string().min(1),
  S3_DEFAULT_BUCKET:         z.string().min(1),
  S3_ENDPOINT:               z.string().url(),
  // Genuinely optional — typed `string | undefined`, so callers MUST handle absence.
  POSTHOG_API_KEY:           z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    "❌ Invalid Convex environment:\n" +
    parsed.error.issues.map(i => `   ${i.path.join(".")}: ${i.message}`).join("\n")
  );
}

export const env = parsed.data;
```

**Three non-negotiable rules that follow:**

1. **Never `?? ''` on anything.** A default that makes a secret falsy is how Predecessor disabled three
   webhook authentications.
2. **Optional means `.optional()`.** The type becomes `string | undefined` and TypeScript forces the
   caller to handle it — instead of silently comparing against `''`.
3. **Never gate a security check on the truthiness of its secret.** `if (secret) { verify() }` means
   "skip verification when misconfigured". If the secret is required, the schema above already
   guaranteed it exists.

### 3.4 Router — the API surface

**The mapping** (unchanged from Predecessor — it works):

```
convex/router/{domain}/{operation}.ts  →  export const {access}
                     ↓
        api.router.{domain}.{operation}.{access}
```

**Export names follow a closed grammar.** Lint-enforced:

```
^(anon|authed|admin|server|_internal(_[a-z][a-zA-Z0-9]*)?)$
```

| Export | Builder | Who can call |
|---|---|---|
| `anon` | `publicQuery` / `publicMutation` / `publicAction` | anyone |
| `authed` | `auth*` or `owned*` | signed-in users |
| `admin` | `admin*` | `role === 'ADMIN'` |
| `server` | `server*` | holders of `SERVER_PRIVATE_KEY` |
| `_internal` | `internal*` | other Convex functions only |
| `_internal_<verb>` | `internal*` | **a named step** of a multi-step operation |

**The `_internal_<verb>` form is the sanctioned escape hatch (fixes F17).** It exists because the
async orchestration pattern genuinely needs several registered functions in one file — an action
cannot touch the database, so a single logical operation becomes mutation → action → mutation, and
each hop must be its own registered Convex function.

> ⚠️ **Why not a namespace object?** Convex registers functions by scanning a module's **top-level
> exports** for the `isQuery` / `isMutation` / `isAction` markers that the builders attach
> (`convex/dist/esm/server/impl/registration_impl.js`). A plain object wrapping them carries no such
> marker, so `export const _internal = { enrich: internalAction({…}) }` **does not register
> anything**. Every step must be its own top-level export. This is a hard platform constraint, and it
> is precisely why Predecessor's authors invented 26 suffixes rather than nesting.

```ts
// convex/router/recipes/createOne.ts
export const authed = authMutation({ … });                  // the public entry point

export const _internal_enrich  = internalAction({ … });     // ✅ named for what it does
export const _internal_persist = internalMutation({ … });
// called as: internal.router.recipes.createOne._internal_enrich
```

**Name steps for what they do, never by number.** Predecessor used `_internal_step_1`, `_internal_step1`,
`_internal_step3`, `_internal_step4` — and `_internal_step2` does not exist in
`router/admin/storage/images/replaceOneMutationInternal.ts`, because a step was removed and nothing
was renumbered. Numbered steps rot; verbs do not.

**When a file exceeds the 80-line cap**, move the steps to a sibling `*.steps.ts` file — a pattern
Predecessor already reached for twice:

```
router/recipes/createOne.ts          export const authed
router/recipes/createOne.steps.ts    export const _internal_enrich, _internal_persist
```

**The shared-handler pattern** — Predecessor's single best idea, kept verbatim. One implementation,
several access levels:

```ts
// convex/router/recipes/getPaginated.ts
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { listRecipes } from "@convex/functions/recipes";
import { adminQuery, authQuery, type QueryCtx } from "@convex/procedures";

const args = { paginationOpts: paginationOptsValidator };

export const authed = authQuery({
  args,
  handler: (ctx, a) => listRecipes(ctx, { ...a, userId: ctx.userId }),   // own recipes
});

export const admin = adminQuery({
  args: { ...args, userId: v.id("users") },
  handler: (ctx, a) => listRecipes(ctx, a),                             // anyone's recipes
});
```

Note that the `userId` in `admin` comes from arguments — which is exactly the shape that produced F1.
The difference is that here `admin` is bound to `adminQuery`, and a lint rule (§7) verifies that
binding on every commit.

### 3.5 `functions/` vs `lib/` — a decidable boundary (fixes F14)

| | `functions/` | `lib/` |
|---|---|---|
| Signature | `(ctx, args)` — ctx first | anything |
| Touches `ctx.db` | **yes** | **never** |
| Contains | domain logic, queries, writes | vendor clients, pure helpers |
| Example | `functions/recipes/scaleRecipe.ts` | `lib/s3/upload.ts` |

**And the rule that keeps routers thin** — the one Predecessor stated but never enforced, letting
`router/` grow to 4× `functions/`:

> A `router/` file contains **only**: imports, `args` validators, procedure wrappers, and handlers
> that shape arguments and call `functions/`.
> If it contains a loop, a branch on domain state, or an import of a domain library — that logic
> belongs in `functions/`.

Mechanically approximated in CI: **`convex/router/**/*.ts` may not exceed 80 lines.** Crude, but it
makes the boundary observable, and every Predecessor violation exceeds it.

### 3.6 Webhooks — verification is structural (fixes F2)

```ts
// convex/http/verified.ts — the ONLY place httpAction may be called
import { httpAction, type ActionCtx } from "@convex/procedures";

/**
 * `verify` has NO default. A webhook cannot be defined without one.
 * This is P3: the safe path is the only path.
 */
export const verifiedWebhook = <T>(opts: {
  verify: (req: Request, rawBody: string) => Promise<void>;   // throws ⇒ 401
  parse:  (json: unknown) => T;
  handle: (ctx: ActionCtx, body: T) => Promise<Response>;
}) => httpAction(async (ctx, request) => {
  const raw = await request.text();          // raw body FIRST — signatures cover bytes, not objects
  try {
    await opts.verify(request, raw);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  let body: T;
  try {
    body = opts.parse(JSON.parse(raw));
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  return opts.handle(ctx, body);
});
```

```js
// eslint.config.js
{
  files: ['convex/**/*.ts'],
  ignores: ['convex/http/verified.ts', 'convex/procedures.ts'],
  rules: {
    'no-restricted-syntax': ['error', {
      selector: "CallExpression[callee.name='httpAction']",
      message: 'Define webhooks with verifiedWebhook() from convex/http/verified.ts.',
    }],
  },
}
```

### 3.7 Async orchestration

Long-running third-party work follows one shape. Predecessor converged on this and it is correct:

```
1. authAction / ownedMutation   validate, charge, call the provider, receive a job id
2. internalMutation             persist a job row  { externalId, status: 'PENDING' }
3. verifiedWebhook              provider calls back → signature verified → job resolved
4. internalAction               fetch output → store → internalMutation updates status → notify
```

**Choosing the mechanism:**

| Need | Use |
|---|---|
| One follow-up after a write commits | `ctx.scheduler.runAfter(0, internal.…)` |
| Recurring on a clock | `crons/` |
| Multi-step, each step retried independently, survives failure | `@convex-dev/workflow` |
| Iterate a large table | `.paginate()` inside a workflow — **never `.collect()`** |

---

## Part 4 — Schema

### 4.1 Rules (fix F9, F10, F12, F13, F22)

| # | Rule | Why |
|---|---|---|
| S1 | Every `ctx.db.query()` is followed by `.withIndex()` or `.withSearchIndex()` | Un-indexed scans become outages as tables grow (F9) |
| S2 | Indexes are named `by_<field>[_and_<field>]`, fields in order | Predecessor had one called `status` (F22) |
| S3 | **Never** `.filter()` together with `.paginate()` | Post-index filtering yields short pages and broken infinite scroll (F12) |
| S4 | Never store `createdAt` — `_creationTime` exists | Two sources of truth (F22) |
| S5 | Every mutable table declares `updatedAt: v.number()`; immutable tables document why not | Predecessor had it on 5 of 40 (F22) |
| S6 | Never use parallel optional FKs. **Indexed** polymorphic refs use one `targetId: v.union(v.id(a), v.id(b))` + a discriminant; **non-indexed** ones use a `v.union` of discriminated objects | Optional-FK soup permits invalid states (F13); nested paths index `undefined` for absent variants, so they don't shrink the index |
| S7 | Every table has ≥1 index, or a comment declaring it a singleton | 4 of Predecessor's tables had none (F22) |
| S8 | Join tables carry `position: v.number()` when order is meaningful | `outfitItems` lost outfit ordering (F22) |
| S9 | Concurrent counters use `@convex-dev/sharded-counter`, never a shared row | Hot-document write contention (F11) |
| S10 | A foreign key is only added together with the index its cascade will need | Predecessor orphans rows in 6 tables for lack of 4 indexes (F15) |
| S11 | Enum-like values: `const X = [...] as const` → validator → type, one source | Predecessor's best schema pattern — keep it |

### 4.2 Worked example — recipes and ingredients

This demonstrates every rule above. It is the reference to copy from.

```ts
// convex/schema/constants.ts
// S11 — one declaration produces the runtime validator AND the TypeScript type.
export const UNITS = [
  "g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "pinch",
] as const;
export type Unit = typeof UNITS[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = typeof DIFFICULTIES[number];

export const CATEGORIES = [
  "starter", "main", "dessert", "side", "breakfast", "drink", "sauce",
] as const;
export type Category = typeof CATEGORIES[number];
```

```ts
// convex/schema/ingredients.ts
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { UNITS } from "./constants";

const vUnit = v.union(...UNITS.map(v.literal));      // S11

/**
 * The canonical ingredient catalogue — "flour", "unsalted butter".
 * Global, not per-user: two users referencing flour must reference the SAME row,
 * so that substitutions, nutrition and (later) shopping aggregation can work at all.
 */
export const ingredients = defineTable({
  name: v.string(),                    // "unsalted butter"
  normalizedName: v.string(),          // "unsalted butter" → lowercased, accent-stripped: dedupe key
  defaultUnit: vUnit,
  category: v.optional(v.string()),    // "dairy" — for aisle grouping later
  updatedAt: v.number(),               // S5
})
  .index("by_normalized_name", ["normalizedName"])                       // S2, dedupe on write
  .searchIndex("search_name", { searchField: "name" });

/**
 * ★ The join table — the heart of the model.
 * Quantity lives HERE, not on `ingredients`: "200g of flour" is a property of
 * the relationship between one recipe and one ingredient, not of flour itself.
 * Getting this wrong is the single most common mistake in recipe schemas.
 */
export const recipeIngredients = defineTable({
  recipeId:     v.id("recipes"),
  ingredientId: v.id("ingredients"),
  quantity:     v.number(),            // 200
  unit:         vUnit,                 // "g"
  note:         v.optional(v.string()),// "at room temperature"
  optional:     v.boolean(),           // "optional: a pinch of nutmeg"
  position:     v.number(),            // S8 — ingredient lists are ordered
})
  .index("by_recipe", ["recipeId"])                    // S2 — "ingredients of this recipe"
  .index("by_ingredient", ["ingredientId"]);           // S2, S10 — "recipes using flour" + cascade
```

```ts
// convex/schema/recipes.ts
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { CATEGORIES, DIFFICULTIES } from "./constants";

const vDifficulty = v.union(...DIFFICULTIES.map(v.literal));
const vCategory   = v.union(...CATEGORIES.map(v.literal));

/**
 * S6 — a discriminated union, NOT `{ url?, imageId?, ... }`.
 * The database rejects an invalid combination; TypeScript narrows on `.kind`.
 * Safe as a nested union because `source` is never indexed. For an INDEXED
 * polymorphic reference use a flat `targetId: v.union(v.id(a), v.id(b))` instead —
 * nested paths index absent variants as `undefined`, so they span the whole table.
 */
const vSource = v.union(
  v.object({ kind: v.literal("original") }),
  v.object({ kind: v.literal("imported"), url: v.string() }),
  v.object({ kind: v.literal("scanned"),  imageId: v.id("images") }),
);

/** Reusable field set — spread into the table AND into mutation args, so they cannot drift. */
export const RECIPE_FIELDS = {
  title:       v.string(),
  description: v.optional(v.string()),
  category:    vCategory,
  difficulty:  vDifficulty,
  servings:    v.number(),             // the base the recipe is written for; scaling multiplies
  prepMinutes: v.number(),
  cookMinutes: v.number(),
  coverImageId: v.optional(v.id("images")),
  source:      vSource,
  isPublic:    v.boolean(),
};

export const recipes = defineTable({
  ...RECIPE_FIELDS,
  userId:    v.id("users"),            // ownership — required by ownedMutation()
  updatedAt: v.number(),               // S5
})
  .index("by_user", ["userId"])
  // S3/S12 — the visibility flag is IN the index, so public listing paginates correctly
  // without a .filter(). This is the index Predecessor defined and then failed to use (F12).
  .index("by_public_and_category", ["isPublic", "category"])
  .searchIndex("search_title", { searchField: "title", filterFields: ["userId", "isPublic"] });

/** Steps as rows, not an array: they are individually addressable and reorderable. */
export const recipeSteps = defineTable({
  recipeId:    v.id("recipes"),
  userId:      v.id("users"),          // denormalised so ownedMutation can guard a step directly
  position:    v.number(),             // S8
  instruction: v.string(),
  durationMinutes: v.optional(v.number()),
})
  .index("by_recipe", ["recipeId"]);   // S2, S10
```

**Why quantity lives on the join table — the point worth internalising.** The naive model puts
`quantity` on `ingredients` and creates one ingredient row per recipe. That destroys the catalogue:
"flour" becomes a thousand rows, "which recipes use butter?" becomes a full scan, and any future
feature that aggregates across recipes is impossible. The join table keeps `ingredients` canonical
and puts the relationship data where it belongs. The same reasoning applies to any M:N with
attributes — it is the general lesson, not a cooking one.

### 4.3 Cascade declaration (fixes F15)

Written when the tables are written, not when data starts leaking:

```ts
// convex/functions/cascade.ts
export const CASCADE = {
  recipes: [
    { table: "recipeIngredients", index: "by_recipe", field: "recipeId" },
    { table: "recipeSteps",       index: "by_recipe", field: "recipeId" },
  ],
  ingredients: [
    { table: "recipeIngredients", index: "by_ingredient", field: "ingredientId" },
  ],
} as const;

export const cascadeDelete = async (ctx: MutationCtx, table: keyof typeof CASCADE, id: any) => {
  for (const rel of CASCADE[table]) {
    const rows = await ctx.db.query(rel.table)
      .withIndex(rel.index, q => q.eq(rel.field, id)).collect();
    await Promise.all(rows.map(r => ctx.db.delete(r._id)));
  }
  await ctx.db.delete(id);
};
```

A test asserts that every table with a `recipeId` column appears in `CASCADE.recipes` and that each
named index exists. That test is what Predecessor needed and lacked.

---

## Part 5 — Frontend

### 5.1 The four layers and their contracts

```
┌─ app/ ──────────── Routing only. Params, <Stack.Screen> options, layout, ONE feature-hook call.
│                    ✗ no useQuery  ✗ no business logic  ✗ target ≤120 lines
├─ src/modules/ ──── Feature modules. ★ The ONLY layer that calls Convex.
│                    _hooks/use{Domain}.ts owns query + mutation + module state.
├─ src/lib/ ──────── Vendor wrappers. The only files that import an SDK.
└─ src/ui/ ───────── Design system. ✗ no Convex  ✗ no domain logic  ✗ no `translations`
                     Props are STRUCTURAL types, never `Doc<'x'>`.
```

Dependencies flow strictly downward. `ui/` imports from nothing above it.

### 5.2 `src/ui/` — reproducing the isolation that worked

Predecessor achieved **0 violations across 75 files**. Three mechanisms did it, and all three are
mandatory here:

**1. Structural props, never backend types.** This is the load-bearing technique:

```tsx
// src/ui/cards/recipe.tsx
type Props = {
  title: string;
  imageUrl?: string;
  minutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  ingredientCount: number;
  onPress?: () => void;
};
```

Note: no `Id<'recipes'>`, no `Doc<'recipes'>`, no `api`. Because the component declares *the shape it
needs* rather than importing the backend's type, it has **no reason** to import from `convex/` — so
the isolation rule costs nothing to obey (P1). The module layer adapts documents to these props.

**2. A complete alias surface.** `@ui/*`, `@ui/hooks/*`, `@ui/utils`, `theme` cover everything a
presentational file needs. Nothing missing means no reason to reach outside.

**3. A lint rule, so it is enforced rather than hoped for** (§7).

**Structure** — with the one refinement over Predecessor, which mixed generic and domain-shaped
components in `components/`:

```
src/ui/
├── components/     Product-agnostic: button, text, image, modal, skeleton, sheet…
├── cards/          Domain-shaped but still pure: recipe.tsx, ingredient.tsx
├── icons/
├── hooks/          use-color-scheme.ts, use-keyboard-height.ts
└── utils/          cn.ts, format.ts
```

### 5.3 `src/modules/` — feature modules own the data

```
src/modules/recipes/
├── screen.list.tsx              composed screen sections
├── screen.detail.tsx
├── recipe-form.tsx
├── recipe-form.ingredients.tsx  dot-notation for sub-components of the same parent
└── _hooks/
    └── useRecipes.ts            ★ the ONLY place api.router.recipes.* is referenced
```

**The feature hook** — Predecessor's best undocumented frontend pattern, promoted to a rule:

```ts
// src/modules/recipes/_hooks/useRecipes.ts
import { api, type Id } from "~/lib/convex/api";
import { useMutation, useQueryCached } from "~/lib/convex/client";

export const useRecipe = (recipeId?: Id<'recipes'> | null) => {
  const { data: recipe, isPending } = useQueryCached(
    api.router.recipes.getOne.authed,
    recipeId ? { recipeId } : 'skip',        // Convex's conditional-query idiom
  );

  const { mutate: updateRecipe, isLoading: isSaving } =
    useMutation(api.router.recipes.updateOne.authed);

  /** Derives the arg type from the generated mutation — a backend change becomes a type error here. */
  const update = (data: Omit<Parameters<typeof updateRecipe>[0], 'id'>) =>
    recipeId ? updateRecipe({ ...data, id: recipeId }) : undefined;

  /** Presentation-shaped scaling, computed client-side — no round trip. */
  const scaleTo = (servings: number) => {
    if (!recipe) return [];
    const factor = servings / recipe.servings;
    return recipe.ingredients.map(i => ({ ...i, quantity: i.quantity * factor }));
  };

  return { recipe, isLoading: isPending, isSaving, update, scaleTo };
};
```

**The rule:** a screen calls `useRecipe()`. It never calls `useQuery` and never touches `api`. When
the backend changes, exactly one file per domain needs editing.

### 5.4 `app/` — screens

```
app/
├── _layout.tsx              providers + fonts + splash
├── index.tsx
├── (tabs)/                  recipes, discover, profile
├── (modals)/                add-ingredient, scan-recipe
├── recipe/[id]/index.tsx
└── auth.tsx
```

**Hard contract, enforced in review and by a size cap:**

| Allowed in `app/` | Forbidden in `app/` |
|---|---|
| `useLocalSearchParams` | `useQuery` / `useMutation` / `api` |
| `<Stack.Screen options>` | domain logic, computation |
| layout composition | direct `@ui/*` assembly beyond layout |
| one feature-hook call | more than ~120 lines |

Predecessor put 42 `useQuery` calls in screens and grew one to 437 lines (F20). This is the rule that
prevents it.

### 5.5 `src/lib/convex/` — the single choke point

```
src/lib/convex/
├── api.ts       re-exports api, Doc, Id from convex/_generated  ← the ONLY file that may
├── client.ts    useQuery, useQueryCached, useMutation, useAction (with loading states)
└── auth.ts      useAuthActions, useUser, useIsAuthenticated
```

Predecessor's 8-line `api.ts` was a genuinely good seam and held perfectly. Keep it, and lint-forbid
`convex/_generated` imports anywhere else in `src/` or `app/`.

### 5.6 State

| Kind of state | Home |
|---|---|
| Server data | Convex `useQuery` — reactive, no cache layer needed |
| Cross-screen ephemeral UI | Jotai atom **inside the module's `_hooks/`** |
| Single-screen UI | `useState` |
| Form drafts | local state, or a module atom if it survives navigation |

Predecessor used Jotai in only 9 files and never built a redundant client store. That restraint is a
feature; preserve it.

### 5.7 i18n — decide once, at the start

Predecessor installed react-i18next, wrote a 148-line guide, and used it in **1 file of 332** (F/D9).

> **Choose on day one and hold it:**
> **(a)** Ship English only. Do not install i18n. Add it later as a deliberate migration; or
> **(b)** Enforce from the first screen: a lint rule forbidding string literals in `<Text>`, and a CI
> check that `en` and `fr` key sets are identical.
>
> There is no third option. Half-installed i18n is pure cost with no benefit.

Given the domain (recipes are text-heavy and translation-hostile — ingredient names, units and
measures do not translate mechanically), **(a) is the recommendation**: ship English, revisit when a
second market is real.

---

## Part 6 — Cross-cutting

### Error handling

```ts
throw new ConvexError({ code: "FORBIDDEN", message: "Not your recipe" });
```

`ConvexError` (not `Error`) carries structured data to the client, so the UI can branch on `code`
instead of string-matching. Codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`,
`RATE_LIMITED`, `PAYMENT_REQUIRED`, `EXTERNAL_SERVICE_ERROR`.

**Never write an empty `catch {}`** (F16). Either handle it, log it with context, or let it throw.

### Rate limiting

Predecessor had none — any authenticated user could trigger unlimited paid AI generations. Use
`@convex-dev/rate-limiter` on every endpoint that costs money or writes at user request.

### Testing

```
convex/router/recipes/__tests__/createOne.test.ts
```

Minimum bar, from the first commit:

1. **An authorization test for every non-`anon` export.** Assert the wrong caller is rejected. This
   suite alone would have caught F1 and F5.
2. **A test per `functions/` file** — they are plain functions, trivially testable.
3. **A schema-invariant test** — every FK appears in `CASCADE`; every index named there exists.

`convex-test` runs it all in-memory with a mock identity. No deployment needed.

### Documentation

Lives in `docs/`, next to the code, and is CI-checked (P5):

| File | Content |
|---|---|
| `docs/ARCHITECTURE.md` | Layers, contracts, data flow. This document, trimmed. |
| `docs/CONVENTIONS.md` | [05-CONVENTIONS.md](./05-CONVENTIONS.md). The rulebook. |
| `docs/DOMAIN.md` | Schema + the reasoning behind each modelling decision. |
| `AGENTS.md` | Entry point for AI agents. Points at the three above. |

**Rules:** folder trees are generated by a script, never hand-typed (Predecessor's were wrong in six
places). Any claim about the API surface is asserted by a test. A PR touching `convex/schema/` or
adding a top-level folder fails CI unless `docs/` changed too.

---

## Part 7 — Enforcement (P2)

This section is what makes the rest real. Without it, this document becomes `.readme/` in eighteen
months.

### Scripts

```jsonc
"scripts": {
  "typecheck": "tsc --noEmit && tsc --noEmit -p convex/tsconfig.json",
  "lint":      "expo lint",
  "test":      "vitest run",
  "verify":    "pnpm typecheck && pnpm lint && pnpm test"
}
```

### The architectural lint rules

```js
// eslint.config.js
module.exports = defineConfig([
  ...expoConfig,

  // R1 — src/ui/ is isolated (Predecessor's one perfect rule; now enforced, not hoped for)
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['convex', 'convex/*', '**/convex/**', '~/lib/convex/*'],
            message: 'src/ui/ must not know the backend exists. Use structural prop types.' },
          { group: ['~/modules/*', '~/providers/*', '~/hooks/*', 'translations'],
            message: 'src/ui/ must not depend on application layers.' },
        ],
      }],
    },
  },

  // R2 — only procedures.ts touches _generated/SERVER (makes the golden rule real; fixes F8)
  //   NOTE: _generated/API is deliberately NOT restricted — router files legitimately need
  //   `internal` and `api`, and they cannot come from procedures.ts without creating the
  //   type cycle described in §3.2. Restricting the wrong one is what broke this rule before.
  {
    files: ['convex/**/*.ts'],
    ignores: ['convex/_generated/**', 'convex/procedures.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/_generated/server'],
          message: 'Import builders and ctx types from convex/procedures.ts.' }],
      }],
    },
  },

  // R2b — procedures.ts must stay OUT of the api type cycle (§3.2 invariant)
  {
    files: ['convex/procedures.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/_generated/api'],
          message: 'procedures.ts must never import _generated/api — it creates a project-wide '
                 + 'type cycle. Use makeFunctionReference() for internal function references.' }],
      }],
    },
  },

  // R3 — only lib/convex/api.ts reaches the generated API
  {
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    ignores: ['src/lib/convex/api.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/convex/_generated/**'],
          message: 'Import from ~/lib/convex/api instead.' }],
      }],
    },
  },

  // R4 — screens do not fetch (fixes F20)
  {
    files: ['app/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: '~/lib/convex/client',
          message: 'Screens call a feature hook from src/modules/*/\_hooks/. They do not fetch.' }],
      }],
    },
  },

  // R5 — webhooks must be verified (fixes F2)
  {
    files: ['convex/**/*.ts'],
    ignores: ['convex/http/verified.ts'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.name='httpAction']",
        message: 'Use verifiedWebhook() — verification is not optional.',
      }],
    },
  },

  // R6 — no silently swallowed errors (fixes F16)
  { rules: { 'no-empty': ['error', { allowEmptyCatch: false }] } },
]);
```

### The custom rules worth writing

Two checks cover the defects lint cannot express. Each is a short script run by `pnpm verify`:

**C1 — export name must match its builder** (would have caught F1 — the two live IDORs):

```
For every module-level `export const NAME = BUILDER({...})` in convex/router/:
  anon    ⇒ BUILDER ∈ {publicQuery, publicMutation, publicAction}
  authed  ⇒ BUILDER ∈ {authQuery, authMutation, authAction, ownedQuery, ownedMutation}
  admin   ⇒ BUILDER ∈ {adminQuery, adminMutation, adminAction}
  server  ⇒ BUILDER ∈ {serverQuery, serverMutation, serverAction}
  _internal ⇒ an object literal of internal* builders
  anything else ⇒ ERROR
```

**C2 — router files stay thin** (would have caught F14): fail if any `convex/router/**/*.ts` exceeds
80 lines.

### CI

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

### Rule-to-mechanism map

| Rule | Enforced by | Prevents |
|---|---|---|
| `src/ui/` isolation | ESLint R1 | the rule silently decaying |
| Only `procedures.ts` touches `_generated/server` | ESLint R2 + complete surface | F8 / D3 (58 violations) |
| `procedures.ts` stays out of the api type cycle | ESLint R2b | the cycle that killed the rule in Predecessor |
| Only `api.ts` reaches generated API | ESLint R3 | frontend coupling |
| Screens do not fetch | ESLint R4 | F20 |
| Webhooks are verified | ESLint R5 + `verifiedWebhook` | F2 |
| No empty catch | ESLint R6 | F16 |
| Export name matches builder | script C1 | **F1** |
| Routers stay thin | script C2 | F14 |
| Ownership checked | `ownedMutation` type signature | F1, F6 |
| Env complete | Zod throw at boot | F3 |
| Auth on every endpoint | test suite | F1, F5 |
| Cascades complete | schema-invariant test | F15 |
| Docs match code | CI doc-drift check | all of 02 |

---

## Part 8 — Build order

1. **Scaffolding first.** `tsconfig` ×2, aliases, `env.ts` (Zod), `procedures.ts` (complete surface),
   ESLint rules R1–R6, scripts C1–C2, CI. *Before any feature.* This is the part Predecessor never did,
   and every finding in [03-FLAWS.md](./03-FLAWS.md) traces back to it.
2. **Auth.** `@convex-dev/auth`, `usersExtended`, the merge in `procedures.ts`, `AuthProvider`.
   Write the authorization test suite here — the harness costs nothing later and catches everything.
3. **UI foundations.** `theme`, `src/ui/components/`. No Convex import will ever exist here; R1 makes
   sure.
4. **First vertical slice: recipes.** `schema/recipes.ts` → `functions/recipes/` →
   `router/recipes/` → `modules/recipes/_hooks/useRecipes.ts` → `app/(tabs)/recipes.tsx`.
   One domain, all five layers. This slice is the template every later domain copies.
5. **Second domain: ingredients** — proves the join-table model and the cascade.
6. **Storage** (images) — `lib/s3/`, upload action, `images` table.
7. **Payments** — RevenueCat + `verifiedWebhook`. One system.
8. **AI** — `llm/` sealed boundary, called from normal `router/` files.

The discipline that matters: **step 1 is not skippable, and step 4 is one domain, not four.** Get one
vertical slice correct through every layer, then replicate. Predecessor built breadth-first and the
layering diverged domain by domain — which is why `router/stripe/` uses `action`, `router/auth/` uses
`_private`, and neither matches the other eighteen.
