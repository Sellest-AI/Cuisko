import type { IndexRange } from "convex/server";

import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../procedures";

/**
 * A row that must react when its parent dies: which table holds it, which index answers
 * "all rows pointing at this parent", and which field carries the reference.
 *
 * `onDelete` is what happens to the dependent row, and it defaults to `"delete"` — the case that
 * needs no thought, where the row has no meaning without its parent (a `recipeIngredient` without
 * its recipe). `"detach"` is the other case: the row outlives the parent and only loses the
 * pointer. An ingredient whose generated photo is deleted is still an ingredient, and cascading a
 * delete there would mean removing one image took the whole catalog row with it.
 *
 * A `"detach"` field must be optional in the schema — clearing a required field would write a row
 * that fails validation.
 */
type CascadeRule = {
  table: TableNames;
  index: string;
  field: string;
  onDelete?: "delete" | "detach";
};

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
    // Deleted, not detached: preferences have no meaning without the person they describe.
    { table: "userPreferences", index: "by_user", field: "userId" },
    { table: "householdUsers", index: "by_user", field: "userId" },
    { table: "recipeFavorites", index: "by_user", field: "userId" },
    // The recipe goes with its author: `userId` is what makes it theirs, and a recipe left behind
    // with a dangling one would show an empty chef on every screen that draws the credit.
    { table: "recipes", index: "by_user", field: "userId" },
    { table: "userImages", index: "by_user_id", field: "userId" },
  ],
  images: [
    { table: "imageSizes", index: "by_image_id", field: "imageId" },
    { table: "imageObjects", index: "by_image_id", field: "imageId" },
    { table: "imageObjects", index: "by_base_image_id", field: "baseImageId" },
    { table: "userImages", index: "by_image_id", field: "imageId" },
    // Detached, not deleted: the photo is a decoration on a catalog row that existed before it and
    // goes on existing after it. The tile falls back to the emoji, which is never absent.
    { table: "ingredients", index: "by_image", field: "imageId", onDelete: "detach" },
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
    { table: "recipeIngredients", index: "by_ingredient", field: "ingredientId" },
  ],
  recipes: [
    { table: "recipeIngredients", index: "by_recipe", field: "recipeId" },
    { table: "recipeFavorites", index: "by_recipe", field: "recipeId" },
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

    for (const row of rows) {
      if (rule.onDelete === "detach") {
        // Clearing the pointer, not the row. The field is optional by construction — see the note
        // on `CascadeRule` — so `undefined` is a value the schema accepts.
        await ctx.db.patch(row._id, { [rule.field]: undefined } as never);
      } else {
        await ctx.db.delete(row._id);
      }
    }
  }

  await ctx.db.delete(id);
};

/** The one operation we need from an index range builder, minus the field-name typing. */
type QEq = { eq: (field: string, value: unknown) => IndexRange };
