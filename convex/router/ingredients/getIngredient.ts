import { loadCatalogIngredient } from "@convex/functions/ingredients/catalogIngredient";
import { publicQueryI18n } from "@convex/procedures";
import { ConvexError, v } from "convex/values";

/** Anonymous for the same reason as `search.ts` and `list.ts`: the catalog is reference data. */
export const anon = publicQueryI18n({
  args: {
    id: v.id("ingredients"),
  },
  handler: async (ctx, { id }) => {
    const ingredient = await ctx.db.get(id);
    if (!ingredient) throw new ConvexError({ code: "NOT_FOUND", message: "Ingredient not found" });

    return loadCatalogIngredient(ctx, ingredient, ctx.i18n.locale);
  },
});
