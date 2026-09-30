import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { PlanMealResult } from "@shared/assistant";
import { PLANNABLE_DAYS } from "@shared/clock";
import { MEAL_SLOTS } from "@shared/mealSlots";
import { MAX_SERVINGS, MIN_SERVINGS } from "@shared/servings";
import type { Locale } from "@shared/translations";
import z from "zod/v4";

import { createTool } from "../utils";

/**
 * How Cuisko puts a dish on the week: "je veux faire des lasagnes ce soir", once the cook said how
 * many and yes.
 *
 * **The same write as the recipe screen's grid**, `planMeal`, so the plate reserves the cellar and
 * lists what is missing exactly as a plate planned by hand does. And the same courtesy: the grid
 * shows the plate a tile would replace and asks first, so this reads the slot before writing and
 * answers `occupied` rather than replace a plate the cook did not mention.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type Caller = {
  /** The household whose week this is: the one `sendMessage` checked the cook belongs to. */
  householdId: Id<"households">;
  /** For the title of a plate already on the slot, which the model repeats to the cook. */
  locale: Locale;
  /** The cook's local midnight, and wall clock (`localStamp`), as they pressed send. */
  today: number;
  now: string;
};

/**
 * The plate date for a calendar date the model names, counted in whole days from the cook's today;
 * or the error the model has to act on, naming how far it can plan.
 *
 * @limitation Design choice: whole days of 24 hours from today's local midnight, since the server
 * has no timezone. Across a clock change inside the window the result is an hour off the phone's
 * midnight for that day: after the October change it falls at 23:00 the day before, so the plate is
 * drawn a day early and does not replace the plate already on its slot. Accepted for the two weeks
 * a year it can happen; the fix is the phone sending its own midnights.
 */
export const midnightOf = ({ today, now }: Pick<Caller, "today" | "now">, date: string): number => {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${now.slice(0, 10)}T00:00:00Z`)) / DAY_MS;

  if (!Number.isInteger(days) || days < 0 || days >= PLANNABLE_DAYS) {
    throw new Error(
      `${date} cannot be planned from the chat: pick a date from today to ${PLANNABLE_DAYS - 1} days after it. ` +
      "Further ahead, point the cook to the planning screen.",
    );
  }

  return today + days * DAY_MS;
};

const _inputSchema = z.object({
  recipeId: z.string().describe("The id of the recipe, from searchRecipes."),
  date: z
    .string()
    .describe(`The day, as YYYY-MM-DD, counted from the date in <now>: from today to ${PLANNABLE_DAYS - 1} days after it.`),
  slot: z.enum(MEAL_SLOTS).describe("\"lunch\" or \"dinner\". Tonight is dinner, noon is lunch."),
  servings: z.number().int().min(MIN_SERVINGS).max(MAX_SERVINGS).describe("How many the cook said they will be."),
  replace: z
    .boolean()
    .optional()
    .describe("True only after the cook said yes to replacing the dish already planned on that slot."),
});

type Input = z.infer<typeof _inputSchema>;

export const planMealTool = ({ householdId, locale, today, now }: Caller) =>
  createTool({
    description:
      "Plans one recipe on one meal of the cook's week, for a number of people, and adds what the " +
      "cellar lacks for it to the grocery list. The cook sees the planned meal with a button to " +
      "undo it. Call it when the cook asked for it, or said yes when you offered. Pass a recipe id " +
      "from searchRecipes. If the answer is `occupied`, nothing was planned: another dish already " +
      "holds that meal, so tell the cook which and ask whether to replace it; call again with " +
      "replace only on a yes. Never say a meal is planned unless this tool answered `planned`. Do " +
      "not describe the planned meal in your text: the card shows it.",
    inputSchema: _inputSchema,
    execute: async (ctx, { recipeId, date, slot, servings, replace }: Input): Promise<PlanMealResult> => {
      const missing = await ctx.runQuery(internal.router.recipes.missingIds._internal, { ids: [recipeId] });
      if (missing.length > 0) {
        throw new Error(
          `This recipe id does not exist: ${recipeId}. Pass only ids searchRecipes returned in this conversation, copied exactly.`,
        );
      }

      const midnight = midnightOf({ today, now }, date);

      const onThatDay = await ctx.runQuery(internal.router.planning.getMany._internal, {
        householdId,
        locale,
        from: midnight,
        to: midnight + DAY_MS,
      });
      const current = onThatDay.find((meal) => meal.date === midnight && meal.slot === slot);

      if (current && (current.status === "cooked" || current.status === "skipped")) {
        throw new Error(`The ${slot} of ${date} is already ${current.status}: nothing can be planned on it.`);
      }

      if (current && !replace) {
        return { v: 1, status: "occupied", current: { title: current.recipe.title, servings: current.servings } };
      }

      const planned = await ctx.runMutation(internal.router.planning.planOne._internal, {
        householdId,
        recipeId: recipeId as Id<"recipes">,
        date: midnight,
        slot,
        servings,
        today,
      });

      return {
        v: 1,
        status: "planned",
        householdId,
        plannedMealId: planned.plannedMealId,
        recipeId,
        date: midnight,
        slot,
        servings,
        ...(planned.replaced && { replaced: planned.replaced }),
      };
    },
  });
