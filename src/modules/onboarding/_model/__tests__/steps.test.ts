import { describe, expect, test } from "vitest";

import {
  NEEDS_ACTION,
  ONBOARDING_STEPS,
  PROGRESS_BAR_TOTAL,
  PROGRESS_TOTAL,
  SECTIONS,
  canLeave,
  introOf,
  nextOf,
  positionOf,
  progressOf,
  routeOf,
  stepOf,
} from "../steps";

describe("steps", () => {
  test("runs from the promise to the week", () => {
    expect(ONBOARDING_STEPS[0]).toBe("promise");
    expect(ONBOARDING_STEPS.at(-1)).toBe("week");
  });

  test("counts sections from 1, the promise first and the week last", () => {
    expect(positionOf("promise")).toBe(1);
    expect(positionOf("week")).toBe(PROGRESS_TOTAL);
  });

  test("gives an intro and the steps after it the same position", () => {
    expect(positionOf("recipes-intro")).toBe(positionOf("recipes"));
    expect(positionOf("recipes")).toBe(positionOf("import"));
    expect(positionOf("cook-intro")).toBe(positionOf("cook"));
  });

  test("opens every section with its own intro, ahead of the section's other steps", () => {
    for (const section of SECTIONS) {
      const intro = ONBOARDING_STEPS.findIndex((step) => introOf(step) === section);
      const first = ONBOARDING_STEPS.findIndex((step) => positionOf(step) === SECTIONS.indexOf(section) + 2);

      expect(intro).toBe(first);
    }
  });

  test("has nothing after the week: the flow ends in finish, not a route", () => {
    expect(nextOf("groceries")).toBe("recipes-intro");
    expect(nextOf("week")).toBeNull();
  });

  test("reads every step back from its own route", () => {
    for (const step of ONBOARDING_STEPS) expect(stepOf(routeOf(step))).toBe(step);
  });

  test("tells plan-recipe from recipes", () => {
    expect(stepOf("/onboarding/plan-recipe")).toBe("plan-recipe");
    expect(stepOf("/onboarding/recipes")).toBe("recipes");
  });

  test("reads a path outside the flow as no step, the real sheet of the same name included", () => {
    expect(stepOf("/plan-recipe")).toBeNull();
    expect(stepOf("/assistant")).toBeNull();
    expect(stepOf("/")).toBeNull();
  });

  test("holds Continue back on every step but the promise, the intros and the shown-only import", () => {
    expect(ONBOARDING_STEPS.filter((step) => !NEEDS_ACTION[step])).toEqual([
      "promise",
      "groceries-intro",
      "recipes-intro",
      "import",
      "plan-intro",
      "cook-intro",
      "week-intro",
    ]);
  });

  test("keeps the groceries step until its action is done, however often Continue is pressed", () => {
    expect(canLeave("groceries", [])).toBe(false);
    expect(canLeave("groceries", ["recipes"])).toBe(false);
    expect(canLeave("groceries", ["groceries"])).toBe(true);
  });

  test("lets a step that asks for nothing be left at once", () => {
    expect(canLeave("promise", [])).toBe(true);
    expect(canLeave("recipes-intro", [])).toBe(true);
  });

  test("fills the progress with the sections finished, one notch lit from the start", () => {
    expect(progressOf("promise", [])).toBe(1);
    expect(progressOf("groceries-intro", [])).toBe(2);
    expect(progressOf("groceries", ["groceries"])).toBe(2);
    expect(progressOf("recipes-intro", ["groceries"])).toBe(3);
    expect(progressOf("import", ["groceries", "recipes"])).toBe(3);
  });

  test("fills the progress only once the week is done, not on arriving in its section", () => {
    expect(progressOf("week-intro", [])).toBe(PROGRESS_BAR_TOTAL - 1);
    expect(progressOf("week", [])).toBe(PROGRESS_BAR_TOTAL - 1);
    expect(progressOf("week", ["week"])).toBe(PROGRESS_BAR_TOTAL);
  });

  test("counts one notch more than there are parts: the one lit on arrival", () => {
    expect(PROGRESS_BAR_TOTAL).toBe(PROGRESS_TOTAL + 1);
  });
});
