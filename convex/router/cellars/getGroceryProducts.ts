import { householdQuery } from "@convex/procedures";

export const authed = householdQuery({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db
      .query("groceryProducts")
      .withIndex("by_household_and_name_key", (q) => q.eq("householdId", ctx.householdId))
      .collect();

    return products;
  },
});
