import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import { captureEvent } from "../captureEvent";

const capture = vi.hoisted(() => vi.fn());
vi.mock("../client", () => ({ posthog: { capture } }));

const ctx = { scheduler: {} as never };
const household = "household-dupont" as Id<"households">;

/** A plate of soup Camille cooked, as `meal cooked` carries it. */
const COOKED = {
  plannedMealId: "plate-soupe" as Id<"plannedMeals">,
  mealPlanId: "week-dupont" as Id<"mealPlans">,
  recipeId: "recipe-soupe" as Id<"recipes">,
  recipeOrigin: "catalog" as const,
  fromPlate: true,
  servings: 2,
};

beforeEach(() => capture.mockReset());

describe("captureEvent", () => {
  test("files the event under the household group when one is given", async () => {
    await captureEvent(ctx, { event: "meal cooked", distinctId: "camille", householdId: household, properties: COOKED });

    expect(capture.mock.calls[0]![1]).toEqual({
      distinctId: "camille",
      event: "meal cooked",
      properties: COOKED,
      groups: { household },
    });
  });

  test("sends no group when there is no household", async () => {
    await captureEvent(ctx, { event: "account deleted", distinctId: "camille", properties: { outcome: "anonymized" } });

    expect(capture.mock.calls[0]![1]).not.toHaveProperty("groups");
  });

  /** The scheduler skipping a plate is nobody's act: the household must not turn into a person. */
  test("a personless event keeps PostHog from creating a person for its distinctId", async () => {
    await captureEvent(ctx, {
      event: "meal skipped",
      distinctId: household,
      householdId: household,
      personless: true,
      properties: { plannedMealId: COOKED.plannedMealId, mealPlanId: COOKED.mealPlanId, recipeId: COOKED.recipeId, servings: 4 },
    });

    expect(capture.mock.calls[0]![1].properties).toMatchObject({ servings: 4, $process_person_profile: false });
  });

  /** The write it reports must go on: analytics is an add-on. */
  test("logs a capture that throws instead of throwing it", async () => {
    capture.mockRejectedValueOnce(new Error("scheduler unavailable"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(captureEvent(ctx, { event: "meal cooked", distinctId: "camille", properties: COOKED })).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledOnce();

    logged.mockRestore();
  });
});
