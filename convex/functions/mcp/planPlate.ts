import type { ToolCtx } from "@convex-dev/mcp";

import { internal } from "@convex/_generated/api";
import type { Locale } from "@convex/schema/i18n";
import type { MealSlot } from "@shared/mealSlots";

import { planMealTool } from "../../agent/tools/planMeal";
import { cookClockOf } from "./cookClock";
import type { McpCook } from "./loadCook";

const DAY_MS = 24 * 60 * 60 * 1000;

type Args = {
  recipeId: string;
  dateTime: string;
  slot: MealSlot;
  servings: number;
  replace?: boolean;
};

/** What `plan_meal` answers. One flat object, because an MCP output schema is an object. */
export type McpPlanResult = {
  status: "planned" | "occupied";
  /** The day, as the agent named it: a millisecond midnight means nothing to a model. */
  date: string;
  slot: MealSlot;
  /** The plate it took the slot of, with what `plan_meal` needs to put it back. */
  replaced?: { recipeId: string; title: string; servings: number };
  /** The plate that holds the slot, when `status` is `occupied`. A matching `recipeId` means it is already planned. */
  current?: { recipeId?: string; title: string; servings: number };
};

/**
 * Plans one plate through `planMealTool`, so the slot check and the write are the assistant's own,
 * and adds what an outside agent needs and the assistant's card does not: the id of the plate that
 * holds a slot, so a retry can tell its own plate, and the title of what it replaced, so it can say
 * which dish went. Both come from one read before the write: a read after it could fail a plan
 * that is already saved, and the cook would be told nothing happened.
 *
 * @limitation Design choice: the day's plates are read twice, here and in `planMealTool`. That tool
 * has the plate in hand, but its result is stored in the chat and replayed to the model on every
 * later turn, so it does not carry an id and a title only this caller needs: the chat's context
 * stays small. Two reads can disagree if a plate changes between them, which at worst names the
 * wrong dish in `replaced`, or leaves it out.
 */
export const planPlate = async (
  ctx: ToolCtx,
  cook: McpCook,
  locale: Locale,
  { dateTime, ...plate }: Args,
): Promise<McpPlanResult> => {
  const { date, midnight, today, now } = cookClockOf(dateTime, Date.now());
  const tool = planMealTool({ ...cook, locale, today, now });

  const meals = await ctx.runQuery(internal.router.planning.getMany._internal, {
    householdId: cook.householdId,
    locale,
    from: midnight,
    to: midnight + DAY_MS,
  });
  const holder = meals.find((meal) => meal.date === midnight && meal.slot === plate.slot);

  const result = await tool.run(ctx, { ...plate, date });

  if (result.status === "occupied") {
    return {
      status: "occupied",
      date,
      slot: plate.slot,
      current: { ...result.current, ...(holder && { recipeId: holder.recipe.id }) },
    };
  }

  if (!result.replaced || !holder) return { status: "planned", date, slot: plate.slot };

  const { recipeId, servings } = result.replaced;

  return {
    status: "planned",
    date,
    slot: plate.slot,
    replaced: { recipeId, title: holder.recipe.title, servings },
  };
};
