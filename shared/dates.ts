export const compareDates = (date1: Date, date2: Date): number => {
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  return d1.getTime() - d2.getTime();
}

export const compareDateTimes = (date1: Date, date2: Date): number => {
  const d1 = date1.getTime();
  const d2 = date2.getTime();
  return d1 - d2;
}

/**
 * The local Monday of `date`'s week, as `YYYY-MM-DD` — the key a week of ideas seeds from.
 * Built from local parts deliberately: `toISOString()` is UTC and shifts the day for any
 * device past midnight of its offset.
 */
export const weekKeyOf = (date: Date): string => {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  const month = `${monday.getMonth() + 1}`.padStart(2, "0");
  const day = `${monday.getDate()}`.padStart(2, "0");
  return `${monday.getFullYear()}-${month}-${day}`;
}

/**
 * The instant a week's key names, as UTC midnight of that Monday.
 *
 * The key carries the client's local day and no offset, so this is the Monday within half a day
 * of wherever it was set — and that is exact enough for what it settles: a recipe written after
 * it is examined after the ones that made the week's picks (`candidatePool.settledAt`). Any fixed
 * instant near the week's start keeps the picks standing; only its being fixed matters.
 */
export const mondayOf = (key: string): number => Date.parse(`${key}T00:00:00Z`);

/**
 * FNV-1a over `key`, as a fraction in [0, 1). Deterministic by design: the same key must redraw
 * the same picks wherever it is asked from, so this is integer hash math rather than
 * `Math.random()`.
 */
const _hashKey = (key: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 2 ** 32;
}

/** The shuffle seed a week of ideas derives from, out of its `weekKeyOf` key. */
export const seedOfWeekKey = (key: string): number => _hashKey(key);

/**
 * The shuffle seed a day's catalog shelf derives from, out of its `toDateParam` key: the same
 * picks all day, new ones the next.
 */
export const seedOfDayKey = (key: string): number => _hashKey(key);

/**
 * A `YYYY-MM-DD` route param, or nothing.
 *
 * Anything else is ignored rather than trusted: a date is untrusted text on the way in, and an
 * `Invalid Date` reaching the list would compare false against every row and silently open at the
 * top. Parsed at local midnight so the day means the user's day, not UTC's.
 *
 * The parsed date is read back and compared, because `Date` does not reject an impossible day —
 * it rolls it over, turning `2026-02-31` into March 2nd and opening the list a week from where
 * the caller asked. Only a value that survives the round trip is the day it claimed to be.
 */
export const parseDateParam = (value?: string | string[]): Date | undefined => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const [year, month, dayOfMonth] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(year, month - 1, dayOfMonth);

  const isTheDayItClaimed =
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === dayOfMonth;

  return isTheDayItClaimed ? parsed : undefined;
};

/**
 * The inverse, kept beside its parser so the two formats cannot drift apart: the local day as
 * `YYYY-MM-DD`, also the key a day's catalog shelf seeds from (`seedOfDayKey`).
 */
export const toDateParam = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
