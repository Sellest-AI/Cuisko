/**
 * How long a video import is announced to take, in minutes: the share sheet's copy and the grid's
 * countdown both say it, so they cannot disagree. A promise to the cook, not a measurement: the
 * server bounds it (`importVideo`), and an import that runs over shows `due` until it lands.
 */
export const VIDEO_IMPORT_MINUTES = 3;

/** What the countdown on an importing card reads: whole minutes, then seconds, then nothing left. */
export type ImportCountdown = { unit: "minutes" | "seconds"; count: number } | { unit: "due" };

/**
 * The time left on an import started at `startedAt`, as of `now`.
 *
 * Minutes while a minute or more is left, rounded up so the card opens on the full announcement
 * ("3 minutes") rather than one less a second after it appears; seconds for the last minute.
 */
export const importCountdownOf = (startedAt: number, now: number): ImportCountdown => {
  const secondsLeft = Math.ceil((startedAt + VIDEO_IMPORT_MINUTES * 60_000 - now) / 1000);

  if (secondsLeft <= 0) return { unit: "due" };
  if (secondsLeft < 60) return { unit: "seconds", count: secondsLeft };
  return { unit: "minutes", count: Math.ceil(secondsLeft / 60) };
};
