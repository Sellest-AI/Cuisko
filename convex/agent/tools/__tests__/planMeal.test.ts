import type { Id } from "@convex/_generated/dataModel";
import { describe, expect, it, test, vi } from "vitest";

import { midnightOf, planMealTool } from "../planMeal";

const HOME = "home" as Id<"households">;
const DAY = 86_400_000;
const TODAY = 1_000_000;
/** A Wednesday evening at the end of September, on the cook's wall clock. */
const CLOCK = { today: TODAY, now: "2026-09-30T19:12" };

type Tool = ReturnType<typeof planMealTool>;
type Ctx = Parameters<Tool["run"]>[0];

type Plate = { date: number; slot: "lunch" | "dinner"; status: string; servings: number; recipe: { title: string } };

/** A ctx whose recipe check answers `missing`, whose day read answers `plates`, and whose write succeeds. */
const _ctx = ({ missing = [], plates = [], replaced }: { missing?: string[]; plates?: Plate[]; replaced?: object } = {}) => {
  const runQuery = vi.fn(async (_ref: unknown, args: { ids?: string[] }) => (args.ids ? missing : plates));
  const runMutation = vi.fn(async () => ({ mealPlanId: "plan", plannedMealId: "plate", ...(replaced && { replaced }) }));

  return { ctx: { runQuery, runMutation } as unknown as Ctx, runMutation };
};

const tool = planMealTool({ householdId: HOME, locale: "fr", ...CLOCK });

/** Friday 2 October, dinner, for four. */
const LASAGNE = { recipeId: "lasagne", date: "2026-10-02", slot: "dinner" as const, servings: 4 };

describe("midnightOf", () => {
  it("counts whole days from today, across the end of a month", () => {
    expect(midnightOf(CLOCK, "2026-09-30")).toBe(TODAY);
    expect(midnightOf(CLOCK, "2026-10-08")).toBe(TODAY + 8 * DAY);
  });

  test.each(["2026-09-29", "2026-10-09", "vendredi", "2026-02-30T12:00"])("throws on %s, naming how far it can plan", (date) => {
    expect(() => midnightOf(CLOCK, date)).toThrow(/from today to 8 days after it/);
  });
});

describe("planMealTool", () => {
  it("plans the plate on that day's midnight, reserving from today", async () => {
    const { ctx, runMutation } = _ctx();

    const result = await tool.run(ctx, LASAGNE);

    expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
      householdId: HOME, recipeId: "lasagne", date: TODAY + 2 * DAY, slot: "dinner", servings: 4, today: TODAY,
    });
    expect(result).toEqual({
      v: 1, status: "planned", householdId: HOME, plannedMealId: "plate", recipeId: "lasagne",
      date: TODAY + 2 * DAY, slot: "dinner", servings: 4,
    });
  });

  /** An invented id is a bug in the call, and nothing has moved yet: the model retries with a real one. */
  it("throws on an unknown recipe id before writing anything", async () => {
    const { ctx, runMutation } = _ctx({ missing: ["lasagne"] });

    await expect(tool.run(ctx, LASAGNE)).rejects.toThrow(/lasagne/);
    expect(runMutation).not.toHaveBeenCalled();
  });

  /** The grid shows what a tile would replace and asks; Cuisko asks too, and writes nothing yet. */
  it("answers occupied, with the dish there, when a planned plate holds the slot", async () => {
    const { ctx, runMutation } = _ctx({
      plates: [{ date: TODAY + 2 * DAY, slot: "dinner", status: "ready", servings: 2, recipe: { title: "Curry" } }],
    });

    const result = await tool.run(ctx, LASAGNE);

    expect(result).toEqual({ v: 1, status: "occupied", current: { title: "Curry", servings: 2 } });
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("replaces it once the cook said yes, and returns what it replaced", async () => {
    const { ctx, runMutation } = _ctx({
      plates: [{ date: TODAY + 2 * DAY, slot: "dinner", status: "shopping-needed", servings: 2, recipe: { title: "Curry" } }],
      replaced: { recipeId: "curry", servings: 2 },
    });

    const result = await tool.run(ctx, { ...LASAGNE, replace: true });

    expect(runMutation).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "planned", replaced: { recipeId: "curry", servings: 2 } });
  });

  it("plans beside the other slot of that day, and a plate of the next day", async () => {
    const { ctx, runMutation } = _ctx({
      plates: [
        { date: TODAY + 2 * DAY, slot: "lunch", status: "ready", servings: 2, recipe: { title: "Salade" } },
        { date: TODAY + 3 * DAY, slot: "dinner", status: "ready", servings: 2, recipe: { title: "Curry" } },
      ],
    });

    expect(await tool.run(ctx, LASAGNE)).toMatchObject({ status: "planned" });
    expect(runMutation).toHaveBeenCalledOnce();
  });

  /** A cooked plate is a record, and `commitPlan` refuses to replace it: the model hears why. */
  it("throws on a slot already cooked, even with replace", async () => {
    const { ctx, runMutation } = _ctx({
      plates: [{ date: TODAY + 2 * DAY, slot: "dinner", status: "cooked", servings: 2, recipe: { title: "Curry" } }],
    });

    await expect(tool.run(ctx, { ...LASAGNE, replace: true })).rejects.toThrow(/already cooked/);
    expect(runMutation).not.toHaveBeenCalled();
  });
});
