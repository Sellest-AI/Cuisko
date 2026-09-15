import type { Id } from "@convex/_generated/dataModel";
import type { Unit } from "@shared/ingredients";
import type { MealSlot } from "@shared/mealSlots";

/**
 * One recipe line, scaled to the plate it will be cooked for — `scaleLines` writes these.
 *
 * `quantity` / `unit` are the recipe's own words at that scale ("2 pcs"), which is what the meal
 * screen prints and what the ledger keeps as `sourceQuantity`. `amount` is the same quantity in the
 * ingredient's stock unit (`stockUnitOf`), and is what stock is compared in.
 *
 * Three kinds, because each follows a different rule all the way down to the grocery list:
 *
 * - **`pinch`** never asks how much. It is covered when the cellar holds the ingredient at all, and
 *   it takes nothing from stock.
 * - **`measured`** is compared against stock in the stock unit, and takes what it uses.
 * - **`unmeasured`** is written in a unit its ingredient cannot convert to its stock unit — grams
 *   of an ingredient bought by the piece, with no piece weight. It is never covered, and takes
 *   nothing, since there is no number to take.
 */
export type Need = {
  ingredientId: Id<"ingredients">;
  quantity: number;
  unit: Unit;
} & ({ kind: "pinch" } | { kind: "measured"; amount: number } | { kind: "unmeasured" });

/** A recipe the week may draw on, its lines already scaled to the plates' servings. */
export type Candidate = {
  recipeId: Id<"recipes">;
  needs: Need[];
  /** Written by the caller rather than taken from the catalog — the side the own-share cap limits. */
  isMine: boolean;
};

/**
 * What is available per ingredient, in that ingredient's stock unit, after future reservations —
 * `availableStock` builds it. Grams of flour, millilitres of milk, pieces of carrot: one unit per
 * ingredient, so every row of it adds up and every line compares.
 *
 * **A key is presence, its value is the amount**, and a pinch reads only the first. A cellar row
 * that cannot reach the stock unit still makes the ingredient present, at 0: enough for a pinch,
 * and nothing for a measured line, which then buys the whole amount rather than trusting a guess.
 */
export type Stock = Map<Id<"ingredients">, number>;

export type Plate = { date: number; slot: MealSlot; servings: number };

export type SelectedMeal = { plate: Plate; candidate: Candidate; covered: Need[]; missing: Need[] };

type Options = {
  /** The most of the week, as a fraction of its plates, that may come from the caller's own recipes. */
  ownShare: number;
};

type Coverage = { covered: Need[]; missing: Need[]; partial: number; taken: Map<Id<"ingredients">, number> };

/**
 * What a candidate would cover against `stock`, and the amounts it would take doing it.
 *
 * Consumption is tracked across the candidate's own lines, so a recipe naming butter twice is
 * scored against the butter the first line left. A partially covered line is `missing` — the
 * remainder is bought — but it still takes what the cellar had, because that part gets cooked.
 */
export const coverageOf = (candidate: Candidate, stock: Stock): Coverage => {
  const taken = new Map<Id<"ingredients">, number>();
  const covered: Need[] = [];
  const missing: Need[] = [];
  let partial = 0;

  for (const need of candidate.needs) {
    switch (need.kind) {
      case "pinch":
        (stock.has(need.ingredientId) ? covered : missing).push(need);
        break;

      case "unmeasured":
        missing.push(need);
        break;

      case "measured": {
        const left = (stock.get(need.ingredientId) ?? 0) - (taken.get(need.ingredientId) ?? 0);
        const used = Math.max(0, Math.min(left, need.amount));
        taken.set(need.ingredientId, (taken.get(need.ingredientId) ?? 0) + used);

        if (used >= need.amount) covered.push(need);
        else {
          missing.push(need);
          if (used > 0) partial += 1;
        }
        break;
      }

      default:
        need satisfies never;
    }
  }

  return { covered, missing, partial, taken };
};

/**
 * The candidates a plate may be drawn from: unpicked recipes within the own-share cap, or, when
 * that leaves nothing, unpicked recipes with the cap lifted. The cap is a ceiling, and a short
 * catalog must not leave a plate empty.
 */
const _eligible = (candidates: Candidate[], picked: Set<Id<"recipes">>, capReached: boolean) => {
  const unpicked = candidates.filter((candidate) => !picked.has(candidate.recipeId));
  const withinCap = unpicked.filter((candidate) => !(capReached && candidate.isMine));

  return withinCap.length > 0 ? withinCap : unpicked;
};

/**
 * The week: one recipe per plate, chosen greedily to use what the household already owns.
 *
 * **One plate at a time, and the order is the feature.** Each plate is scored against the stock
 * the plates before it left behind, so two meals are never both credited with the same onion.
 *
 * Score is the share of lines fully covered, tie-broken on the share partially covered, then on
 * the order `candidates` arrived in — which the caller has already shuffled, so the last tie-break
 * is random without this function rolling anything.
 *
 * **Pinches are not lines, for scoring.** Salt, pepper and a spoon of oil are in almost every
 * cellar, so counting them would rank a recipe well on its staples while its chicken is bought.
 * They are still reported as covered or missing — they just do not move the ranking.
 *
 * Pure, and it copies `stock` rather than consuming it. An empty pool yields no plates, not a throw:
 * a week that cannot be drawn is the caller's to explain.
 */
export const selectMeals = (
  candidates: Candidate[],
  stock: Stock,
  plates: Plate[],
  { ownShare }: Options,
): SelectedMeal[] => {
  if (candidates.length === 0) return [];

  const left: Stock = new Map(stock);
  const ownCap = Math.floor(ownShare * plates.length);
  const picked = new Set<Id<"recipes">>();
  let ownPicked = 0;

  return plates.map((plate) => {
    // Every recipe has been used: the pool is genuinely exhausted, and repeats begin.
    if (picked.size === candidates.length) picked.clear();

    let best: { candidate: Candidate; coverage: Coverage; score: number; tie: number } | undefined;

    for (const candidate of _eligible(candidates, picked, ownPicked >= ownCap)) {
      const coverage = coverageOf(candidate, left);
      const lines = candidate.needs.filter((need) => need.kind !== "pinch").length || 1;
      const score = coverage.covered.filter((need) => need.kind !== "pinch").length / lines;
      const tie = coverage.partial / lines;

      // Strictly greater, so an equal score keeps the earlier candidate — the shuffled order.
      if (!best || score > best.score || (score === best.score && tie > best.tie)) {
        best = { candidate, coverage, score, tie };
      }
    }

    // `_eligible` never returns an empty pool while `candidates` is non-empty.
    const { candidate, coverage } = best!;

    picked.add(candidate.recipeId);
    if (candidate.isMine) ownPicked += 1;
    for (const [ingredientId, amount] of coverage.taken) {
      left.set(ingredientId, (left.get(ingredientId) ?? 0) - amount);
    }

    return { plate, candidate, covered: coverage.covered, missing: coverage.missing };
  });
};
