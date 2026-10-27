/**
 * The routes that open with no signal: Home, the grocery list and its quantity sheet, Cuisko, and
 * the two pages that answer for no data (`/auth`, `/offline`). Every other route, opened offline,
 * lands on `/offline` (`OfflineGate`).
 *
 * A route added here draws from the device or draws nothing: every query it issues on open goes
 * through `useQueryDevice`. `/quantity` is here because writes stay enabled offline; the Convex
 * client holds them until the signal returns.
 */
export const OFFLINE_ROUTES: readonly string[] = [
  "/",
  "/groceries",
  "/assistant",
  "/quantity",
  "/auth",
  "/offline"
];

/** How long the socket must stay down before the app counts as offline: a blip under it is nothing. */
export const OFFLINE_GRACE_MS = 2_000;
