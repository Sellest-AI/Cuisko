import { searchTextOf } from "@shared/search";
import type { Category } from "@shared/categories";
import type { MutationCtx } from "@convex/procedures";
import { hashText, setTranslation } from "@convex/lib/i18n";
import { computeNutriScore } from "@shared/nutrition";
import { CATALOG } from "./ingredientCatalog";

/**
 * The share of an ingredient, by weight, that is fruit/vegetable/legume — the one Nutri-Score
 * input the catalog does not measure per ingredient (see shared/nutrition.ts). Estimated from
 * `category` since these are single, unprocessed ingredients rather than mixed products.
 */
const FRUIT_VEG_LEGUME_PERCENT: Partial<Record<Category, number>> = {
  VEGETABLE: 100,
  FRUIT: 100,
  HERB: 100,
  LEGUME: 50,
};

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

    const nutriScore = computeNutriScore(
      entry.nutrition,
      FRUIT_VEG_LEGUME_PERCENT[entry.category] ?? 0,
    );

    const en = setTranslation({ values: {}, meta: {} }, "en", entry.en, "edited", hashText(entry.en));
    const name = setTranslation(en, "fr", entry.fr, "edited", hashText(entry.fr));

    const existing = await ctx.db
      .query("ingredients")
      .withIndex("by_slug", (q) => q.eq("slug", entry.slug))
      .unique();

    const row = {
      slug: entry.slug,
      name,
      emoji: entry.emoji,
      aliases: entry.aliases,
      // Built by the shared serializer and by nothing else (ADR 0011) — a blob assembled at one
      // call site is indexed under a spelling the reader never searches for, silently.
      search: {
        en: searchTextOf([entry.en, ...(entry.aliases.en ?? [])]),
        fr: searchTextOf([entry.fr, ...(entry.aliases.fr ?? [])]),
      },
      category: entry.category,
      diet: entry.diet,
      // Written on every seeded row, and `[]` on the ones carrying none — never left undefined.
      // That is what makes the empty case a claim rather than a gap: the catalog HAS considered
      // all 266, so `[]` here means "free of the fourteen". See schema/ingredients.ts.
      allergens: entry.allergens,
      defaultUnit: entry.defaultUnit,
      defaultQuantity: entry.defaultQuantity,
      // Undefined for a row that has no such ratio, which is how `patch` drops one that was
      // removed from the catalog — an omitted key would leave the old value in place instead.
      gramsPerPiece: entry.gramsPerPiece,
      gramsPerMl: entry.gramsPerMl,
      nutrition: entry.nutrition,
      nutriScore,
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
