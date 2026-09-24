import type { Id } from "@convex/_generated/dataModel";
import type { Cuisine } from "@shared/cuisines";
import type { RecipeUnit } from "@shared/ingredients";
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
  unit: RecipeUnit;
} & ({ kind: "pinch" } | { kind: "measured"; amount: number } | { kind: "unmeasured" });

/** A recipe the week may draw on, its lines already scaled to the plates' servings. */
export type Candidate = {
  recipeId: Id<"recipes">;
  needs: Need[];
  /** What the week's variety is counted in — see `CUISINE_REPEAT_FACTOR`. */
  cuisine: Cuisine;
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

export type SelectedMeal = {
  plate: Plate;
  candidate: Candidate;
  covered: Need[];
  missing: Need[];
  /** The plate's runners-up, best first, none of them a recipe the week picked — see `selectMeals`. */
  alternatives: Candidate[];
};

/** How many runners-up a plate offers the swap sheet. */
export const ALTERNATIVES_PER_PLATE = 4;

type Options = {
  /** The most of the week, as a fraction of its plates, that may come from the caller's own recipes. */
  ownShare: number;
};

type Coverage = { covered: Need[]; missing: Need[]; partial: number; taken: Map<Id<"ingredients">, number> };

/**
 * What the week is going to buy, and how many plates have already leaned on each purchase.
 *
 * Presence only, like a pinch: the planner knows a recipe's demand ("100 g of feta") but not the
 * shop's supply (a 200 g block), so it cannot say how much of a purchase is spare — only that the
 * ingredient will be in the kitchen. A basket line is never `covered`; it is still bought, it just
 * makes the recipes that share it rank higher, so the block gets finished rather than binned.
 */
type Basket = Map<Id<"ingredients">, number>;

/**
 * How much a line drawn from the basket is worth, against `1` for a line the cellar holds.
 *
 * Below the cellar on purpose: what is owned is free and what is bought is not, so line for line,
 * owned beats bought. Only line for line — both terms are shares of a recipe's own lines, so a
 * one-line recipe in the basket (0.5) still outranks a three-line recipe with one line in the
 * cellar (0.33): fewer new rows on the list is the goal, and that trade is deliberate.
 */
const BASKET_WEIGHT = 0.5;

/**
 * How far into the week one purchase keeps pulling, as a share of its plates: six of a fourteen-plate
 * week, three of a seven. A fixed count read differently at every size — three reuses were most of
 * a dinner-only week and a fifth of a lunch-and-dinner one.
 *
 * The pull fades rather than stops: the first reuse earns the full `BASKET_WEIGHT`, each one after
 * a little less, and the plate at the horizon nothing — see `_reuseCredit`. Past it the ingredient
 * is neutral, so a week that started on tomatoes drifts on rather than converging on seven tomato
 * salads, and it drifts gradually, one fading purchase at a time, rather than every thread at once.
 */
const BASKET_REUSE_SHARE = 0.4;

/** The shortest horizon, so a week of three or four plates still chains at all. */
const MIN_BASKET_REUSES = 2;

/**
 * What each earlier plate of the same cuisine multiplies a candidate's score by.
 *
 * The basket is what makes a week coherent, and left alone it makes it monotonous: tortillas,
 * black beans, avocado and lime reinforce each other, and five of the first six plates came out
 * Mexican. This is the counterweight. It multiplies, so it bends a close call — a second burrito
 * against a curry sharing as much — without overturning a real difference in what is owned; and
 * it compounds, so a third plate of one cuisine has to be clearly better than the alternatives.
 */
const CUISINE_REPEAT_FACTOR = 0.7;

/** Cuisines that name no tradition, so two plates of them are not a repeat. */
export const UNCOUNTED_CUISINES: ReadonlySet<Cuisine> = new Set(["other", "fusion"]);

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

/** Takes from `stock`, in place, what a coverage used. */
export const spend = (stock: Stock, taken: Coverage["taken"]) => {
  for (const [ingredientId, amount] of taken) {
    stock.set(ingredientId, (stock.get(ingredientId) ?? 0) - amount);
  }
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

/** The lines that move the ranking: everything but a pinch — see `selectMeals`. */
export const scoredNeeds = (needs: Need[]) => needs.filter((need) => need.kind !== "pinch");

/** The missing lines the basket already holds and has credit left for. */
const _reused = (missing: Need[], basket: Basket, horizon: number) =>
  scoredNeeds(missing).filter((need) => (basket.get(need.ingredientId) ?? Infinity) < horizon);

/**
 * How much sharing each ingredient says about two recipes belonging together: `1` for one only a
 * single candidate uses, `0` for one every candidate does.
 *
 * Onion and garlic are in most of the pool, so two recipes sharing them share nothing a shopper
 * would notice — while two sharing tortillas are a pair. Weighing a reuse by rarity lets the rare
 * purchases steer the week and the ubiquitous ones fade out, with no list of staples to maintain.
 * Measured on the pool rather than the catalog, which costs no read: the pool is a random sample
 * of what this run may draw, which is the population the rarity has to be relative to.
 */
const _rarityOf = (candidates: Candidate[]) => {
  const using = new Map<Id<"ingredients">, number>();

  for (const candidate of candidates) {
    for (const ingredientId of new Set(scoredNeeds(candidate.needs).map((need) => need.ingredientId))) {
      using.set(ingredientId, (using.get(ingredientId) ?? 0) + 1);
    }
  }

  return new Map([...using].map(([ingredientId, count]) => [ingredientId, 1 - count / candidates.length]));
};

/**
 * What the reused lines are worth together: `BASKET_WEIGHT` per line, scaled by the ingredient's
 * rarity, and faded linearly by how many plates have already reused it — the full weight for the
 * first reuse, nothing at the horizon.
 */
const _reuseCredit = (reused: Need[], basket: Basket, rarity: Map<Id<"ingredients">, number>, horizon: number) =>
  reused.reduce((credit, need) => {
    const fade = 1 - basket.get(need.ingredientId)! / horizon;

    return credit + BASKET_WEIGHT * (rarity.get(need.ingredientId) ?? 0) * fade;
  }, 0);

/**
 * The week: one recipe per plate, chosen greedily to use what the household already owns, then
 * what the plates before it are already going to buy.
 *
 * **One plate at a time, and the order is the feature.** Each plate is scored against the stock
 * the plates before it left behind, so two meals are never both credited with the same onion —
 * and against the basket they filled, so the feta bought for Monday is what Thursday cooks with.
 * The chain is what keeps the grocery list short: a random first plate, then a plate that shares
 * something with it, then one that shares something with those, each pull weighted so the week
 * leans on its purchases without becoming one cuisine. The chain is drawn in plate order but not
 * served in it: `spreadMeals` then moves the meals apart, so the links sit side by side only when nothing else is left.
 *
 * Score is the share of lines fully covered by the cellar, plus the reuse credit of the lines the
 * basket holds (`_reuseCredit`: `BASKET_WEIGHT` each, weighed by rarity, faded by prior reuse),
 * divided by the recipe's lines and multiplied by `CUISINE_REPEAT_FACTOR` once per earlier plate
 * of its cuisine. Ties break on the share partially covered, then on the order `candidates`
 * arrived in — which the caller has already shuffled, so the last tie-break is random without
 * this function rolling anything. Both terms are shares of the recipe's own lines, so a short
 * recipe reusing one of its two purchases outranks a long one reusing two of seven: fewer new
 * rows on the list, which is the goal, without a bias toward short recipes when nothing is shared.
 *
 * **The cuisine penalty cannot lift a score of zero.** A week with an empty cellar and nothing yet
 * bought is pool order, whatever the cuisines; the penalty only bends choices the basket or the
 * cellar would otherwise have made, which is where the monotony came from.
 *
 * **Pinches are not lines, for scoring.** Salt, pepper and a spoon of oil are in almost every
 * cellar, so counting them would rank a recipe well on its staples while its chicken is bought.
 * They are still reported as covered or missing — they just do not move the ranking, and they
 * never enter the basket: a jar of thyme is not a purchase a week has to finish.
 *
 * **A repeat earns no basket credit.** Once the pool is exhausted and repeats begin, a recipe
 * already cooked would share every line with the basket by construction; it is scored on the
 * cellar alone, so a repeat is still the last resort and never a preference.
 *
 * **Each plate keeps its runners-up.** Every eligible candidate is scored anyway, so the ones that
 * came closest are the swap sheet's first offer, at no read. They are ranked like the winner and
 * against the same stock and basket, then, once the week is drawn, every recipe it picked is
 * dropped from them — a runner-up already on the week is not an alternative. A plate keeps
 * `ALTERNATIVES_PER_PLATE + plates.length` before that filter, since it removes at most one
 * recipe per plate. Once repeats begin every recipe is in the week, so a plate may offer none.
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
  const basket: Basket = new Map();
  const rarity = _rarityOf(candidates);
  const horizon = Math.max(MIN_BASKET_REUSES, Math.round(BASKET_REUSE_SHARE * plates.length));
  const served = new Map<Cuisine, number>();
  const ownCap = Math.floor(ownShare * plates.length);
  const picked = new Set<Id<"recipes">>();
  const cooked = new Set<Id<"recipes">>();
  const kept = ALTERNATIVES_PER_PLATE + plates.length;
  let ownPicked = 0;

  const drawn = plates.map((plate) => {
    // Every recipe has been used: the pool is genuinely exhausted, and repeats begin.
    if (picked.size === candidates.length) picked.clear();

    const ranked = _eligible(candidates, picked, ownPicked >= ownCap)
      .map((candidate) => {
        const coverage = coverageOf(candidate, left);
        const lines = scoredNeeds(candidate.needs).length || 1;
        const reused = cooked.has(candidate.recipeId) ? [] : _reused(coverage.missing, basket, horizon);
        const credit = _reuseCredit(reused, basket, rarity, horizon);
        const repeats = UNCOUNTED_CUISINES.has(candidate.cuisine) ? 0 : (served.get(candidate.cuisine) ?? 0);
        const score = ((scoredNeeds(coverage.covered).length + credit) / lines) * CUISINE_REPEAT_FACTOR ** repeats;

        return { candidate, coverage, reused, score, tie: coverage.partial / lines };
      })
      // The sort is stable, so an equal score and tie keep the earlier candidate — the shuffled order.
      .sort((a, b) => b.score - a.score || b.tie - a.tie);

    // `_eligible` never returns an empty pool while `candidates` is non-empty.
    const { candidate, coverage, reused } = ranked[0]!;

    picked.add(candidate.recipeId);
    cooked.add(candidate.recipeId);
    if (candidate.isMine) ownPicked += 1;
    served.set(candidate.cuisine, (served.get(candidate.cuisine) ?? 0) + 1);
    spend(left, coverage.taken);
    // What this plate buys joins the basket at no reuse; what it drew from the basket spends one.
    for (const need of scoredNeeds(coverage.missing)) {
      if (!basket.has(need.ingredientId)) basket.set(need.ingredientId, 0);
    }
    for (const ingredientId of new Set(reused.map((need) => need.ingredientId))) {
      basket.set(ingredientId, basket.get(ingredientId)! + 1);
    }

    return {
      plate,
      candidate,
      covered: coverage.covered,
      missing: coverage.missing,
      runnersUp: ranked.slice(1, 1 + kept).map((entry) => entry.candidate),
    };
  });

  const week = new Set(drawn.map((meal) => meal.candidate.recipeId));

  return drawn.map(({ runnersUp, ...meal }) => ({
    ...meal,
    alternatives: runnersUp.filter((runnerUp) => !week.has(runnerUp.recipeId)).slice(0, ALTERNATIVES_PER_PLATE),
  }));
};
