/**
 * The clock as the server has to receive it: a day and an hour, both the cook's own.
 *
 * The server has no timezone. "Tuesday" and "lunch" only mean something where the cook is
 * standing, so every planning call carries a local-day timestamp rather than an instant, and the
 * cook step carries the wall-clock hour beside it. `today` is that day at local midnight, the
 * number `startOfDay` produces and every plate's `date` is compared with; `hour` is decimal —
 * 16.5 is half past four — because a slot threshold at 18 has to fall on the right side of 17:59.
 */
export type Clock = { today: number; hour: number };

/** Local midnight of the day `date` falls on, as a `Date`. */
export const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/** `date` as the server reads it — see `Clock`. */
export const localClock = (date: Date): Clock => ({
  today: startOfDay(date).getTime(),
  hour: date.getHours() + date.getMinutes() / 60,
});
