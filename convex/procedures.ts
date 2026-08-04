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
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { type Auth, makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { action, type ActionCtx, type DatabaseReader, mutation, query } from "./_generated/server";
import { env } from "./env";
import { isAuthorized } from "./functions/users/isAuthorized";
import { type AppUser, loadUser } from "./functions/users/loadUser";
import { timingSafeEqual } from "./lib/secrets";

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

export const publicQuery = query;
export const publicMutation = mutation;
export const publicAction = action;

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

/* ─── 4. Admin — one customization for all three, so they cannot drift ─────────────────── */

export const adminQuery = customQuery(query, customCtx(requireAdmin));
export const adminMutation = customMutation(mutation, customCtx(requireAdmin));
export const adminAction = customAction(action, customCtx(requireAdmin));

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
type OwnedTable = Extract<TableNames, "recipes" | "ingredients" | "recipeSteps">;

export const ownedQuery = <T extends OwnedTable>(table: T) =>
  customQuery(query, {
    args: { id: v.id(table) },
    input: async (ctx, { id }) => {
      const { user, userId } = await requireUser(ctx);
      const doc = await isAuthorized({ ...ctx, user, userId }, id);
      return { ctx: { user, userId, doc: doc as Doc<T> }, args: {} };
    },
  });

export const ownedMutation = <T extends OwnedTable>(table: T) =>
  customMutation(mutation, {
    args: { id: v.id(table) },
    input: async (ctx, { id }) => {
      const { user, userId } = await requireUser(ctx);
      const doc = await isAuthorized({ ...ctx, user, userId }, id);
      return { ctx: { user, userId, doc: doc as Doc<T> }, args: {} };
    },
  });
