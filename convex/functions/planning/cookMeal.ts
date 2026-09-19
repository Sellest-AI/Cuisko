import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Clock } from "@shared/clock";
import { isServings } from "@shared/servings";

import { consumeFromCellar, type Consumed } from "../cellars/consumeFromCellar";
import { currentSlot, nearestPlate } from "./nearestPlate";
import { recipeLines } from "./recipeLines";
import { scaleLines } from "./scaleLines";
import type { Need } from "./selectMeals";
import { backOut, heirOf, laterPlates, type LineIngredient } from "./syncMealLines";

type Args = Clock & {
  householdId: Id<"households">;
  recipeId: Id<"recipes">;
  /** How many the dish was cooked for — the stepper's number, not the plate's, which may differ. */
  servings: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Settles a planned plate's claims on the grocery list, and detaches its ledger from both rows.
 *
 * The cook had every ingredient — the dish is on the table — so whatever the plate was still
 * shopping for was bought outside the list, and the list stops asking: each row's contribution is
 * taken back exactly as `syncMealLines` takes it back when a plate is dropped, a jar handed on to
 * the next plate living off it. The pointers go with it: the list row may be gone, the lot has been
 * spent, and `removeFromCellar` reads a claim that names a lot and no list row as a purchase it may
 * still undo — which a cooked plate must never be. The quantities stay, rewritten to what was
 * actually taken; they are now the record of what was eaten, and the last one left once the cellar
 * and list rows are gone.
 */
const _settleLedger = async (
  ctx: MutationCtx,
  plate: Doc<"plannedMeals">,
  ledger: Doc<"plannedMealIngredients">[],
  consumed: Consumed[],
  today: number,
) => {
  let later: Promise<Doc<"plannedMeals">[]> | undefined;
  const plates = () => (later ??= laterPlates(ctx, plate.householdId, plate._id, today));

  // Each row takes the first take of its ingredient, so a recipe naming one twice settles row by row.
  const takes = [...consumed];

  for (const row of ledger) {
    const heir = await heirOf(ctx, row, plates);

    if (heir) {
      await ctx.db.patch(heir._id, { groceryQuantity: row.groceryQuantity, groceryListItemId: row.groceryListItemId, updatedAt: Date.now() });
    } else {
      await backOut(ctx, row);
    }

    const at = takes.findIndex((take) => take.ingredientId === row.ingredientId);
    const [take] = at === -1 ? [] : takes.splice(at, 1);

    await ctx.db.patch(row._id, {
      ...(take ? { quantity: take.quantity, unit: take.unit } : {}),
      groceryListItemId: undefined,
      cellarItemId: undefined,
      updatedAt: Date.now(),
    });
  }
};

/**
 * Records a dish nobody planned as a cooked plate on today, so the week remembers what was eaten.
 *
 * Its own plan rather than a plate in the one the tunnel drew: that plan describes what the agent
 * proposed and the household agreed to, and a dish cooked on a whim is not part of that story. The
 * shape is `planMeal`'s — one plate, no seed, `people` the servings — so every reader of the week
 * takes it without a special case. Its ledger holds what was taken and nothing about the list,
 * because nothing was ever shopped for.
 */
const _recordUnplanned = async (ctx: MutationCtx, args: Args, needs: Need[], consumed: Consumed[]) => {
  const slot = currentSlot(args.hour) ?? "lunch";

  const mealPlanId = await ctx.db.insert("mealPlans", {
    householdId: args.householdId,
    startDate: args.today,
    days: 1,
    slots: [slot],
    people: args.servings,
    updatedAt: Date.now(),
  });

  const plannedMealId = await ctx.db.insert("plannedMeals", {
    mealPlanId,
    householdId: args.householdId,
    recipeId: args.recipeId,
    date: args.today,
    slot,
    servings: args.servings,
    status: "cooked",
    updatedAt: Date.now(),
  });

  for (const [index, need] of needs.entries()) {
    const take = consumed[index]!;

    await ctx.db.insert("plannedMealIngredients", {
      plannedMealId,
      ingredientId: need.ingredientId,
      sourceQuantity: need.quantity,
      sourceUnit: need.unit,
      quantity: take.quantity,
      unit: take.unit,
      updatedAt: Date.now(),
    });
  }

  return plannedMealId;
};

/**
 * What finishing the step-by-step flow means: the recipe's ingredients leave the cellar, and the
 * plate it was cooked for is settled — or written, when there was none.
 *
 * Which plate is the clock's to say, not the screen's: the screen cannot know whether it was opened
 * from a plate or from the library, and the same recipe may sit on several. `nearestPlate` reads
 * the answer from today's slot in progress, then from distance; a plate beyond its reach is not
 * this cook, and the dish is recorded as unplanned instead. Candidates start yesterday so a dinner
 * finished after midnight still finds its plate.
 *
 * The cellar is spent at the servings actually cooked, from the lots the plate reserved first, and
 * the plate's `servings` follows: what was eaten is what the record says.
 */
export const cookMeal = async (ctx: MutationCtx, args: Args): Promise<Id<"plannedMeals">> => {
  // The stepper is clamped to the same rule, so this refuses only a client that is not ours.
  if (!isServings(args.servings)) throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid servings." });

  const recipe = await ctx.db.get(args.recipeId);
  if (!recipe) throw new ConvexError({ code: "NOT_FOUND", message: "The recipe is gone." });

  const rows = await recipeLines(ctx, args.recipeId);
  const needs = scaleLines(rows.map((row) => row.line), { recipeServings: recipe.servings, servings: args.servings });
  const ingredients = new Map<Id<"ingredients">, LineIngredient>(rows.map((row) => [row.ingredient._id, row.ingredient]));
  const lines = needs.map((need) => ({ need, ingredient: ingredients.get(need.ingredientId)! }));

  const candidates = await ctx.db
    .query("plannedMeals")
    .withIndex("by_household_and_date", (q) => q.eq("householdId", args.householdId).gte("date", args.today - DAY_MS))
    .collect();
  const nearest = nearestPlate(candidates.filter((candidate) => candidate.recipeId === args.recipeId), args);
  const plate = candidates.find((candidate) => candidate._id === nearest?._id);

  const ledger = plate
    ? await ctx.db.query("plannedMealIngredients").withIndex("by_planned_meal", (q) => q.eq("plannedMealId", plate._id)).collect()
    : [];
  const lots = new Map(ledger.flatMap((row) => (row.cellarItemId ? [[row.ingredientId, row.cellarItemId] as const] : [])));

  const consumed = await consumeFromCellar(ctx, { householdId: args.householdId, lines, lots });

  if (!plate) return _recordUnplanned(ctx, args, needs, consumed);

  await _settleLedger(ctx, plate, ledger, consumed, args.today);
  await ctx.db.patch(plate._id, { status: "cooked", servings: args.servings, updatedAt: Date.now() });

  return plate._id;
};
