/**
 * How long the cook has on an average evening this week — the tunnel's time step, and the ceiling
 * it puts on the recipes a week may be drawn from.
 *
 * ⚠️ **A cooking time steers one week; it is never stored.** It is the same line
 * [`tastes.ts`](./tastes.ts) draws between a craving and a `seeks` entry: how long somebody had to
 * cook this week is not a fact about how they eat, it is next week's different answer. So it
 * travels as an argument to `getDraft`, `resetTunnelAtom` is the whole of its lifetime, and
 * `commitPreferences` must never learn it.
 *
 * That is why this is a file of its own rather than an addition to
 * [`preferences.ts`](./preferences.ts): everything exported from that file persists and aggregates,
 * and this does neither.
 *
 * Shared rather than living in the planning module for the reason `DIETS` is shared: the Convex
 * validator has to be built from the same four literals the screen draws, and `src/` is unreachable
 * from `convex/`. A second copy is how the tunnel offers an option the server rejects.
 */

/**
 * One answer, not several: these are nested — "under 20" is also under 30 — so a multi-select would
 * let the user assert a range and its own contradiction at once. `any` is the default because a
 * ceiling nobody asked for is a week of recipes quietly withheld.
 */
export const COOKING_TIMES = ["any", "20", "30", "60"] as const;

export type CookingTime = (typeof COOKING_TIMES)[number];

/**
 * How far past the stated ceiling a recipe may still go.
 *
 * A stated ceiling is an estimate on both sides — the cook's, who said "about half an hour", and
 * the model's that timed the recipe. Filtering on the bare number throws away a 32-minute recipe
 * for a cook who meant "roughly thirty", which is a worse answer than the one they asked for.
 *
 * A multiplier rather than a literal map of `{ "20": 24, "30": 36, "60": 72 }`, because the margin
 * is the *rule*: somebody will want it at 10% or 30%, and a map is that rule spread across three
 * numbers with the reason gone.
 */
export const TIME_MARGIN = 1.2;

/**
 * The real ceiling in minutes, margin applied and rounded to a whole minute.
 *
 * `null` for `any`, which is the absence of a ceiling and not an infinite one — the caller omits
 * the argument entirely, so the unfiltered week takes exactly the code path it took before this
 * existed.
 */
export const ceilingMinutesOf = (time: CookingTime): number | null =>
  time === "any" ? null : Math.round(Number(time) * TIME_MARGIN);
