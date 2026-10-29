import type { IndexRange } from "convex/server";

import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../procedures";
import { scheduleImageTreeDeletion } from "./media/imageTree";

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
type ReferencingRule = {
  table: TableNames;
  index: string;
  field: string;
  onDelete?: "delete" | "detach";
};

/**
 * An image the deleted row itself points at, which goes with it.
 *
 * The other direction from `ReferencingRule`, and the one an index lookup cannot see: nothing
 * points AT the recipe from `images`, the recipe points at the image. Without this the row would go
 * and its generated photos would stay in the bucket, referenced by nothing.
 *
 * Always the whole tree (`scheduleImageTreeDeletion`), never the one image: a field holding a
 * cut-out would otherwise leave the render it was cut from behind. C4 checks that `field` is a
 * `v.id("images")` on the table the rule sits under.
 */
type OwnedImageRule = {
  field: string;
  onDelete: "delete-image-tree";
};

type CascadeRule = ReferencingRule | OwnedImageRule;

/**
 * Every foreign key in the schema, declared once, keyed by the table being deleted.
 *
 * Hand-written cascades are how the predecessor orphaned rows across six tables: each delete
 * path cleaned up the relationships its author remembered, and a new foreign key had to be
 * chased through every one of them. Declaring the relationships instead means adding a
 * dependent table is one line here — and check C4 fails the build if a `v.id()` field exists
 * with no entry, or with no index able to answer the lookup.
 *
 * ⚠️ `users` is owned by @convex-dev/auth. An ordinary account deletion does not come through here:
 *    it anonymizes and keeps the row (`purgeUser`). Only a forced erase of a bot or a spammer deletes
 *    it, after removing the sign-ins the component hangs off it, and these rules are what take our
 *    sibling rows with it.
 */
export const CASCADE: Partial<Record<TableNames, CascadeRule[]>> = {
  users: [
    { table: "usersExtended", index: "by_user", field: "userId" },
    // Deleted, not detached: preferences have no meaning without the person they describe.
    { table: "userPreferences", index: "by_user", field: "userId" },
    { table: "householdUsers", index: "by_user", field: "userId" },
    // Deleted, not detached: `userId` is required there, and a departure with nobody attached to
    // it records nothing.
    { table: "householdFormerMembers", index: "by_user", field: "userId" },
    { table: "recipeFavorites", index: "by_user", field: "userId" },
    // Detached, not deleted: a recipe outlives its author. `loadRecipe` already draws a recipe with
    // no `userId` as uncredited, and deleting it would take every household's copy of the dish with
    // the account that happened to write it.
    { table: "recipes", index: "by_user", field: "userId", onDelete: "detach" },
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
    // Detached for the same reason: a recipe is not its photo, and the screen draws a placeholder.
    { table: "recipes", index: "by_cover_image", field: "coverImageId", onDelete: "detach" },
    { table: "recipes", index: "by_plate_image", field: "plateImageId", onDelete: "detach" },
  ],
  households: [
    { table: "householdUsers", index: "by_household", field: "householdId" },
    { table: "householdFormerMembers", index: "by_household_and_user", field: "householdId" },
    // Detached, not deleted: the person whose current household went still exists, and the reads
    // fall back to their oldest membership when the pointer is unset.
    { table: "usersExtended", index: "by_current_household", field: "currentHouseholdId", onDelete: "detach" },
    { table: "groceryListItems", index: "by_household", field: "householdId" },
    { table: "cellarItems", index: "by_household", field: "householdId" },
    { table: "recentlyUsedIngredients", index: "by_household", field: "householdId" },
    { table: "mealPlans", index: "by_household", field: "householdId" },
    { table: "plannedMeals", index: "by_household_and_date", field: "householdId" },
  ],
  mealPlans: [
    { table: "plannedMeals", index: "by_meal_plan", field: "mealPlanId" },
  ],
  recipes: [
    { table: "recipeContents", index: "by_recipe", field: "recipeId" },
    { table: "recipeIngredients", index: "by_recipe", field: "recipeId" },
    { table: "recipeFavorites", index: "by_recipe", field: "recipeId" },
    { table: "plannedMeals", index: "by_recipe", field: "recipeId" },
    { field: "coverImageId", onDelete: "delete-image-tree" },
    { field: "plateImageId", onDelete: "delete-image-tree" },
  ],
  ingredients: [
    { table: "groceryListItems", index: "by_ingredient", field: "ingredientId" },
    { table: "cellarItems", index: "by_ingredient", field: "ingredientId" },
    { table: "recentlyUsedIngredients", index: "by_ingredient", field: "ingredientId" },
    { table: "recipeIngredients", index: "by_ingredient", field: "ingredientId" },
    { table: "plannedMealIngredients", index: "by_ingredient", field: "ingredientId" },
    // Its generated photo goes with it, as a recipe's do — nothing else points at that tree.
    { field: "imageId", onDelete: "delete-image-tree" },
  ],
  groceryListItems: [
    {
      table: "plannedMealIngredients",
      index: "by_grocery_list_item",
      field: "groceryListItemId",
      onDelete: "detach",
    },
  ],
  cellarItems: [
    {
      table: "plannedMealIngredients",
      index: "by_cellar_item",
      field: "cellarItemId",
      onDelete: "detach",
    },
  ],
  plannedMeals: [
    {
      table: "plannedMealIngredients",
      index: "by_planned_meal",
      field: "plannedMealId",
    },
  ],
};

/**
 * Deletes `id` and everything that references it, recursively.
 *
 * A `"delete"` rule runs this same function on each dependent row rather than deleting it bare, so
 * the dependent's own rules fire too. Deleting bare was how a cascade two levels deep orphaned its
 * grandchildren: the rows under the row it removed never learned their parent was gone.
 *
 * A row already gone is a no-op rather than a throw. Recursion can reach the same row twice by two
 * paths, and the second arrival has nothing left to do.
 *
 * For very large fan-outs, schedule the cascade in batches rather than doing it in one
 * mutation — a single transaction has a read/write budget and will fail once exceeded.
 */
export const cascadeDelete = async <T extends TableNames>(
  ctx: MutationCtx,
  table: T,
  id: Id<T>,
): Promise<void> => {
  const doc = await ctx.db.get(id);
  if (!doc) return;

  for (const rule of CASCADE[table] ?? []) {
    if (rule.onDelete === "delete-image-tree") {
      // The field is data, not a literal, so the document cannot be indexed by it with its type.
      // C4 is what proves it names a `v.id("images")` on this table.
      const imageId = (doc as Record<string, unknown>)[rule.field] as Id<"images"> | undefined;
      if (imageId) await scheduleImageTreeDeletion(ctx, imageId);
      continue;
    }

    const rows = await ctx.db
      .query(rule.table)
      // The index name and field are data, not literals, so the generic index API cannot type
      // this call. C4 is what proves the pair actually exists on the table.
      .withIndex(rule.index as never, (q) => (q as unknown as QEq).eq(rule.field, id))
      .collect();

    for (const row of rows) {
      if (rule.onDelete === "detach") {
        // Clearing the pointer, not the row. The field is optional by construction — see the note
        // on `ReferencingRule` — so `undefined` is a value the schema accepts.
        await ctx.db.patch(row._id, { [rule.field]: undefined } as never);
      } else {
        await cascadeDelete(ctx, rule.table, row._id as never);
      }
    }
  }

  await ctx.db.delete(id);
};

/**
 * The tables still holding a row that points at `id`, read off the same `CASCADE` rules the delete
 * follows — so a foreign key added there is checked here without anyone remembering to.
 *
 * Empty means deleting `id` would only remove the row itself (and its owned images). One `.first()`
 * per rule: the question is whether anything is left, not how much.
 */
export const referencedBy = async <T extends TableNames>(
  ctx: MutationCtx,
  table: T,
  id: Id<T>,
): Promise<TableNames[]> => {
  const tables: TableNames[] = [];

  for (const rule of CASCADE[table] ?? []) {
    if (rule.onDelete === "delete-image-tree") continue;

    const row = await ctx.db
      .query(rule.table)
      // Data, not literals — see `cascadeDelete`. C4 proves the index answers the field.
      .withIndex(rule.index as never, (q) => (q as unknown as QEq).eq(rule.field, id))
      .first();

    if (row && !tables.includes(rule.table)) tables.push(rule.table);
  }

  return tables;
};

/** The one operation we need from an index range builder, minus the field-name typing. */
type QEq = { eq: (field: string, value: unknown) => IndexRange };
