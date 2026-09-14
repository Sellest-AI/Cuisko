import type { KeptMeal, MealSlot } from "../../_model/model";

/** Local midnight `days` from today — `setDate` rides over a daylight-saving change, an ms add does not. */
export const dayOffset = (days: number): number => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getTime();
};

/** A kept plate as `getMany` / `getPaginated` answer it — the shape both read hooks consume. */
export const keptMeal = (
  id: string,
  days: number,
  slot: MealSlot,
  overrides: Partial<KeptMeal> = {},
): KeptMeal => ({
  id,
  date: dayOffset(days),
  slot,
  servings: 2,
  status: "ready",
  recipe: { id: `recipe-${id}`, title: `Plat ${id}`, minutes: 20 },
  ...overrides,
});
