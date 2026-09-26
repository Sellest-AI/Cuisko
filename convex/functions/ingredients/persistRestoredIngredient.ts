import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "@convex/procedures";
import { DEFAULT_LOCALE, LOCALES } from "@convex/schema/i18n";
import type { PortableIngredient } from "@convex/schema/ingredientPayloads";
import { ALIAS_EXACT } from "@shared/ingredientMatch";

import { restoredIngredientRow } from "./ingredientRow";
import { searchWidened } from "./searchWidened";

/**
 * The row this deployment already holds for an exported ingredient, or `null`.
 *
 * By `slug` first: it is the seed's identity, and it survives a rename. A row with no slug — one
 * the app grew from a cook's typing — is matched by an exact name or alias only (`ALIAS_EXACT`),
 * the same dedup `createIngredient` runs before it inserts, so a restore reuses exactly the rows a
 * create would have.
 */
const _findRestoredIngredient = async (
  ctx: Pick<QueryCtx, "db">,
  { slug, name }: PortableIngredient["row"],
): Promise<Doc<"ingredients"> | null> => {
  if (slug) {
    const seeded = await ctx.db
      .query("ingredients")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (seeded) return seeded;
  }

  const locale = LOCALES.find((each) => name.values[each]) ?? DEFAULT_LOCALE;
  const [best] = await searchWidened(ctx, { text: name.values[locale] ?? "", locale });

  return best && best.score >= ALIAS_EXACT ? ctx.db.get(best.ingredientId) : null;
};

/**
 * The first step of a restore, before anything is uploaded: one exported ingredient into this
 * deployment, and whether its row still wants the exported image.
 *
 * **A row the deployment already holds keeps every fact it has**; only a missing image is filled
 * in, by the action, once this has answered `needsImage`. That is what makes "seed, then restore"
 * safe, and a restore run twice a no-op. A row `restoredIngredientRow` refuses throws here, so a
 * refused ingredient never costs an upload.
 */
export const persistRestoredIngredient = async (
  ctx: MutationCtx,
  { ingredient }: { ingredient: PortableIngredient },
): Promise<{ ingredientId: Id<"ingredients">; created: boolean; needsImage: boolean }> => {
  const existing = await _findRestoredIngredient(ctx, ingredient.row);
  if (existing) return { ingredientId: existing._id, created: false, needsImage: !existing.imageId };

  const ingredientId = await ctx.db.insert("ingredients", {
    ...restoredIngredientRow(ingredient.row),
    updatedAt: Date.now(),
  });

  return { ingredientId, created: true, needsImage: true };
};
