import { loadIngredients } from "@convex/functions/ingredients/loadIngredients";
import { publicQueryI18n } from "@convex/procedures";
import { v } from "convex/values";

/** Anonymous for the same reason as `search.ts`: the catalog is reference data, owned by nobody. */
export const anon = publicQueryI18n({
  args: {
    ids: v.array(v.id("ingredients")),
  },
  handler: (ctx, { ids }) => loadIngredients(ctx, { ids, locale: ctx.i18n.locale }),
});
