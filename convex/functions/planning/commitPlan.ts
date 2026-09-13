import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Unit } from "@shared/ingredients";
import { MEAL_SLOTS, type MealSlot } from "@shared/mealSlots";

import { availableStock } from "./availableStock";
import { isDistinct, MAX_DAYS, MAX_SERVINGS } from "./limits";
import { scaleLines, type ScalableLine } from "./scaleLines";
import { syncMealLines, type MealLine } from "./syncMealLines";

/** One plate the user is keeping: which dish, which day, which meal of it, and for how many. */
export type CommittedPlate = {
  recipeId: Id<"recipes">;
  /** Local-day timestamp, the client's — "Tuesday" has to mean its Tuesday. */
  date: number;
  slot: MealSlot;
  servings: number;
};

type Args = {
  householdId: Id<"households">;
  userId: Id<"users">;
  plates: CommittedPlate[];
  /** How many the run was planned for. Stored on the plan; a plate carries its own `servings`. */
  people: number;
  /** The shuffle seed the draft was generated from, kept so a later reroll can reproduce this week. */
  seed: number;
  note?: string;
  /** Local-day timestamp of today: only meals from here on hold stock — see `availableStock`. */
  today: number;
  /**
   * Ingredient and unit pairs the shopper ticked as already in the kitchen, in the recipe's own unit.
   *
   * Their answer over the cellar's, and it only ever suppresses a grocery write: the line is still
   * cooked, so it still reserves what it reserves.
   */
  owned: { ingredientId: Id<"ingredients">; unit: Unit }[];
};

const _key = (ingredientId: Id<"ingredients">, unit: Unit) => `${ingredientId}:${unit}`;

/**
 * Everything the client decides, bounded where it cannot be bypassed.
 *
 * A plate is refused rather than deduplicated when another already holds its day and slot: two
 * plates the week cannot tell apart is not a week. `servings` must be a whole number, which also
 * refuses `NaN` — it fails no comparison and would scale every line of that plate to `NaN`.
 */
const _isValidRequest = ({ plates, people, seed }: Args) => {
  const days = new Set(plates.map((plate) => plate.date));

  return (
    plates.length > 0 &&
    days.size <= MAX_DAYS &&
    isDistinct(plates.map((plate) => `${plate.date}:${plate.slot}`)) &&
    plates.every(
      (plate) => Number.isInteger(plate.servings) && plate.servings >= 1 && plate.servings <= MAX_SERVINGS,
    ) &&
    Number.isInteger(people) &&
    people >= 1 &&
    people <= MAX_SERVINGS &&
    seed >= 0 &&
    seed < 1
  );
};

/**
 * The recipes the plates name, refusing any the caller is not entitled to plan.
 *
 * The catalog (`userId` unset) and the caller's own, and nothing else: the ids arrive from the
 * client, and without this check a crafted `commit` would copy another household's private recipe
 * into a week — ingredient lines and all — which is the boundary `candidatePool` keeps by never
 * relaxing the first field of its index.
 */
const _recipesFor = async (ctx: MutationCtx, plates: CommittedPlate[], userId: Id<"users">) => {
  const recipes = new Map<Id<"recipes">, Doc<"recipes">>();

  for (const recipeId of new Set(plates.map((plate) => plate.recipeId))) {
    const recipe = await ctx.db.get(recipeId);

    if (!recipe) throw new ConvexError({ code: "NOT_FOUND", message: "No such recipe." });
    if (recipe.userId !== undefined && recipe.userId !== userId) throw new ConvexError({ code: "FORBIDDEN" });

    recipes.set(recipeId, recipe);
  }

  return recipes;
};

/** A recipe's line, with the catalog row `scaleLines` and `syncMealLines` both need behind it. */
type ResolvedLine = { line: ScalableLine; ingredient: Doc<"ingredients"> };

/** Every recipe's lines, read once each however many plates repeat the dish. */
const _linesFor = async (ctx: MutationCtx, recipeIds: Id<"recipes">[]) => {
  const lines = new Map<Id<"recipes">, ResolvedLine[]>();

  for (const recipeId of recipeIds) {
    const rows = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
      .collect();

    const resolved = await Promise.all(
      rows.map(async (row): Promise<ResolvedLine | null> => {
        const ingredient = await ctx.db.get(row.ingredientId);

        // A line whose ingredient is gone can neither be scaled nor shopped for, so it is dropped
        // rather than failing the commit: the rest of the week is still the week the user agreed to.
        if (!ingredient) return null;

        return {
          line: { ingredientId: row.ingredientId, quantity: row.quantity, unit: row.unit, ingredient },
          ingredient,
        };
      }),
    );

    lines.set(recipeId, resolved.filter((row): row is ResolvedLine => row !== null));
  }

  return lines;
};

/**
 * The lot each ingredient is reserved against: the first row the household holds of it.
 *
 * ⚠️ **One lot per line, for V1.** A requirement large enough to draw on two lots records only this
 * one, and the remainder is bought. It is a hint rather than an authority — cooking finds the row by
 * ingredient — and it exists so that preferring what expires soonest becomes a scoring change rather
 * than a migration.
 */
const _lotsOf = async (ctx: MutationCtx, householdId: Id<"households">) => {
  const cellar = await ctx.db
    .query("cellarItems")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();

  const lots = new Map<Id<"ingredients">, Id<"cellarItems">>();

  for (const item of cellar) {
    if (item.quantity > 0 && !lots.has(item.ingredientId)) lots.set(item.ingredientId, item._id);
  }

  return lots;
};

/** The order a week is eaten, which is the order its stock is spoken for in. */
const _inOrder = (plates: CommittedPlate[]) =>
  [...plates].sort((a, b) => a.date - b.date || MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot));

/**
 * Writes a week the user has agreed to: the plan, its plates, their ledger, and the shopping they
 * imply.
 *
 * **The quantities are recomputed here, never taken from the client.** What arrives is which dish is
 * cooked when and for how many; every amount comes back out of `recipeIngredients` and is weighed
 * against the cellar as it stands at this moment, which is also the cellar the grocery split is made
 * against. A draft generated a minute ago against a cellar somebody has since emptied therefore
 * commits what is true now rather than what it was shown.
 *
 * **Plates are written in the order the week is eaten**, because the stock the second plate is scored
 * against is what the first one left — the rule that made the draft, applied to the real cellar.
 *
 * The plan's `startDate`, `days` and `slots` are derived from the plates rather than sent, so a week
 * the user dropped meals from in review cannot describe itself as one it is not.
 */
export const commitPlan = async (ctx: MutationCtx, args: Args): Promise<Id<"mealPlans">> => {
  if (!_isValidRequest(args)) throw new ConvexError({ code: "INVALID_INPUT" });

  const plates = _inOrder(args.plates);
  const recipes = await _recipesFor(ctx, plates, args.userId);
  const lines = await _linesFor(ctx, [...recipes.keys()]);
  const [stock, lots] = await Promise.all([
    availableStock(ctx, args.householdId, args.today),
    _lotsOf(ctx, args.householdId),
  ]);

  const owned = new Set(args.owned.map((row) => _key(row.ingredientId, row.unit)));

  const mealPlanId = await ctx.db.insert("mealPlans", {
    householdId: args.householdId,
    startDate: plates[0]!.date,
    days: new Set(plates.map((plate) => plate.date)).size,
    slots: MEAL_SLOTS.filter((slot) => plates.some((plate) => plate.slot === slot)),
    people: args.people,
    seed: args.seed,
    note: args.note,
    updatedAt: Date.now(),
  });

  for (const plate of plates) {
    const recipe = recipes.get(plate.recipeId)!;
    const rows = lines.get(plate.recipeId)!;

    const plannedMealId = await ctx.db.insert("plannedMeals", {
      mealPlanId,
      householdId: args.householdId,
      recipeId: plate.recipeId,
      date: plate.date,
      slot: plate.slot,
      servings: plate.servings,
      status: "planned",
      updatedAt: Date.now(),
    });

    const needs = scaleLines(rows.map((row) => row.line), {
      recipeServings: recipe.servings,
      servings: plate.servings,
    });

    const mealLines: MealLine[] = needs.map((need, index) => ({
      need,
      ingredient: rows[index]!.ingredient,
      owned: owned.has(_key(need.ingredientId, need.unit)),
    }));

    await syncMealLines(ctx, { householdId: args.householdId, plannedMealId, lines: mealLines, stock, lots });
  }

  return mealPlanId;
};
