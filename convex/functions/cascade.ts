import type { IndexRange } from "convex/server";

import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../procedures";

/**
 * A row that must die when its parent does: which table holds it, which index answers
 * "all rows pointing at this parent", and which field carries the reference.
 */
type CascadeRule = { table: TableNames; index: string; field: string };

/**
 * Every foreign key in the schema, declared once, keyed by the table being deleted.
 *
 * Hand-written cascades are how the predecessor orphaned rows across six tables: each delete
 * path cleaned up the relationships its author remembered, and a new foreign key had to be
 * chased through every one of them. Declaring the relationships instead means adding a
 * dependent table is one line here — and check C4 fails the build if a `v.id()` field exists
 * with no entry, or with no index able to answer the lookup.
 *
 * ⚠️ `users` is owned by @convex-dev/auth, so we never delete it ourselves — but our sibling
 *    rows still have to go when an account is removed, which is why it appears here.
 */
export const CASCADE: Partial<Record<TableNames, CascadeRule[]>> = {
  users: [
    { table: "usersExtended", index: "by_user", field: "userId" },
    { table: "householdUsers", index: "by_user", field: "userId" },
    { table: "recipeFavorites", index: "by_user", field: "userId" },
    // The recipe goes with its author: `userId` is what makes it theirs, and a recipe left behind
    // with a dangling one would show an empty chef on every screen that draws the credit.
    { table: "recipes", index: "by_user", field: "userId" },
  ],
  households: [
    { table: "householdUsers", index: "by_household", field: "householdId" },
    { table: "groceryListItems", index: "by_household", field: "householdId" },
    { table: "cellarItems", index: "by_household", field: "householdId" },
    { table: "recentlyUsedIngredients", index: "by_household", field: "householdId" },
  ],
  ingredients: [
    { table: "groceryListItems", index: "by_ingredient", field: "ingredientId" },
    { table: "cellarItems", index: "by_ingredient", field: "ingredientId" },
    { table: "recentlyUsedIngredients", index: "by_ingredient", field: "ingredientId" },
    { table: "ingredientAllergens", index: "by_ingredient", field: "ingredientId" },
    { table: "recipeIngredients", index: "by_ingredient", field: "ingredientId" },
  ],
  recipes: [
    { table: "recipeIngredients", index: "by_recipe", field: "recipeId" },
    { table: "recipeFavorites", index: "by_recipe", field: "recipeId" },
  ],
  allergens: [
    // The ingredient outlives its allergen: dropping "gluten" from the catalog leaves the flour.
    { table: "ingredientAllergens", index: "by_allergen", field: "allergenId" },
  ],
};

/**
 * Deletes `id` and everything that references it.
 *
 * For very large fan-outs, schedule the cascade in batches rather than doing it in one
 * mutation — a single transaction has a read/write budget and will fail once exceeded.
 */
export const cascadeDelete = async <T extends TableNames>(
  ctx: MutationCtx,
  table: T,
  id: Id<T>,
): Promise<void> => {
  for (const rule of CASCADE[table] ?? []) {
    const rows = await ctx.db
      .query(rule.table)
      // The index name and field are data, not literals, so the generic index API cannot type
      // this call. C4 is what proves the pair actually exists on the table.
      .withIndex(rule.index as never, (q) => (q as unknown as QEq).eq(rule.field, id))
      .collect();

    for (const row of rows) await ctx.db.delete(row._id);
  }

  await ctx.db.delete(id);
};

/** The one operation we need from an index range builder, minus the field-name typing. */
type QEq = { eq: (field: string, value: unknown) => IndexRange };
