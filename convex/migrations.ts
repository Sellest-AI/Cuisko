import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";

import { components, internal } from "./_generated/api.js";
import type { DataModel } from "./_generated/dataModel.js";
import { skipAt } from "./functions/planning/skipMeal";
import { moveLegacyRecipeContent } from "./functions/recipes/recipeContent";
import { refreshRecipe } from "./functions/recipes/refreshRecipe";
import { randomShuffleKey } from "./lib/nanoid";
import { internalMutation } from "./procedures";

export const migrations = new Migrations<DataModel>(components.migrations);

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
 * `undefined` and is not written. Kept after it has run because deleting a migration that has run
 * somewhere and not everywhere is how the two diverge, and `plannedMealIngredients` moves two
 * fields, which is not a rule anyone reconstructs.
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

/**
 * Brings every recipe's calculated tags, facets and `search` up to date with its lines and the
 * catalog as they are now — after a re-seed, a catalog row gaining its diet, or `replaceInRecipes`.
 *
 * Not a one-off like the migrations above: it is meant to be run again every time the catalog
 * changes, which is why it is only reached through `runRefreshRecipes`. Idempotent — a recipe
 * already current is not written — and `refreshRecipe` leaves a recipe missing a line untouched.
 */
export const refreshRecipes = migrations.define({
  table: "recipes",
  migrateOne: async (ctx, recipe) => {
    await refreshRecipe(ctx, recipe._id);
  },
});

/**
 * `npx convex run migrations:runRefreshRecipes` — or the same from the dashboard.
 *
 * Always from the first recipe. The component records a finished migration and a plain second
 * run does nothing, so a refresh started without `reset` would report success having refreshed
 * nothing. `dryRun: true` runs one batch and commits nothing, to see what would change.
 *
 * Returns nothing: the batches run after this returns, so any status it could hand back would be
 * the first instant's. Progress is `npx convex run --component migrations lib:getStatus`.
 */
export const runRefreshRecipes = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { dryRun }) => {
    await migrations.runOne(ctx, internal.migrations.refreshRecipes, { reset: true, dryRun });

    return null;
  },
});

/**
 * Moves every recipe's description and instructions off its row into its `recipeContents` row.
 *
 * Run on dev, then on prod once the release carrying `recipeContents` is out:
 * `npx convex run migrations:runMoveRecipeContent`. Until it finishes, `loadRecipeContent` reads a
 * row it has not reached from the row itself, so a recipe never fails to open in between.
 *
 * The deploy that removes the two fields from `recipes` must come after it has finished on prod;
 * Convex refuses that deploy anywhere a row still holds one. Idempotent, and a recipe that already
 * has a content row keeps that row's text: only a write since the deploy creates one, and it is
 * newer (`moveLegacyRecipeContent`).
 *
 * @limitation The backend cannot be rolled back past the deploy that added `recipeContents`. From
 * the first recipe created, edited or translated after it, a `recipes` row lacks the two fields,
 * and Convex refuses to deploy the release before it, which requires them. The door is opened by
 * the deploy, not by this run. **Accepted because** writing the text to both rows instead would
 * double every write and leave this migration nothing to unset until the fields are removed.
 * **Until fixed**, a rollback needs the text copied back from `recipeContents` onto each row first.
 */
export const moveRecipeContent = migrations.define({
  table: "recipes",
  migrateOne: (ctx, recipe) => moveLegacyRecipeContent(ctx, recipe),
});

export const runMoveRecipeContent = migrations.runner([internal.migrations.moveRecipeContent]);

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
