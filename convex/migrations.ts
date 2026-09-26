import { Migrations } from "@convex-dev/migrations";
import { facetsOf } from "@shared/tags";

import { components, internal } from "./_generated/api.js";
import type { DataModel } from "./_generated/dataModel.js";
import { skipAt } from "./functions/planning/skipMeal";
import { recipeSearchText } from "./functions/recipes/recipeSearchText";
import { randomShuffleKey } from "./lib/nanoid";

export const migrations = new Migrations<DataModel>(components.migrations);

/**
 * Backfills the two derived fields `saveRecipe` writes, onto recipes saved before they existed.
 *
 * **It has run, and both fields are now required.** They were `v.optional` only for as long as it
 * took this to land: `undefined` and `false` say the same thing about a facet, so the optionality
 * was a third state with no meaning attached to it. What that means for anyone reading this later
 * is that the migration is finished rather than pending — it is kept because a deployment that has
 * not had it applied still needs it, and because deleting a migration that has run somewhere and
 * not everywhere is how the two diverge.
 *
 * **`tags` is deliberately NOT recomputed, and this is the important decision in the file.**
 * Re-deriving them would mean calling `computeTags`, which refuses to claim anything unless it is
 * handed every line the recipe HAS — and that number is unrecoverable here. `saveRecipe` drops a
 * line that did not match the catalog, so `recipeIngredients` holds the matched subset and nothing
 * records how many were dropped. Passing `links.length` as the line count would assert "all lines
 * matched" for exactly the recipes where that is false, turning a refusal into a confident diet
 * claim on incomplete data. That is the failure `computeTags` exists to prevent, so this migration
 * does not reintroduce it from the side.
 *
 * The facets are therefore projected from the tags the row already carries. That keeps the filter
 * agreeing with the chip the cook is shown — a recipe displayed as vegetarian that a vegetarian
 * filter hides is incoherent in a way that is worse than either answer alone. Where an old tag is
 * itself wrong, the fix is to re-save the recipe, which corrects the tag and the facet together.
 *
 * @limitation `search` is rebuilt from the matched links, and is knowingly incomplete in the same
 * place: the raw text of an unmatched line was never stored, so a recipe whose "nuoc-mâm" never
 * matched stays unfindable by that word until it is re-saved. That is an omission, not a false
 * claim — the recipe is missing from one search, not wrongly present in a filter that promises
 * something.
 */
export const backfillRecipeSearch = migrations.define({
  table: "recipes",
  migrateOne: async (ctx, recipe) => {
    const links = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id))
      .collect();

    const search = await recipeSearchText(ctx, {
      ingredientIds: links.map((link) => link.ingredientId),
      // Unrecoverable — see the note above. The matched names arrive through the links.
      names: [],
    });

    return { search, ...facetsOf(recipe.tags) };
  },
});

/**
 * Gives every existing recipe a stable random ordering key for the planning candidate window.
 * The field is optional in the schema until this online migration has completed everywhere.
 */
export const backfillRecipeShuffleKey = migrations.define({
  table: "recipes",
  migrateOne: async (_ctx, recipe) => {
    if (recipe.shuffleKey === undefined) {
      return { shuffleKey: randomShuffleKey() };
    }
  },
});

/**
 * Gives every existing recipe a review status and an archive flag: `generated` and live.
 *
 * `generated` for every row, the cook's own included, because nothing before this recorded a
 * review, and a status that claimed one would be the only false thing in the row. Every recipe that
 * exists was live, since deleting one did not exist either.
 *
 * Both fields are optional in the schema until this has run on every deployment; the deploy that
 * makes them required, and switches the list reads to `eq("isArchived", false)`, must come after.
 * Idempotent: a row that already carries both is not written.
 */
export const backfillRecipeStatus = migrations.define({
  table: "recipes",
  migrateOne: (_ctx, recipe) => {
    if (recipe.status === undefined || recipe.isArchived === undefined) {
      return { status: recipe.status ?? "generated", isArchived: recipe.isArchived ?? false };
    }
  },
});

/**
 * Rewrites the two French spoon codes onto their English equivalents: `cs` → `tbsp`, `cc` → `tsp`.
 *
 * **Run this BEFORE the deploy that narrows `UNITS`.** Convex validates the schema against the
 * documents already in each table, so `vUnit` losing the `cs` literal while a row still holds one
 * fails the deploy outright. Widen the union, run this, then narrow — the order is the whole point
 * of the migration existing, since a tablespoon is a tablespoon and no value changes.
 *
 * Six tables rather than the two that hold a spoon today (`recipeIngredients` and
 * `plannedMealIngredients`, 56 rows between them on dev). The other four were counted and held
 * none — the catalog writes `g` and `ml` from lookup data, and spoons only enter through a recipe
 * somebody saved — but a migration's job is to be safe on a deployment nobody has counted, and a
 * `define()` over a table with nothing to change costs one pass and returns nothing.
 *
 * Idempotent, because it will be run more than once: a row already on the new code returns
 * `undefined` and is not written. Kept after it has run for the reason `backfillRecipeSearch`
 * gives above — deleting a migration that has run somewhere and not everywhere is how the two
 * diverge, and `plannedMealIngredients` moves two fields, which is not a rule anyone reconstructs.
 */
const SPOONS = { cs: "tbsp", cc: "tsp" } as const;

type Spoon = keyof typeof SPOONS;

const renamed = (unit: string): "tbsp" | "tsp" | undefined => SPOONS[unit as Spoon];

export const renameSpoonUnitsInRecipeIngredients = migrations.define({
  table: "recipeIngredients",
  migrateOne: (_ctx, row) => {
    const unit = renamed(row.unit);
    if (unit) return { unit };
  },
});

/** The only table carrying two of them: what the recipe asked for, and what the plate needs. */
export const renameSpoonUnitsInPlannedMealIngredients = migrations.define({
  table: "plannedMealIngredients",
  migrateOne: (_ctx, row) => {
    const unit = renamed(row.unit);
    const sourceUnit = renamed(row.sourceUnit);
    if (unit || sourceUnit) return { ...(unit && { unit }), ...(sourceUnit && { sourceUnit }) };
  },
});

export const renameSpoonUnitsInIngredients = migrations.define({
  table: "ingredients",
  migrateOne: (_ctx, row) => {
    const defaultUnit = renamed(row.defaultUnit);
    if (defaultUnit) return { defaultUnit };
  },
});

export const renameSpoonUnitsInGroceryListItems = migrations.define({
  table: "groceryListItems",
  migrateOne: (_ctx, row) => {
    const unit = renamed(row.unit);
    if (unit) return { unit };
  },
});

export const renameSpoonUnitsInCellarItems = migrations.define({
  table: "cellarItems",
  migrateOne: (_ctx, row) => {
    const unit = renamed(row.unit);
    if (unit) return { unit };
  },
});

export const renameSpoonUnitsInRecentlyUsedIngredients = migrations.define({
  table: "recentlyUsedIngredients",
  migrateOne: (_ctx, row) => {
    const unit = renamed(row.unit);
    if (unit) return { unit };
  },
});

/**
 * Books the skip job for every plate planned before `commitPlan` started booking one.
 *
 * A plate is closed by the clock a day after its day (`skipMeal`), and the job doing it is
 * scheduled when the plate is written. Plates written before that have no job, so a plate from
 * a week ago stays `planned` and keeps its groceries on the list forever — the bug this lands
 * with. One job per plate still `planned`, whatever its date: a time already past fires at once,
 * a future one waits like the ones `commitPlan` books.
 *
 * Patches nothing, so it is safe to re-run: the cost is one extra job per plate, and the job
 * checks the plate's status before it writes.
 */
export const scheduleSkips = migrations.define({
  table: "plannedMeals",
  migrateOne: async (ctx, plate) => {
    if (plate.status !== "planned") return;

    await ctx.scheduler.runAt(skipAt(plate.date), internal.router.planning.skipOne._internal, { mealId: plate._id });
  },
});

export const runBackfillRecipeSearch = migrations.runner([internal.migrations.backfillRecipeSearch]);

export const runBackfillRecipeShuffleKey = migrations.runner([
  internal.migrations.backfillRecipeShuffleKey,
]);

export const runBackfillRecipeStatus = migrations.runner([internal.migrations.backfillRecipeStatus]);

export const runRenameSpoonUnits = migrations.runner([
  internal.migrations.renameSpoonUnitsInRecipeIngredients,
  internal.migrations.renameSpoonUnitsInPlannedMealIngredients,
  internal.migrations.renameSpoonUnitsInIngredients,
  internal.migrations.renameSpoonUnitsInGroceryListItems,
  internal.migrations.renameSpoonUnitsInCellarItems,
  internal.migrations.renameSpoonUnitsInRecentlyUsedIngredients,
]);

export const runScheduleSkips = migrations.runner([internal.migrations.scheduleSkips]);
