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
 * FNV-1a over `key`, as a fraction in [0, 1) — the shuffle seed a week of ideas derives from.
 * Deterministic by design: the same week must redraw the same picks wherever it is asked from,
 * so this is integer hash math rather than `Math.random()`.
 */
export const seedOfWeekKey = (key: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 2 ** 32;
}
