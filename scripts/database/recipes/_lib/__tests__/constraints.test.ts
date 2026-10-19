/**
 * The rotation's contract: every ask it sends is one the tool accepts, and a value whose dishes
 * keep coming out without it is asked less often, never dropped.
 */
import { CONSTRAINT_TIMES } from "@shared/cookingTimes";
import { CONSTRAINT_DIETS } from "@shared/diets";
import { EXCLUSIVE_PREFERENCES, MAX_CONSTRAINT_SEEKS, NUTRITION_PREFERENCES } from "@shared/preferences";
import { describe, expect, it } from "vitest";

import {
  type ConstraintKey,
  constraintKeysOf,
  type HitRate,
  pickConstraints,
  splitByDiet,
  UNCONSTRAINED_SHARE,
  WEIGHT_FLOOR,
  weightsOf,
} from "../constraints";

/** mulberry32: a seeded random, so a draw that fails once fails on every run. */
const _seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const _draws = (weights: Map<ConstraintKey, number>, count: number, seed = 7) => {
  const random = _seeded(seed);
  return Array.from({ length: count }, () => pickConstraints(weights, random));
};

describe("pickConstraints", () => {
  const draws = _draws(new Map(), 2000);
  const constrained = draws.filter((draw) => draw !== undefined);

  it("sends about one ask in four with no constraint", () => {
    const share = (draws.length - constrained.length) / draws.length;

    expect(share).toBeGreaterThan(UNCONSTRAINED_SHARE - 0.05);
    expect(share).toBeLessThan(UNCONSTRAINED_SHARE + 0.05);
  });

  it("never sends an empty constraint", () => {
    for (const draw of constrained) expect(constraintKeysOf(draw).length).toBeGreaterThan(0);
  });

  it("sends only values the tool accepts", () => {
    for (const { time, diet, seeks = [] } of constrained) {
      if (time) expect(CONSTRAINT_TIMES).toContain(time);
      if (diet) expect(CONSTRAINT_DIETS).toContain(diet);
      for (const sought of seeks) expect(NUTRITION_PREFERENCES).toContain(sought);
    }
  });

  it("never sends more than two goals, nor both of the exclusive pair", () => {
    for (const { seeks = [] } of constrained) {
      expect(seeks.length).toBeLessThanOrEqual(MAX_CONSTRAINT_SEEKS);
      expect(EXCLUSIVE_PREFERENCES.every((exclusive) => seeks.includes(exclusive))).toBe(false);
    }
  });

  it("asks a diet alone as often as any other shape, not once in fifty", () => {
    const dietAlone = constrained.filter(({ time, diet, seeks }) => diet && !time && !seeks).length;

    expect(dietAlone / constrained.length).toBeGreaterThan(0.1);
  });

  it("draws the same asks from the same seed", () => {
    expect(_draws(new Map(), 50, 3)).toEqual(_draws(new Map(), 50, 3));
  });

  it("asks a heavier value more often", () => {
    const weights = new Map<ConstraintKey, number>([["diet:vegan", 1], ["diet:pescatarian", 0.2]]);
    const diets = _draws(weights, 3000).flatMap((draw) => (draw?.diet ? [draw.diet] : []));
    const count = (diet: string) => diets.filter((drawn) => drawn === diet).length;

    expect(count("vegan")).toBeGreaterThan(3 * count("pescatarian"));
    expect(count("pescatarian")).toBeGreaterThan(0);
  });
});

describe("weightsOf", () => {
  const _weightOf = (rate: HitRate) => weightsOf(new Map([["seeks:high-protein", rate]])).get("seeks:high-protein");

  it("weighs a value 1 under ten imports, whatever its rate", () => {
    expect(_weightOf({ asked: 9, hit: 0 })).toBe(1);
  });

  it("weighs a value by its rate from ten imports", () => {
    expect(_weightOf({ asked: 10, hit: 6 })).toBe(0.6);
  });

  it("never weighs a value under the floor", () => {
    expect(_weightOf({ asked: 20, hit: 1 })).toBe(WEIGHT_FLOOR);
  });
});

describe("constraintKeysOf", () => {
  it("gives one key per value, each goal of a pair on its own", () => {
    expect(constraintKeysOf({ time: "20", seeks: ["high-protein", "low-carb"] })).toEqual([
      "time:20",
      "seeks:high-protein",
      "seeks:low-carb",
    ]);
  });
});

/** A pair weighs the product: drawn among pairs only, the weak pair comes up in proportion. */
describe("pickConstraints, a pair's weight", () => {
  it("weighs a pair as the product of its values", () => {
    const weights = new Map<ConstraintKey, number>(
      NUTRITION_PREFERENCES.map((sought) => [`seeks:${sought}`, sought === "iron-rich" ? 0.2 : 1]),
    );
    const pairs = _draws(weights, 6000).flatMap((draw) =>
      draw?.seeks?.length === 2 && !draw.time && !draw.diet ? [draw.seeks] : [],
    );
    const withIron = pairs.filter((seeks) => seeks.includes("iron-rich")).length;

    // 14 legal pairs, 5 of them with iron-rich at 0.2: an expected share of 1 / (9 + 1) = 0.1.
    expect(withIron / pairs.length).toBeGreaterThan(0.05);
    expect(withIron / pairs.length).toBeLessThan(0.15);
  });
});

/** Asked for vegan Indonesian dishes, the agent returned chicken, duck and goat, marked as having meat. */
describe("splitByDiet", () => {
  const dishes = [
    { name: "gado-gado", diet: "vegan" as const },
    { name: "ikan bakar", diet: "pescatarian" as const },
    { name: "ayam taliwang" },
  ];
  const _names = (list: readonly { name: string }[]) => list.map(({ name }) => name);

  it("keeps what the agent says fits the diet, and sets the rest aside", () => {
    const { fitting, missed } = splitByDiet(dishes, "vegan");

    expect(_names(fitting)).toEqual(["gado-gado"]);
    expect(_names(missed)).toEqual(["ikan bakar", "ayam taliwang"]);
  });

  it("keeps fish under a pescatarian ask, and drops only the meat", () => {
    const { fitting, missed } = splitByDiet(dishes, "pescatarian");

    expect(_names(fitting)).toEqual(["gado-gado", "ikan bakar"]);
    expect(_names(missed)).toEqual(["ayam taliwang"]);
  });

  it("keeps everything when no diet is asked", () => {
    expect(splitByDiet(dishes, undefined)).toEqual({ fitting: dishes, missed: [] });
  });
});
