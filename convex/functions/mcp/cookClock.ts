import { ConvexError } from "convex/values";

import { midnightOf } from "../../agent/tools/planMeal";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** The offsets in use on Earth, 26 hours end to end: outside them, the value is not a real one. */
const MIN_OFFSET_MS = -12 * HOUR_MS;
const MAX_OFFSET_MS = 14 * HOUR_MS;

/** `2026-11-05T19:30:00+01:00`. The offset is required, and `Z` is refused: see `cookClockOf`. */
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?([+-])(\d{2}):([0-5]\d)$/;

const REFUSAL =
  "dateTime must be the meal's date and time with the cook's UTC offset on that day, like " +
  "2026-11-05T19:30:00+01:00. Ask the cook rather than guess it.";

/** The cook's clock, as `planMealTool` needs it. */
export type CookClock = {
  /** The day the meal is on, `YYYY-MM-DD`. */
  date: string;
  /** That day as a plate stores it. */
  midnight: number;
  /** Today's midnight read at the meal's offset: see the `@limitation` on `cookClockOf`. */
  today: number;
  /** The wall clock at the meal's offset, as `localStamp` writes it. */
  now: string;
};

/**
 * Reads the cook's clock off the one value an agent sends: when the meal is, with its UTC offset.
 *
 * The server has no timezone, and a plate's date is the cook's local midnight compared by equality,
 * so a day computed in UTC would miss the plate already on that slot. The offset is what closes
 * that gap, which is why it is required: `Z` is refused because a model reaching for it usually
 * means it does not know.
 *
 * A day in the past, or past what the app can plan, is refused here, with the sentence `midnightOf`
 * gives the assistant, so the window has one owner and an unrealistic date stops before any read.
 *
 * @limitation Design choice: a meal on a clock-change day itself is an hour off, because the offset
 * in force at dinner is not the one at that day's midnight. Two days a year, and only a zone name
 * could fix it, which an agent does not send.
 *
 * @limitation Design choice: `today` is read at the meal's offset, which is not today's when a clock
 * change falls between them. In the eight days before the autumn change, a meal after it puts `today`
 * an hour past tonight's plate, so tonight's food stops counting as reserved, and the new plate can
 * take it and leave the grocery list short, with no error. Accepted by the user, 2026-11-04.
 */
export const cookClockOf = (dateTime: string, instant: number): CookClock => {
  const match = DATE_TIME.exec(dateTime);
  if (!match) throw new ConvexError(REFUSAL);

  const [, date, sign, hours, minutes] = match as unknown as [string, string, string, string, string];
  const offset = (sign === "-" ? -1 : 1) * (Number(hours) * HOUR_MS + Number(minutes) * MINUTE_MS);
  if (offset < MIN_OFFSET_MS || offset > MAX_OFFSET_MS) throw new ConvexError(REFUSAL);

  // `Date.parse` rolls some impossible days forward, so the day has to survive the round trip.
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(midnight) || new Date(midnight).toISOString().slice(0, 10) !== date) {
    throw new ConvexError(REFUSAL);
  }

  const wallClock = new Date(instant + offset).toISOString();
  const today = Date.parse(`${wallClock.slice(0, 10)}T00:00:00Z`) - offset;

  const now = wallClock.slice(0, 16);

  return { date, midnight: midnightOf({ today, now }, date), today, now };
};
