import { ConvexError } from "convex/values";

import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";

import { householdsOf, pickCurrentHousehold } from "../households/listForUser";
import { type AppUser, loadUser } from "../users/loadUser";

/** Who a verified MCP token acts for, on this call. */
export type McpCook = {
  userId: Id<"users">;
  role: AppUser["role"];
  /** The household the app shops for, by the rule the app itself reads. */
  householdId: Id<"households">;
};

/**
 * Resolves the cook behind a verified token, on every tool call rather than at connection time: a
 * cook who switches household or leaves one is honoured on the next call, and a purged account
 * (`loadUser` refuses it) stops acting at once, whatever the token says.
 *
 * Throws sentences, not codes: a `ConvexError`'s text is the only thing the component shows a model,
 * and these are what it should tell the cook.
 */
export const loadCook = async (
  ctx: Pick<QueryCtx, "db">,
  { userId }: { userId: Id<"users"> },
): Promise<McpCook> => {
  const user = await loadUser(ctx, userId);
  if (!user) throw new ConvexError("This Cuisko account no longer exists.");

  const householdId = pickCurrentHousehold(await householdsOf(ctx, userId), user.currentHouseholdId);
  if (!householdId) throw new ConvexError("This cook has no household yet: they need to join one in the Cuisko app.");

  return { userId, role: user.role, householdId };
};
