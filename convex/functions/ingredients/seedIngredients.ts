import type { MutationCtx } from "@convex/procedures";
import { CATALOG } from "./ingredientCatalog";
import { ingredientRow } from "./ingredientRow";

/**
 * Inserts or updates the starter ingredient catalog. Idempotent: matches existing rows by `slug`,
 * so re-running after editing `ingredientCatalog.ts` updates them in place instead of duplicating
 * the table.
 *
 * **Throws on a catalog row with no diet**, naming the slug. That is the point of the throw rather
 * than a fallback: `CONDIMENT`, `SWEETENER` and `OTHER` have no category default precisely because
 * fish sauce, honey and gelatin live there, and defaulting one of them to the plant answer is
 * invisible until a vegetarian is served a recipe we labelled. Failing the seed is loud, happens
 * to whoever edited the catalog, and happens before any row is written.
 *
 * One of several legitimate writers of this table, and it shapes none of its own row — every
 * field, `search` and `nutriScore` included, comes from `ingredientRow` (ADR 0011).
 */
export const seedIngredients = async (ctx: MutationCtx) => {
  let created = 0;
  let updated = 0;

  for (const entry of CATALOG) {
    if (!entry.diet) {
      throw new Error(
        `Catalog row "${entry.slug}" (${entry.category}) declares no diet. Its category cannot ` +
          `decide one, so it needs an entry in DIET in ingredientCatalog.ts.`,
      );
    }

    const existing = await ctx.db
      .query("ingredients")
      .withIndex("by_slug", (q) => q.eq("slug", entry.slug))
      .unique();

    const { en, fr, ...facts } = entry;

    const row = {
      ...ingredientRow(
        {
          ...facts,
          diet: entry.diet,
          // Both languages are hand-written in `ingredientCatalog.ts`, so neither is a rendering
          // of the other and nothing should ever replace one with a translation of its twin.
          names: { en: { value: en, status: "edited" }, fr: { value: fr, status: "edited" } },
        },
        "seed",
      ),
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, row);
      updated++;
    } else {
      await ctx.db.insert("ingredients", row);
      created++;
    }
  }

  return { created, updated, total: CATALOG.length };
};
