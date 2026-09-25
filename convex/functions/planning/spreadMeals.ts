import type { Id } from "@convex/_generated/dataModel";

import { coverageOf, scoredNeeds, spend, UNCOUNTED_CUISINES, type SelectedMeal, type Stock } from "./selectMeals";

/** What a shared cuisine counts for, against `1` per shared purchase. */
const CUISINE_CLOSENESS = 1;

const _purchasesOf = (meal: SelectedMeal) =>
  new Set<Id<"ingredients">>(scoredNeeds(meal.candidate.needs).map((need) => need.ingredientId));

/** How alike two meals are to eat: the purchases they share, plus their cuisine if it names one. */
const _closeness = (a: SelectedMeal, b: SelectedMeal, purchases: Map<SelectedMeal, Set<Id<"ingredients">>>) => {
  const theirs = purchases.get(b)!;
  const shared = [...purchases.get(a)!].filter((ingredientId) => theirs.has(ingredientId)).length;
  const sameCuisine = a.candidate.cuisine === b.candidate.cuisine && !UNCOUNTED_CUISINES.has(a.candidate.cuisine);

  return shared + (sameCuisine ? CUISINE_CLOSENESS : 0);
};

/**
 * The last plate index a meal may be served on: the last plate dated on or before the soonest
 * expiry among the stock its measured lines cover, and never before the plate it was drawn for.
 */
const _latestPlateOf = (
  meal: SelectedMeal,
  drawnAt: number,
  selected: SelectedMeal[],
  expiries: Map<Id<"ingredients">, number> | undefined,
) => {
  const deadline = Math.min(...scoredNeeds(meal.covered).map((need) => expiries?.get(need.ingredientId) ?? Infinity));
  // Plates arrive in calendar order, so the ones in time are a prefix.
  const inTime = selected.filter((other) => other.plate.date <= deadline).length;

  return Math.max(drawnAt, inTime - 1);
};

/**
 * Whether `meals` can fill the plates from `position` on without serving any after its latest one:
 * earliest deadline first, which succeeds whenever any order does.
 */
const _meetsDeadlines = (meals: SelectedMeal[], position: number, latest: Map<SelectedMeal, number>) =>
  meals
    .map((meal) => latest.get(meal)!)
    .sort((a, b) => a - b)
    .every((last, offset) => last >= position + offset);

/**
 * The week `selectMeals` drew, with its meals moved between plates so that neighbours are unalike.
 *
 * `selectMeals` draws a chain — each plate picked for sharing what the plates before it buy — and
 * draws it in calendar order, so the chain landed on consecutive plates: three gratins in a row,
 * each a different recipe, all sharing the cream and the cheese. The chain is what keeps the list
 * short, so the recipes stay; only where they sit changes. The grocery list is the same week.
 *
 * Greedy and deterministic: the first plate keeps its meal, and each next plate takes the remaining
 * meal least like the one just before it, ties going to draw order. No roll: the draft is a query
 * that re-runs, and a given seed must keep returning the same week.
 *
 * **One plate back, not two.** It never drops a meal: when alike ones cannot all be kept apart, two
 * end up side by side. Weighing the plate before last as well makes that happen more often, not
 * less: in G G G R S it spends the risotto and the salad early (G R S) and leaves G G for the end,
 * where one plate back gives G R G S G.
 *
 * **Coverage is recomputed in the new order**, against the same stock, because `commitPlan` weighs
 * the cellar in the order the week is eaten: a meal moved ahead of the one that drew on the last of
 * the butter now owns that butter, and the draft has to say what the commit will do. Alternatives
 * travel with their meal: they were ranked for it, not for the plate.
 *
 * **Expiry is a deadline, not a preference.** `selectMeals` draws urgent stock onto the early
 * plates, and the spread never makes it later than the draw did. A meal covering a line whose stock
 * goes off (`expiries`) may go as late as the last plate on or before that day, or the plate it was
 * drawn for, whichever is later. Three meals using spinach that goes off Monday cannot all be served
 * Monday: the draw puts them Monday, Tuesday and Wednesday, and the spread keeps each of them no
 * later than that, since moving a meal that is already late makes it later still. Among
 * the meals the deadlines allow, the least alike still wins — unless taking it would leave the
 * plates after it unable to meet the deadlines left (`_meetsDeadlines`), in which case two alike
 * meals sit side by side: food eaten beats food binned. The draw order meets every deadline, so a
 * meal that keeps them all always exists.
 *
 * @limitation Deadlines come from the coverage the draw computed, not the one recomputed in the new
 * order. A meal moved ahead of the one that drew the expiring stock takes that stock, and the
 * deadline stays on the meal that no longer eats it. The stock is still eaten in time, since the
 * first meal to reach it in the new order sits no later than the deadline holder, but that holder
 * is bound for nothing and the spread moves it less than it could. Deriving deadlines from the new
 * order would need them recomputed at each step.
 */
export const spreadMeals = (
  selected: SelectedMeal[],
  stock: Stock,
  expiries?: Map<Id<"ingredients">, number>,
): SelectedMeal[] => {
  const [first, ...remaining] = selected;
  if (!first) return [];

  const purchases = new Map(selected.map((meal) => [meal, _purchasesOf(meal)]));
  const latest = new Map(selected.map((meal, index) => [meal, _latestPlateOf(meal, index, selected, expiries)]));
  const order = [first];

  while (remaining.length > 0) {
    const before = order[order.length - 1]!;
    const position = order.length;
    const cost = (meal: SelectedMeal) => _closeness(meal, before, purchases);
    // Stable, so equal closeness keeps draw order.
    const next = [...remaining]
      .sort((a, b) => cost(a) - cost(b))
      .find((meal) => _meetsDeadlines(remaining.filter((other) => other !== meal), position + 1, latest))!;
    order.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }

  const left: Stock = new Map(stock);

  return order.map((meal, index) => {
    const { covered, missing, taken } = coverageOf(meal.candidate, left);
    spend(left, taken);

    return { ...meal, plate: selected[index]!.plate, covered, missing };
  });
};
