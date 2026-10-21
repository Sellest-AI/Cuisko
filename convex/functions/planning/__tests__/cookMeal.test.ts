import { describe, expect, test } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { MealSlot } from "@shared/mealSlots";

import { nearestPlate, type PlateCandidate } from "../cookMeal";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A Tuesday at local midnight, somewhere: the arithmetic only ever reads differences. */
const TODAY = 1_700_000_000_000;

const plate = (
  id: string,
  dayOffset: number,
  slot: MealSlot,
  status: PlateCandidate["status"] = "planned",
): PlateCandidate => ({
  _id: id as Id<"plannedMeals">,
  date: TODAY + dayOffset * DAY_MS,
  slot,
  status,
});

const at = (hour: number) => ({ today: TODAY, hour });

describe("functions/planning/cookMeal › nearestPlate", () => {
  describe("the current slot wins", () => {
    /** Lunch is still the meal in progress at 16h — people eat late — even with dinner planned. */
    test("at 16h, lunch and dinner today → lunch", () => {
      const lunch = plate("lunch", 0, "lunch");
      expect(nearestPlate([plate("dinner", 0, "dinner"), lunch], at(16))).toBe(lunch);
    });

    test("at 18h, lunch and dinner today → dinner", () => {
      const dinner = plate("dinner", 0, "dinner");
      expect(nearestPlate([plate("lunch", 0, "lunch"), dinner], at(18))).toBe(dinner);
    });

    test("at 18h, dinner today and dinner tomorrow → today's", () => {
      const today = plate("today", 0, "dinner");
      expect(nearestPlate([plate("tomorrow", 1, "dinner"), today], at(18))).toBe(today);
    });
  });

  describe("otherwise the nearest plate within reach", () => {
    /** Dinner is current but there is none: the lunch ten hours ago is nearer than tomorrow's, fourteen ahead. */
    test("at 20h, lunch today and lunch tomorrow → today's lunch", () => {
      const today = plate("today", 0, "lunch");
      expect(nearestPlate([plate("tomorrow", 1, "lunch"), today], at(20))).toBe(today);
    });

    test("at 8h, lunch today → lunch, two hours ahead", () => {
      const lunch = plate("lunch", 0, "lunch");
      expect(nearestPlate([lunch], at(8))).toBe(lunch);
    });

    test("at 1h, dinner yesterday → yesterday's dinner", () => {
      const dinner = plate("dinner", -1, "dinner");
      expect(nearestPlate([dinner], at(1))).toBe(dinner);
    });

    test("at 20h, lunch tomorrow only → tomorrow's lunch, fourteen hours ahead", () => {
      const lunch = plate("lunch", 1, "lunch");
      expect(nearestPlate([lunch], at(20))).toBe(lunch);
    });

    /** At 9h, yesterday's dinner is 15 behind and today's dinner 9 ahead — nearer, so it wins. */
    test("prefers the smaller distance whichever side of now it is on", () => {
      const tonight = plate("tonight", 0, "dinner");
      expect(nearestPlate([plate("last-night", -1, "dinner"), tonight], at(9))).toBe(tonight);
    });

    /** At 2h, yesterday's dinner is 8 behind and today's lunch 8 ahead: the earlier one. */
    test("a tie goes to the earlier plate", () => {
      const lastNight = plate("last-night", -1, "dinner");
      expect(nearestPlate([plate("lunch", 0, "lunch"), lastNight], at(2))).toBe(lastNight);
    });
  });

  describe("nothing to settle", () => {
    test("a plate two days out is beyond reach", () => {
      expect(nearestPlate([plate("later", 2, "lunch")], at(12))).toBeUndefined();
    });

    test("at 3h, tomorrow's dinner is beyond reach", () => {
      expect(nearestPlate([plate("later", 1, "dinner")], at(3))).toBeUndefined();
    });

    test("a cooked plate is never a candidate, even on the current slot", () => {
      expect(nearestPlate([plate("done", 0, "lunch", "cooked")], at(12))).toBeUndefined();
    });

    test("no plates", () => {
      expect(nearestPlate([], at(12))).toBeUndefined();
    });
  });
});
