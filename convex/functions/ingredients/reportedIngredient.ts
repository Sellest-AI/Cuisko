import type { Doc, Id } from "@convex/_generated/dataModel";
import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import type { ReportedIngredient } from "@convex/schema/events";

/** The language every cook's events are named in, so a `carotte` and a `carrot` are one row. */
const REPORTED_LOCALE = "en";

/**
 * A catalog ingredient as a product event carries it (ADR 0019): its id, the stable key; its name
 * in one fixed language, so a "most added" chart is readable and does not split by the cook's
 * language; and its category, to roll the long tail up.
 *
 * The name is the catalog's, shared with every cook, not the line the cook wrote. Only the id is
 * sent when the row is gone. From a row the writer already loaded, so the report reads nothing.
 */
export const reportedIngredientOf = (
  ingredientId: Id<"ingredients">,
  row: Doc<"ingredients"> | null,
): ReportedIngredient =>
  row ? { ingredientId, ingredient: resolvei18n(row.name, REPORTED_LOCALE), category: row.category } : { ingredientId };

/** The same, for a writer that never loaded the row (`addToGroceryList`). */
export const reportedIngredient = async (
  ctx: Pick<QueryCtx, "db">,
  ingredientId: Id<"ingredients">,
): Promise<ReportedIngredient> => reportedIngredientOf(ingredientId, await ctx.db.get(ingredientId));
