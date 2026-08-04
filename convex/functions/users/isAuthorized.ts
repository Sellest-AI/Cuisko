import { ConvexError } from "convex/values";

import type { Doc, Id, TableNames } from "../../_generated/dataModel";
import type { QueryCtx } from "../../procedures";
import type { AppUser } from "./loadUser";

/**
 * Fields that make a document owned *indirectly*, walked in order. A recipe step carries no
 * meaningful owner of its own — it belongs to whoever owns its recipe.
 *
 * Add to this list when a table gains a parent reference; that is the whole extension point.
 */
const PARENT_FIELDS = ["recipeId"] as const;

/** The field naming the direct owner, on every table that has one. */
const OWNER_FIELD = "userId";

type AuthorizedCtx = Pick<QueryCtx, "db"> & {
  userId: Id<"users">;
  user: AppUser;
};

/**
 * Answers "may this caller touch this document?" and throws if not.
 *
 * This helper owns the ownership RULES. `ownedQuery` / `ownedMutation` in `procedures.ts`
 * guarantee they are always APPLIED — producing two
 * live IDORs. Keeping them apart means batch operations and already-loaded documents can
 * still be checked directly, without a second implementation of the rules.
 *
 * ⚠️ Never call this from a `router/` file. If a router needs an ownership check, it uses
 *    `ownedQuery` / `ownedMutation`. Direct calls belong in `functions/`.
 */
export const isAuthorized = async <T extends TableNames>(
  ctx: AuthorizedCtx,
  idOrDoc: Id<T> | Doc<T>,
): Promise<Doc<T>> => {
  const doc = typeof idOrDoc === "string" ? await ctx.db.get(idOrDoc) : idOrDoc;
  if (!doc) throw new ConvexError({ code: "NOT_FOUND" });

  // Ownership is read structurally rather than from a per-table registry: a registry is one
  // more thing to remember to update when a table is added, and forgetting it fails open.
  const record = doc as Record<string, unknown>;

  if (record[OWNER_FIELD] === ctx.userId) return doc;

  for (const field of PARENT_FIELDS) {
    const parentId = record[field];
    if (typeof parentId !== "string") continue;

    const parent = await ctx.db.get(parentId as Id<TableNames>);
    if (parent && (parent as Record<string, unknown>)[OWNER_FIELD] === ctx.userId) return doc;
  }

  throw new ConvexError({ code: "FORBIDDEN" });
};
