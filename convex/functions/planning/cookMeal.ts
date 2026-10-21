import { ConvexError } from "convex/values";

import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/procedures";
import type { Clock } from "@shared/clock";
import { MEAL_SLOTS, SLOT_HOURS, SLOT_REACH_HOURS, type MealSlot } from "@shared/mealSlots";
import { isServings } from "@shared/servings";

import { consumeFromCellar, type Consumed } from "../cellars/consumeFromCellar";
import { recipeLines } from "./recipeLines";
import { scaleLines } from "./scaleLines";
import type { Need } from "./selectMeals";
import { laterPlates, type LineIngredient, releaseClaim } from "./syncMealLines";

/** A plate as `nearestPlate` needs to see it: where it sits in the week and whether it is still ahead. */
export type PlateCandidate = Pick<Doc<"plannedMeals">, "_id" | "date" | "slot" | "status">;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The slot the clock says is in progress today, or `undefined` before lunch has started.
 *
 * The thresholds are `SLOT_HOURS`, read as the start of each slot: a slot is current from its hour
 * until the next one's. Walked from the last slot back so the latest started wins. Also read for
 * the cook nobody planned, which has to be written on some slot and takes the one in progress.
 */
const _currentSlot = (hour: number): MealSlot | undefined =>
  [...MEAL_SLOTS].reverse().find((slot) => hour >= SLOT_HOURS[slot]);

/** Signed hours from now to a plate's nominal moment — negative for a plate already behind the cook. */
const _hoursAway = (plate: PlateCandidate, clock: Clock): number =>
  Math.round((plate.date - clock.today) / DAY_MS) * 24 + SLOT_HOURS[plate.slot] - clock.hour;

/**
 * The plate this cook settles, or `undefined` when none is close enough to be it.
 *
 * Two rules, in order. A plate on today's current slot is the one being cooked, whatever else the
 * week holds: pizza planned for lunch and for dinner, cooked at 16h, is lunch — people eat lunch
 * late, and the dinner plate is still ahead of them. Failing that, the nearest plate in time wins,
 * provided it is within `SLOT_REACH_HOURS` of now: a dinner cooked at one in the morning is last
 * night's dinner, a lunch cooked at 8 is today's. Ties go to the earlier plate, which is the one the
 * household has been waiting on longest.
 *
 * Only `planned` plates are candidates. A cooked plate has been settled; settling it again would
 * spend the cellar twice.
 */
export const nearestPlate = (candidates: PlateCandidate[], clock: Clock): PlateCandidate | undefined => {
  const planned = candidates.filter((plate) => plate.status === "planned");
  const current = _currentSlot(clock.hour);

  const onCurrentSlot = planned.find((plate) => plate.date === clock.today && plate.slot === current);
  if (onCurrentSlot) return onCurrentSlot;

  return planned
    .map((plate) => ({ plate, away: _hoursAway(plate, clock) }))
    .filter(({ away }) => Math.abs(away) <= SLOT_REACH_HOURS)
    .sort((a, b) => Math.abs(a.away) - Math.abs(b.away) || a.away - b.away)[0]?.plate;
};

type Args = Clock & {
  householdId: Id<"households">;
  recipeId: Id<"recipes">;
  /** How many the dish was cooked for — the stepper's number, not the plate's, which may differ. */
  servings: number;
};

/**
 * The plate the dish was cooked on, its week, and whether the plan had promised it (false: recorded
 * on today). `recipe` is the row it read to scale the lines, handed on for the router's report.
 */
export type CookedMeal = {
  mealId: Id<"plannedMeals">;
  mealPlanId: Id<"mealPlans">;
  fromPlate: boolean;
  recipe: Doc<"recipes">;
};

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
    await releaseClaim(ctx, row, plates);

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
const _recordUnplanned = async (
  ctx: MutationCtx,
  args: Args,
  needs: Need[],
  consumed: Consumed[],
): Promise<Pick<CookedMeal, "mealId" | "mealPlanId">> => {
  const slot = _currentSlot(args.hour) ?? "lunch";

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

  return { mealId: plannedMealId, mealPlanId };
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
export const cookMeal = async (ctx: MutationCtx, args: Args): Promise<CookedMeal> => {
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

  if (!plate) return { ...(await _recordUnplanned(ctx, args, needs, consumed)), fromPlate: false, recipe };

  await _settleLedger(ctx, plate, ledger, consumed, args.today);
  await ctx.db.patch(plate._id, { status: "cooked", servings: args.servings, updatedAt: Date.now() });

  return { mealId: plate._id, mealPlanId: plate.mealPlanId, fromPlate: true, recipe };
};
