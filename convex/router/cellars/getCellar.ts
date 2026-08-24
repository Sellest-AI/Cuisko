import { householdQuery } from "@convex/procedures";

export const authed = householdQuery({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db
      .query("cellarItems")
      .withIndex("by_household", (q) => q.eq("householdId", ctx.householdId))
      .collect();

    return items;
  },
});
