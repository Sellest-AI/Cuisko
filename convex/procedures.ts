// ⚠️ INVARIANT: this file must NEVER import from "./_generated/api".
//    `_generated/api.d.ts` imports every module in the project, so a file that imports it and
//    is itself imported by router files forms a project-wide circular type reference — every
//    procedure silently degrades to `any`. That is what happened in the predecessor project,
//    and dropping the "always import from procedures.ts" rule to escape it is what let 58
//    files reach straight for `_generated/server`.
//
//    `_generated/server` is NOT part of that cycle (it references only `convex/server` and
//    `dataModel`), which is why re-exporting it from here is safe. Two modules, two rules:
//    lint R2 bans `_generated/server` everywhere else; R2b bans `_generated/api` here.
//
//    For internal function references, use `makeFunctionReference` — it produces a typed
//    reference from a string path without pulling in the api type graph.
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  customAction,
  customCtx,
  type Customization,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  type Auth,
  type FunctionReference,
  type FunctionReturnType,
  makeFunctionReference,
  type OptionalRestArgs,
} from "convex/server";
import { ConvexError, type ObjectType, type PropertyValidators, v } from "convex/values";

import type { Doc, Id, TableNames } from "./_generated/dataModel";
import {
  action,
  type ActionCtx,
  type DatabaseReader,
  internalAction as rawInternalAction,
  internalMutation as rawInternalMutation,
  mutation,
  type MutationCtx,
  query,
} from "./_generated/server";
import { env } from "./env";
import { isMember } from "./functions/households/isMember";
import { isAuthorized } from "./functions/users/isAuthorized";
import { type AppUser, loadUser } from "./functions/users/loadUser";
import { resolvei18n } from "./lib/i18n";
import { timingSafeEqual } from "./lib/secrets";
import { LOCALES, type Locale, type Localized } from "./schema/i18n";
import { type Operation, type TraceContext, vTraceContext } from "./schema/tracing";

/* ─── 1. The complete re-export surface ──────────────────────────────────────────────────
 * A rule needs an affordance or it will be broken (P1). Every builder and every ctx type a
 * backend file could want is here, so "never import _generated/server" is always followable.
 * If you find yourself needing something this file does not export, add it here — do not
 * route around it.
 */
export { httpAction, internalQuery } from "./_generated/server";
export type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
export type { AppUser } from "./functions/users/loadUser";

/* ─── 1b. i18n — content-translation resolution, opt-in per procedure ──────────────────────
 * `ctx.i18n.resolve` reads a `Localized` field against a caller-supplied locale (falling back
 * to `en`). It is a separate builder per access level, not baked into the base ones — most
 * queries touch no translated content, and would otherwise be forced to accept and thread a
 * `locale` arg they never use. `queryWithI18n` / `mutationWithI18n` / `actionWithI18n` are the
 * i18n-flavored base every `*I18n` procedure composes from.
 */
const vLocale = v.union(...LOCALES.map((locale) => v.literal(locale)));

const i18nCustomization = {
  args: { locale: vLocale },
  input: async (_ctx: unknown, { locale }: { locale: Locale }) => ({
    // `locale` rides along with `resolve` because resolution is not the only thing that needs it:
    // a search index is per-locale (`search_fr` / `search_en`), so choosing one is a decision the
    // handler makes from the locale itself rather than something `resolve` can do for it.
    ctx: { i18n: { locale, resolve: (field: Localized) => resolvei18n(field, locale) } },
    args: {},
  }),
};

/* ─── 1c. Tracing — which route a paid call was made for ─────────────────────────────────────
 * A trace rides in a hidden `__trace` argument this layer adds to the function's validator and
 * strips before the handler runs, so no route declares it and no handler sees it. A function
 * called without one starts a trace when its builder was given `trace: "<operation>"`; without
 * that option `ctx.trace` is `null`, and nothing can be recorded against it.
 *
 * Every mutation and action builder below carries a trace, but **only the internal ones accept
 * `__trace`**. Every builder reached from outside (public, auth, admin, owned, household, server)
 * starts its own trace and its validator refuses a `__trace`: a caller choosing its trace could file
 * what it spends on another cook's profile, or under another route's average. A traced hop only
 * ever targets an internal function, so nothing legitimate needs the arg anywhere else. Queries
 * carry no trace at all: a query never spends, and an argument that differs on every call would
 * defeat the query cache.
 *
 * Propagation is explicit: `ctx.runTracedMutation` / `ctx.scheduleTracedAfter` (and, in an action,
 * `ctx.runTracedAction`) add `__trace` to the callee's args. Plain `ctx.runAction` is left alone,
 * because injecting into every call would also inject into component functions, whose validators
 * refuse an unknown argument. The traced runners only accept a reference whose args declare
 * `__trace`, so passing a component's function to one is a type error rather than a runtime
 * rejection.
 *
 * Only data lives here. Sending an event needs `components.posthog`, which is `_generated/api`,
 * so it lives in `functions/tracing/` and receives the ctx this layer shaped.
 */
type TraceOption = { trace?: Operation };

/** An internal function reference this layer has wrapped: its args accept a `__trace`. */
type Traced<Type extends "action" | "mutation"> = FunctionReference<Type, "internal", { __trace?: TraceContext }>;

/** The callee's args as its caller writes them: `__trace` is the runner's to add. */
type UntracedArgs<Ref extends Traced<"action"> | Traced<"mutation">> = Omit<OptionalRestArgs<Ref>[0], "__trace">;

/**
 * Safe in a mutation, whose clock is frozen but whose randomness is not: on the dev deployment
 * (2026-10-12) `crypto.randomUUID()` in a deterministic function gave a new value per call and per
 * run, so two calls to `sendMessage` get two traces. convex-test cannot show this, so no test does.
 */
const startTrace = (operation: Operation | undefined, userId: Id<"users"> | undefined): TraceContext | null =>
  operation ? { traceId: crypto.randomUUID(), operation, distinctId: userId ?? null } : null;

/** `null` sends nothing rather than `__trace: null`, which the optional validator would refuse. */
const withTraceArg = <Args,>(trace: TraceContext | null, args: Args) => (trace ? { ...args, __trace: trace } : args);

/** What any traced function can hand its trace on through: a mutation, or the scheduler. */
const mutationRunners = (ctx: MutationCtx, trace: TraceContext | null) => ({
  trace,
  runTracedMutation: <Ref extends Traced<"mutation">>(
    ref: Ref,
    args: UntracedArgs<Ref>,
  ): Promise<FunctionReturnType<Ref>> =>
    ctx.runMutation(ref, ...([withTraceArg(trace, args)] as OptionalRestArgs<Ref>)),
  scheduleTracedAfter: <Ref extends Traced<"action"> | Traced<"mutation">>(
    delayMs: number,
    ref: Ref,
    args: UntracedArgs<Ref>,
  ) => ctx.scheduler.runAfter(delayMs, ref, ...([withTraceArg(trace, args)] as OptionalRestArgs<Ref>)),
});

/** An action can also run another action. Its other two runners mirror the mutation's. */
const actionRunners = (ctx: ActionCtx, trace: TraceContext | null) => ({
  trace,
  runTracedAction: <Ref extends Traced<"action">>(
    ref: Ref,
    args: UntracedArgs<Ref>,
  ): Promise<FunctionReturnType<Ref>> =>
    ctx.runAction(ref, ...([withTraceArg(trace, args)] as OptionalRestArgs<Ref>)),
  runTracedMutation: <Ref extends Traced<"mutation">>(
    ref: Ref,
    args: UntracedArgs<Ref>,
  ): Promise<FunctionReturnType<Ref>> =>
    ctx.runMutation(ref, ...([withTraceArg(trace, args)] as OptionalRestArgs<Ref>)),
  scheduleTracedAfter: <Ref extends Traced<"action"> | Traced<"mutation">>(
    delayMs: number,
    ref: Ref,
    args: UntracedArgs<Ref>,
  ) => ctx.scheduler.runAfter(delayMs, ref, ...([withTraceArg(trace, args)] as OptionalRestArgs<Ref>)),
});

/** What a traced action's handler receives on top of its builder's own ctx. */
export type TracedActionCtx = ActionCtx & ReturnType<typeof actionRunners>;

type MaybePromise<T> = T | Promise<T>;

/** The shape `withI18n`, `ownedInput` and the rest already have: what the trace layer wraps. */
type Mod<Ctx, ArgsValidator extends PropertyValidators, MadeCtx> = {
  args: ArgsValidator;
  input: (
    ctx: Ctx,
    args: ObjectType<ArgsValidator>,
    extra: Record<string, never>,
  ) => MaybePromise<{ ctx: MadeCtx; args: Record<string, never> }>;
};

/**
 * Folds the trace into an existing Mod, in the same layer, for the reason `withI18n` gives. It
 * must be the OUTERMOST wrapper: `withI18n` calls the Mod it wraps with an empty `extra`, so a
 * `trace` option given to a builder only reaches the layer that convex-helpers calls directly.
 * `tracing.test.ts` goes red if the order is flipped.
 *
 * `starts` is for a builder reached from outside: it only ever starts a trace. `joins` is for an
 * internal builder: it also takes the `__trace` its caller's runner added.
 */
const withTrace = <Ctx, Runners>(runners: (ctx: Ctx, trace: TraceContext | null) => Runners) => {
  const traced = async <ArgsValidator extends PropertyValidators, MadeCtx extends Record<string, unknown>>(
    mod: Mod<Ctx, ArgsValidator, MadeCtx>,
    ctx: Ctx,
    args: ObjectType<ArgsValidator>,
    joined: TraceContext | undefined,
    { trace: operation }: TraceOption,
  ) => {
    const inner = await mod.input(ctx, args, {});
    const trace = joined ?? startTrace(operation, (inner.ctx as { userId?: Id<"users"> }).userId);

    return { ctx: { ...inner.ctx, ...runners(ctx, trace) }, args: {} };
  };

  return {
    starts: <ArgsValidator extends PropertyValidators, MadeCtx extends Record<string, unknown>>(
      mod: Mod<Ctx, ArgsValidator, MadeCtx>,
    ) => ({
      args: mod.args,
      input: (ctx: Ctx, args: ObjectType<ArgsValidator>, extra: TraceOption) =>
        traced(mod, ctx, args, undefined, extra),
    }),
    joins: <ArgsValidator extends PropertyValidators, MadeCtx extends Record<string, unknown>>(
      mod: Mod<Ctx, ArgsValidator, MadeCtx>,
    ) => ({
      args: { ...mod.args, __trace: v.optional(vTraceContext) },
      input: (
        ctx: Ctx,
        { __trace, ...rest }: ObjectType<ArgsValidator> & { __trace?: TraceContext },
        extra: TraceOption,
      ) => traced(mod, ctx, rest as unknown as ObjectType<ArgsValidator>, __trace, extra),
    }),
  };
};

const mutationTrace = withTrace(mutationRunners);
const actionTrace = withTrace(actionRunners);

/** The Mod for a builder that resolves no identity: public, internal. */
const noIdentity = {
  args: {},
  input: async () => ({ ctx: {}, args: {} as Record<string, never> }),
};

const queryWithI18n = customQuery(query, i18nCustomization);

export const publicQuery = query;
export const publicMutation = customMutation(mutation, mutationTrace.starts(noIdentity));
export const publicAction = customAction(action, actionTrace.starts(noIdentity));

export const publicQueryI18n = queryWithI18n;
export const publicMutationI18n = customMutation(mutation, mutationTrace.starts(i18nCustomization));
export const publicActionI18n = customAction(action, actionTrace.starts(i18nCustomization));

export const internalMutation = customMutation(rawInternalMutation, mutationTrace.joins(noIdentity));
export const internalAction = customAction(rawInternalAction, actionTrace.joins(noIdentity));

/* ─── 2. Identity ──────────────────────────────────────────────────────────────────────── */

/** Every procedure context we can resolve an identity from. Actions have no `ctx.db`. */
type IdentityCtx = {
  auth: Auth;
  db?: DatabaseReader;
  runQuery?: ActionCtx["runQuery"];
};

/**
 * String-based reference: gives us the function without importing the api type graph.
 *
 * ⚠️ This path is not checked by the compiler. `router/users/__tests__/getAccount.test.ts`
 *    asserts it still resolves — if you move or rename that file, that test is what tells you.
 */
const getAccountRef = makeFunctionReference<"query", { userId: Id<"users"> }, AppUser | null>(
  "router/users/getAccount:_internal",
);

const resolveUser = async (
  ctx: IdentityCtx,
): Promise<{ user: AppUser; userId: Id<"users"> } | null> => {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  // Action contexts have no ctx.db — hop through an internal query.
  if (!ctx.db) {
    if (!ctx.runQuery) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const user = await ctx.runQuery(getAccountRef, { userId });
    return user ? { user, userId } : null;
  }

  const user = await loadUser({ db: ctx.db }, userId);
  return user ? { user, userId } : null;
};

const requireUser = async (ctx: IdentityCtx) => {
  const result = await resolveUser(ctx);
  if (!result) throw new ConvexError({ code: "UNAUTHENTICATED" });
  return result;
};

const requireAdmin = async (ctx: IdentityCtx) => {
  const result = await requireUser(ctx);
  if (result.user.role !== "ADMIN") throw new ConvexError({ code: "FORBIDDEN" });
  return result; // ← returns { user, userId }, so admin handlers get the same ctx as authed ones
};

/* ─── 3. Authenticated ─────────────────────────────────────────────────────────────────── */

export const authQuery = customQuery(query, customCtx(requireUser));

/**
 * Folds a `locale` arg and `ctx.i18n` into an existing Mod, in the *same* customization layer.
 * `customFunction` composition (`customQuery(queryWithI18n, customCtx(requireUser))`) loses the
 * inner layer's ctx additions in the type — each `custom*` builder declares its `InputCtx` as
 * the raw base ctx, not the enriched ctx of whatever builder it wraps — even though the runtime
 * ctx spread still carries `i18n` through. One layer keeps every addition in the same `CustomCtx`
 * so the type is right, and lets `ownedInput` / `householdInput` stay the single body they are.
 */
const withI18n = <
  Ctx extends Record<string, any>,
  ArgsValidator extends PropertyValidators,
  MadeCtx extends Record<string, any>,
>(
  mod: Customization<Ctx, ArgsValidator, MadeCtx, Record<string, never>>,
) => ({
  args: { ...mod.args, locale: vLocale },
  input: async (ctx: Ctx, { locale, ...rest }: ObjectType<ArgsValidator> & { locale: Locale }) => {
    const inner = await mod.input(ctx, rest as unknown as ObjectType<ArgsValidator>, {});
    return {
      ctx: { ...inner.ctx, i18n: { locale, resolve: (field: Localized) => resolvei18n(field, locale) } },
      args: {},
    };
  },
});

/**
 * `customCtx(requireUser)` as a plain Mod, which is the shape `withI18n` and `withTrace` wrap.
 * The queries keep `customCtx`: nothing wraps them.
 */
const identityInput = (resolveIdentity: typeof requireUser) => ({
  args: {},
  input: async (ctx: IdentityCtx) => ({ ctx: await resolveIdentity(ctx), args: {} }),
});

export const authMutation = customMutation(mutation, mutationTrace.starts(identityInput(requireUser)));
export const authAction = customAction(action, actionTrace.starts(identityInput(requireUser)));

export const authQueryI18n = customQuery(query, withI18n(identityInput(requireUser)));
export const authMutationI18n = customMutation(mutation, mutationTrace.starts(withI18n(identityInput(requireUser))));
export const authActionI18n = customAction(action, actionTrace.starts(withI18n(identityInput(requireUser))));

/* ─── 4. Admin — one customization for all three, so they cannot drift ─────────────────── */

export const adminQuery = customQuery(query, customCtx(requireAdmin));
export const adminMutation = customMutation(mutation, mutationTrace.starts(identityInput(requireAdmin)));
export const adminAction = customAction(action, actionTrace.starts(identityInput(requireAdmin)));

export const adminQueryI18n = customQuery(query, withI18n(identityInput(requireAdmin)));
export const adminMutationI18n = customMutation(mutation, mutationTrace.starts(withI18n(identityInput(requireAdmin))));
export const adminActionI18n = customAction(action, actionTrace.starts(withI18n(identityInput(requireAdmin))));

/* ─── 5. Server-to-server ──────────────────────────────────────────────────────────────── */

const serverArgs = { _serverKey: v.string() };

/**
 * Note there is no `if (env.SERVER_PRIVATE_KEY)` guard. `env.ts` already refused to boot
 * without the key, so branching on it here could only ever mean "skip the check when
 * misconfigured" (A2).
 */
const assertServerKey = (provided: string) => {
  if (!timingSafeEqual(provided, env.SERVER_PRIVATE_KEY)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Invalid server key" });
  }
};

export const serverQuery = customQuery(query, {
  args: serverArgs,
  input: async (_ctx, { _serverKey }) => {
    assertServerKey(_serverKey);
    return { ctx: {}, args: {} };
  },
});

/** The query's check as a plain Mod, for the two traced builders to wrap. */
const serverInput = {
  args: serverArgs,
  input: async (_ctx: unknown, { _serverKey }: { _serverKey: string }) => {
    assertServerKey(_serverKey);
    return { ctx: {}, args: {} as Record<string, never> };
  },
};

export const serverMutation = customMutation(mutation, mutationTrace.starts(serverInput));
export const serverAction = customAction(action, actionTrace.starts(serverInput));

/* ─── 6. ★ Ownership as a capability, not a convention ─────────────────────────────────────
 * The handler cannot run without `ctx.doc`, and `ctx.doc` cannot exist unless the caller owns
 * it. There is no code path that forgets the check — the difference between a capability and
 * an optional helper (P3).
 *
 * Add a table here the moment it gains a `userId`, and the ownership rules themselves go in
 * `functions/users/isAuthorized.ts`.
 */
/**
 * Tables whose rows are owned by one `userId`, which is what `isAuthorized` checks.
 *
 * `Extract` is deliberate and load-bearing: a name that is not a declared table drops out
 * silently, so the list can never name a table that does not exist. It also means a typo removes
 * a table from the capability without a word — check the generated `TableNames` if a builder
 * suddenly rejects an id it used to accept.
 *
 * Household-scoped tables (`groceryListItems`, `cellarItems`, `recentlyUsedIngredients`) are
 * **not** here. They carry a `householdId` and no `userId`, so `isAuthorized` could only ever
 * throw FORBIDDEN for them — fail-closed, but a builder that cannot succeed is a trap, not a
 * guard. They are reached through `householdQuery` / `householdMutation` below.
 *
 * Add a table here the moment it gains a `userId`, and the ownership rules themselves go in
 * `functions/users/isAuthorized.ts`.
 */
type OwnedTable = Extract<TableNames, "recipes" | "recipeSteps" | "recipeIngredients" | "ingredients">;

/**
 * The ownership check, written once and handed to all four builders.
 *
 * It was four identical bodies. The failure that shape invites is not a typo — it is a change to
 * the check landing in three of them, and the `I18n` pair being the ones with no test is exactly
 * where it would go unnoticed. `householdInput` below is the same idea for the same reason.
 */
const ownedInput = <T extends OwnedTable>(table: T) => ({
  args: { id: v.id(table) },
  input: async (ctx: IdentityCtx & { db: DatabaseReader }, { id }: { id: Id<T> }) => {
    const { user, userId } = await requireUser(ctx);
    const doc = await isAuthorized({ ...ctx, user, userId }, id);

    return { ctx: { user, userId, doc: doc as Doc<T> }, args: {} };
  },
});

export const ownedQuery = <T extends OwnedTable>(table: T) => customQuery(query, ownedInput(table));
export const ownedMutation = <T extends OwnedTable>(table: T) =>
  customMutation(mutation, mutationTrace.starts(ownedInput(table)));

export const ownedQueryI18n = <T extends OwnedTable>(table: T) => customQuery(query, withI18n(ownedInput(table)));
export const ownedMutationI18n = <T extends OwnedTable>(table: T) =>
  customMutation(mutation, mutationTrace.starts(withI18n(ownedInput(table))));

/* ─── 7. ★ Household membership as a capability ────────────────────────────────────────────
 * Same guarantee as `ownedQuery`/`ownedMutation`, for a different shape: several tables are
 * scoped by `householdId` rather than owned by a single `userId`, and membership is
 * many-to-many via `householdUsers` rather than a field on the document itself. The handler
 * cannot run without a confirmed member, and `ctx.householdId` is what it queries with.
 */
const householdInput = {
  args: { householdId: v.id("households") },
  input: async (ctx: IdentityCtx & { db: DatabaseReader }, { householdId }: { householdId: Id<"households"> }) => {
    const { user, userId } = await requireUser(ctx);
    if (!(await isMember(ctx, householdId, userId))) {
      throw new ConvexError({ code: "FORBIDDEN" });
    }
    return { ctx: { user, userId, householdId }, args: {} };
  },
};

export const householdQuery = customQuery(query, householdInput);
export const householdQueryI18n = customQuery(query, withI18n(householdInput));

export const householdMutation = customMutation(mutation, mutationTrace.starts(householdInput));
export const householdMutationI18n = customMutation(mutation, mutationTrace.starts(withI18n(householdInput)));
