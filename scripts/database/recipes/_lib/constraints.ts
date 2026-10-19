/**
 * Which constraints the catalog import asks `suggestDishes` under, ask by ask.
 *
 * Random rather than gap-driven: what Marmiton holds cannot be known ahead. Weighted by how often
 * each value came out true on the recipes imported under it, so a goal the model cannot guess
 * (a dish it calls high-protein that the ingredients say is not) is asked less often, on its own.
 * Nothing is ever dropped: the floor keeps an unlucky value asked, and its weight climbs back with
 * its rate.
 */
import type { DishConstraints } from "@convex/schema/recipePayloads";
import { ceilingMinutesOf, CONSTRAINT_TIMES } from "@shared/cookingTimes";
import { CONSTRAINT_DIETS, type ConstraintDiet, fitsDiet } from "@shared/diets";
import {
  EXCLUSIVE_PREFERENCES,
  matchesSeeks,
  NUTRITION_PREFERENCES,
  type NutritionPreference,
} from "@shared/preferences";
import type { Tag } from "@shared/tags";

/**
 * One constraint VALUE, never a combination: "time:20", "diet:vegan", "seeks:high-protein".
 * Per combination there are over a hundred, and the data would take a dozen runs to mean anything.
 */
export type ConstraintKey =
  | `time:${NonNullable<DishConstraints["time"]>}`
  | `diet:${NonNullable<DishConstraints["diet"]>}`
  | `seeks:${NutritionPreference}`;

/** Of the dishes asked under a value and imported, how many came out with it. */
export type HitRate = { asked: number; hit: number };

/** The share of asks sent with no constraint, so plain cuisine coverage keeps growing. */
export const UNCONSTRAINED_SHARE = 0.25;

/** Below this many imported dishes a value's rate is luck, and it weighs 1. */
export const MIN_IMPORTS_TO_WEIGH = 10;

/**
 * The least a value weighs. A cut-off would drop a value for bad luck: at a real 40% hit rate, the
 * chance of scoring under 30% over 10 imports is 17%.
 */
export const WEIGHT_FLOOR = 0.2;

/** The keys a dish asked under `constraints` is scored against: one per value. */
export const constraintKeysOf = ({ time, diet, seeks = [] }: DishConstraints): ConstraintKey[] => [
  ...(time ? [`time:${time}` as const] : []),
  ...(diet ? [`diet:${diet}` as const] : []),
  ...seeks.map((sought) => `seeks:${sought}` as const),
];

/** What an imported recipe came out as: the two facts a constraint is checked against. */
export type RecipeFacts = { tags: readonly Tag[]; totalMinutes?: number };

/**
 * Whether the recipe fits each value it was asked under, by the planner's own test for that value,
 * so a hit means the recipe lands in the week a cook filters for:
 *
 * - a diet, against the diet tags, which nest (a vegan recipe is tagged vegetarian too);
 * - a goal, through `matchesSeeks`;
 * - a time, against `ceilingMinutesOf`, margin included. An untimed recipe fits, as it does in
 *   `candidatePool`: the planner lets it into a timed week.
 */
export const hitsOf = (constraints: DishConstraints, { tags, totalMinutes }: RecipeFacts): Map<ConstraintKey, boolean> => {
  const { time, diet, seeks = [] } = constraints;
  const hits = new Map<ConstraintKey, boolean>();

  if (time) hits.set(`time:${time}`, totalMinutes === undefined || totalMinutes <= (ceilingMinutesOf(time) ?? Infinity));
  if (diet) hits.set(`diet:${diet}`, tags.includes(diet));
  for (const sought of seeks) hits.set(`seeks:${sought}`, matchesSeeks(tags, [sought]));

  return hits;
};

/** Each value's weight: 1 until it has `MIN_IMPORTS_TO_WEIGH` imports, then its rate, floored. */
export const weightsOf = (rates: ReadonlyMap<ConstraintKey, HitRate>): Map<ConstraintKey, number> =>
  new Map(
    [...rates].map(([key, { asked, hit }]) => [
      key,
      asked < MIN_IMPORTS_TO_WEIGH ? 1 : Math.max(WEIGHT_FLOOR, hit / asked),
    ]),
  );

/** Singles and pairs: `MAX_CONSTRAINT_SEEKS` is two, and the tool refuses more. */
const _SEEK_SETS: NutritionPreference[][] = [
  ...NUTRITION_PREFERENCES.map((sought) => [sought]),
  ...NUTRITION_PREFERENCES.flatMap((first, index) =>
    NUTRITION_PREFERENCES.slice(index + 1)
      .map((second) => [first, second])
      .filter((pair) => !EXCLUSIVE_PREFERENCES.every((exclusive) => pair.includes(exclusive))),
  ),
];

const _TIMES: DishConstraints[] = CONSTRAINT_TIMES.map((time) => ({ time }));
const _DIETS: DishConstraints[] = CONSTRAINT_DIETS.map((diet) => ({ diet }));
const _SEEKS: DishConstraints[] = _SEEK_SETS.map((seeks) => ({ seeks }));

const _crossOf = (left: DishConstraints[], right: DishConstraints[]) =>
  left.flatMap((one) => right.map((other) => ({ ...one, ...other })));

/**
 * The legal asks, grouped by shape: one or two of the three axes. The shape is drawn first, evenly,
 * then the values within it by weight. Drawn straight across every combination, the goals would
 * take 140 asks in 155, since they alone come in pairs, and a diet alone would be asked once in 50.
 */
const _SHAPES: DishConstraints[][] = [
  _TIMES,
  _DIETS,
  _SEEKS,
  _crossOf(_TIMES, _DIETS),
  _crossOf(_TIMES, _SEEKS),
  _crossOf(_DIETS, _SEEKS),
];

/** A combination weighs the product of its values: high-protein 0.6 × low-carb 0.5 → 0.3. */
const _weightOf = (constraints: DishConstraints, weights: ReadonlyMap<ConstraintKey, number>) =>
  constraintKeysOf(constraints).reduce((product, key) => product * (weights.get(key) ?? 1), 1);

const _drawOf = <T>(items: readonly T[], weightOf: (item: T) => number, random: () => number): T => {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let left = random() * total;

  for (const item of items) {
    left -= weightOf(item);
    if (left < 0) return item;
  }

  // Reached only when rounding leaves a sliver: the last item is the draw.
  const last = items.at(-1);
  if (last === undefined) throw new Error("constraints: nothing to draw from.");
  return last;
};

/**
 * The constraints for one ask, or `undefined` for one ask in four (`UNCONSTRAINED_SHARE`).
 *
 * A value missing from `weights` weighs 1: one never imported under has no rate yet.
 */
export const pickConstraints = (
  weights: ReadonlyMap<ConstraintKey, number>,
  random: () => number = Math.random,
): DishConstraints | undefined => {
  if (random() < UNCONSTRAINED_SHARE) return undefined;

  const shape = _drawOf(_SHAPES, () => 1, random);
  return _drawOf(shape, (constraints) => _weightOf(constraints, weights), random);
};

/**
 * The dishes an ask returned, split by whether the agent's own `diet` fits the diet asked
 * (`fitsDiet`). Everything fits when no diet was asked.
 *
 * Asked for vegan Indonesian dishes, the agent returned chicken, duck and goat, marked as having
 * meat. Searched, they would teach the hit rate that vegan cannot be asked for; `missed` is what the
 * ledger keeps so the next ask under that diet avoids them.
 */
export const splitByDiet = <Dish extends { diet?: ConstraintDiet }>(
  dishes: readonly Dish[],
  diet: ConstraintDiet | undefined,
): { fitting: Dish[]; missed: Dish[] } => ({
  fitting: dishes.filter((dish) => !diet || fitsDiet(dish.diet, diet)),
  missed: dishes.filter((dish) => diet !== undefined && !fitsDiet(dish.diet, diet)),
});
