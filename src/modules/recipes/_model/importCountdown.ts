/**
 * How long a video import is announced to take, in minutes: the share sheet's copy and the grid's
 * countdown both say it, so they cannot disagree. A promise to the cook, not a measurement: the
 * server bounds it (`importVideo`), and an import that runs over shows `due` until it lands.
 */
export const VIDEO_IMPORT_MINUTES = 3;

/** What the countdown on an importing card reads: whole minutes, then seconds, then nothing left. */
export type ImportCountdown = { unit: "minutes" | "seconds"; count: number } | { unit: "due" };

/**
 * The time left on an import started at `startedAt`, as of `now`, announced to take `expectedMs`:
 * a reel's minutes unless the import says otherwise (a web page from the chat says 30 s).
 *
 * Minutes while a minute or more is left, rounded up so the card opens on the full announcement
 * ("3 minutes") rather than one less a second after it appears; seconds for the last minute.
 */
export const importCountdownOf = (
  startedAt: number,
  now: number,
  expectedMs: number = VIDEO_IMPORT_MINUTES * 60_000,
): ImportCountdown => {
  const secondsLeft = Math.ceil((startedAt + expectedMs - now) / 1000);

  if (secondsLeft <= 0) return { unit: "due" };
  if (secondsLeft < 60) return { unit: "seconds", count: secondsLeft };
  return { unit: "minutes", count: Math.ceil(secondsLeft / 60) };
};

/** Where a time bar stops until the import answers: full would say it is done when it is not. */
const PROGRESS_HOLD = 0.95;

/**
 * How full a time bar is for an import started at `startedAt` and announced to take `expectedMs`:
 * filling evenly to 95 % at the announced time, then held there until the import answers.
 *
 * Time, not progress: the server reports nothing while it works. The hold is in the fraction, so the
 * bar draws it with a linear curve and no second one.
 */
export const importProgressOf = (startedAt: number, expectedMs: number, now: number): number => {
  const elapsed = Math.max(0, now - startedAt);

  return Math.min(PROGRESS_HOLD, (PROGRESS_HOLD * elapsed) / expectedMs);
};
