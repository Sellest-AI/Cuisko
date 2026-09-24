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
import { type Auth, makeFunctionReference } from "convex/server";
import { ConvexError, type ObjectType, type PropertyValidators, v } from "convex/values";

import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { action, type ActionCtx, type DatabaseReader, mutation, query } from "./_generated/server";
import { env } from "./env";
import { isMember } from "./functions/households/isMember";
import { isAuthorized } from "./functions/users/isAuthorized";
import { type AppUser, loadUser } from "./functions/users/loadUser";
import { resolvei18n } from "./lib/i18n";
import { timingSafeEqual } from "./lib/secrets";
import { LOCALES, type Locale, type Localized } from "./schema/i18n";

/* ─── 1. The complete re-export surface ──────────────────────────────────────────────────
 * A rule needs an affordance or it will be broken (P1). Every builder and every ctx type a
 * backend file could want is here, so "never import _generated/server" is always followable.
 * If you find yourself needing something this file does not export, add it here — do not
 * route around it.
 */
export {
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
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

const queryWithI18n = customQuery(query, i18nCustomization);
const mutationWithI18n = customMutation(mutation, i18nCustomization);
const actionWithI18n = customAction(action, i18nCustomization);

export const publicQuery = query;
export const publicMutation = mutation;
export const publicAction = action;

export const publicQueryI18n = queryWithI18n;
export const publicMutationI18n = mutationWithI18n;
export const publicActionI18n = actionWithI18n;

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
export const authMutation = customMutation(mutation, customCtx(requireUser));
export const authAction = customAction(action, customCtx(requireUser));

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

const identityInput = (resolveIdentity: typeof requireUser) => ({
  args: {},
  input: async (ctx: IdentityCtx) => ({ ctx: await resolveIdentity(ctx), args: {} }),
});

export const authQueryI18n = customQuery(query, withI18n(identityInput(requireUser)));
export const authMutationI18n = customMutation(mutation, withI18n(identityInput(requireUser)));
export const authActionI18n = customAction(action, withI18n(identityInput(requireUser)));

/* ─── 4. Admin — one customization for all three, so they cannot drift ─────────────────── */

export const adminQuery = customQuery(query, customCtx(requireAdmin));
export const adminMutation = customMutation(mutation, customCtx(requireAdmin));
export const adminAction = customAction(action, customCtx(requireAdmin));

export const adminQueryI18n = customQuery(query, withI18n(identityInput(requireAdmin)));
export const adminMutationI18n = customMutation(mutation, withI18n(identityInput(requireAdmin)));
export const adminActionI18n = customAction(action, withI18n(identityInput(requireAdmin)));

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

export const serverMutation = customMutation(mutation, {
  args: serverArgs,
  input: async (_ctx, { _serverKey }) => {
    assertServerKey(_serverKey);
    return { ctx: {}, args: {} };
  },
});

export const serverAction = customAction(action, {
  args: serverArgs,
  input: async (_ctx, { _serverKey }) => {
    assertServerKey(_serverKey);
    return { ctx: {}, args: {} };
  },
});

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
export const ownedMutation = <T extends OwnedTable>(table: T) => customMutation(mutation, ownedInput(table));

export const ownedQueryI18n = <T extends OwnedTable>(table: T) => customQuery(query, withI18n(ownedInput(table)));
export const ownedMutationI18n = <T extends OwnedTable>(table: T) =>
  customMutation(mutation, withI18n(ownedInput(table)));

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

export const householdMutation = customMutation(mutation, householdInput);
export const householdMutationI18n = customMutation(mutation, withI18n(householdInput));
