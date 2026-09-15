import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Unit } from "@shared/ingredients";
import { MEAL_SLOTS, type MealSlot } from "@shared/mealSlots";

import { availableStock } from "./availableStock";
import { cellarLots } from "./cellarLots";
import { isDistinct, isServings, MAX_DAYS } from "./limits";
import { recipeLines, type ResolvedLine } from "./recipeLines";
import { scaleLines } from "./scaleLines";
import { ownedTickKey, syncMealLines, type MealLine } from "./syncMealLines";

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
  plates: CommittedPlate[];
  /** How many the run was planned for. Stored on the plan; a plate carries its own `servings`. */
  people: number;
  /**
   * The shuffle seed the draft was generated from, kept so a later reroll can reproduce this week.
   * Absent for a plate planned from a recipe screen, which no shuffle drew — see `mealPlans`.
   */
  seed?: number;
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
    plates.every((plate) => isServings(plate.servings)) &&
    isServings(people) &&
    (seed === undefined || (seed >= 0 && seed < 1))
  );
};

/**
 * The recipes the plates name, each read once however many plates repeat it.
 *
 * Any recipe that exists may be planned, whoever wrote it: a recipe is readable by any signed-in
 * cook (ADR 0014), and planning one copies nothing of it — the plate holds an id, and its lines
 * are re-read from the recipe at commit time. What a cook is protected against is a stranger
 * *editing* their recipe, and that gate is on the write path, not here.
 */
const _recipesFor = async (ctx: MutationCtx, plates: CommittedPlate[]) => {
  const recipes = new Map<Id<"recipes">, Doc<"recipes">>();

  for (const recipeId of new Set(plates.map((plate) => plate.recipeId))) {
    const recipe = await ctx.db.get(recipeId);

    if (!recipe) throw new ConvexError({ code: "NOT_FOUND", message: "No such recipe." });

    recipes.set(recipeId, recipe);
  }

  return recipes;
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
  const recipes = await _recipesFor(ctx, plates);
  /** Every plate's recipe lines, read once however many plates repeat the dish. */
  const lines = new Map<Id<"recipes">, ResolvedLine[]>();

  for (const recipeId of recipes.keys()) lines.set(recipeId, await recipeLines(ctx, recipeId));

  const [stock, lots] = await Promise.all([
    availableStock(ctx, args.householdId, args.today),
    cellarLots(ctx, args.householdId),
  ]);

  const owned = new Set(args.owned.map((row) => ownedTickKey(row.ingredientId, row.unit)));

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
      owned: owned.has(ownedTickKey(need.ingredientId, need.unit)),
    }));

    await syncMealLines(ctx, { householdId: args.householdId, plannedMealId, lines: mealLines, stock, lots, from: args.today });
  }

  return mealPlanId;
};
