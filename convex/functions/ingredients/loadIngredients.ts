import type { Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";

import { type CatalogIngredient, loadCatalogIngredients } from "./catalogIngredient";

type LoadCtx = Pick<QueryCtx, "db">;

/**
 * Reads a known set of ingredients by id — what the grocery grid needs to draw a name and an
 * emoji next to rows it already holds the ids of.
 *
 * Ids that no longer resolve are skipped rather than returned as holes. A cellar row can outlive
 * the ingredient it points at (a catalog row deleted between the two reads), and one missing
 * label must not blank the grid. The caller therefore cannot index into the result by position —
 * match on `_id`.
 */
export const loadIngredients = async (
  ctx: LoadCtx,
  { ids, locale }: { ids: Id<"ingredients">[]; locale: Locale },
): Promise<CatalogIngredient[]> => {
  const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));

  return loadCatalogIngredients(ctx, rows.filter((row) => row !== null), locale);
};
