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
 * ⚠️ LIMITATION: this ignores expiry. A meal picked early in the week to use up food that goes off
 * soon can be moved to a later plate, after that food has expired.
 */
export const spreadMeals = (selected: SelectedMeal[], stock: Stock): SelectedMeal[] => {
  const [first, ...remaining] = selected;
  if (!first) return [];

  const purchases = new Map(selected.map((meal) => [meal, _purchasesOf(meal)]));
  const order = [first];

  while (remaining.length > 0) {
    const before = order[order.length - 1]!;
    const cost = (meal: SelectedMeal) => _closeness(meal, before, purchases);
    const next = remaining.reduce((best, meal) => (cost(meal) < cost(best) ? meal : best));
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
