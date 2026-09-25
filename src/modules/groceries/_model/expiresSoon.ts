const DAY_MS = 24 * 60 * 60 * 1000;

/** Under this many days left, a cellar card shows its clock. */
export const EXPIRES_SOON_DAYS = 5;

/**
 * Whether a cellar row is close enough to its date to show the clock: under `EXPIRES_SOON_DAYS`
 * days left, already gone off included. An undated row never is.
 *
 * The date is a rough estimate `addToCellar` makes from how long a food usually keeps, so this is
 * the only trace of it the shopper sees: a clock, never the date, never a number.
 *
 * Measured from `now`, the grocery screen's own clock (`useLiveWindow`), rather than from local
 * midnight: the date is an instant (the moment of purchase plus a number of days), and `now`
 * wakes at `expiresSoonAt`, so the clock appears while the screen is open.
 *
 * Computed here rather than shipped by the server because this card is the only thing that shows
 * it (ADR 0015 covers a value two screens must agree on).
 */
export const expiresSoon = (expirationDate: number | undefined, now: number): boolean =>
  expirationDate !== undefined && expirationDate - now < EXPIRES_SOON_DAYS * DAY_MS;

/**
 * The first moment `expiresSoon` is true for a dated row — a deadline for `useLiveWindow`.
 *
 * One millisecond past the boundary, because the boundary itself is still "five days left": a
 * timer woken exactly there would redraw the card unchanged, and `useLiveWindow` never re-arms a
 * deadline it has already passed.
 */
export const expiresSoonAt = (expirationDate: number): number => expirationDate - EXPIRES_SOON_DAYS * DAY_MS + 1;
