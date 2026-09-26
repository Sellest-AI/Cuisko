import type { PaginationOptions, PaginationResult } from "convex/server";

import type { QueryCtx } from "@convex/procedures";
import type { Id } from "@convex/_generated/dataModel";
import type { Locale } from "@convex/schema/i18n";

import { type RecipeCard, toRecipeCards } from "./recipeCard";

type ListCtx = Pick<QueryCtx, "db">;

type Args = {
  userId: Id<"users">;
  locale: Locale;
  paginationOpts: PaginationOptions;
};

/**
 * One page of the caller's own live recipes, newest first. An archived one is the cook's deleted
 * one, so it is left out in the index rather than after it.
 *
 * The owner is in the index rather than in a `.filter()`, which is not a preference: Convex
 * paginates the index read and applies a filter to the resulting page, so a filtered page of 24
 * could come back holding 3 while still reporting more to come — infinite scroll stopping early
 * and silently hiding recipes (ADR 0007, C3).
 *
 * Newest first because the list is where a cook lands after writing one, and the recipe they just
 * wrote is the one they are looking for. The index orders by creation time within its prefix, so
 * `.order("desc")` is the whole of it — no sort key, and nothing to keep in step.
 */
export const listForUser = async (
  ctx: ListCtx,
  { userId, locale, paginationOpts }: Args,
): Promise<PaginationResult<RecipeCard>> => {
  const page = await ctx.db
    .query("recipes")
    .withIndex("by_user_and_is_archived", (q) => q.eq("userId", userId).eq("isArchived", false))
    .order("desc")
    .paginate(paginationOpts);

  /**
   * The cursor and `isDone` are passed through untouched. They describe the index read, and the
   * mapping is one-to-one — a page that rewrote them would be answering for a set it did not read.
   */
  return { ...page, page: await toRecipeCards(ctx, page.page, locale) };
};
