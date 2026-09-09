import { api } from "~/lib/convex/api";
import { useQueryCached } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

/**
 * Everything the tunnel opens already knowing: the caller's own preferences, the union of their
 * housemates', and the household's kitchen and plan defaults.
 *
 * The tunnel's only read. It sits here rather than in `useTunnel` because that hook is the tunnel's
 * *state* — the step, the draft, the toggles — and folding a query into it would make every screen
 * that reads a slider re-render on a round trip it does not care about.
 *
 * ⚠️ **`isLoading` is not cosmetic.** The constraint list is seeded from this answer exactly once
 * per run, so a screen that let the user tick a chip before it landed would have that tick
 * overwritten by the seed a moment later. The diet step waits.
 */
export const usePlanningSeed = () => {
  const { householdId, isLoading: isResolvingHousehold } = useHousehold();

  /** `'skip'` is Convex's idiom for "not yet" — the hook call stays unconditional, the query unsent. */
  const { data, isPending } = useQueryCached(
    api.router.preferences.getPlanningSeed.authed,
    householdId ? { householdId } : "skip",
  );

  return {
    seed: data,
    householdId,
    /** A signed-in user whose household has not resolved is loading, not householdless. */
    isLoading: isResolvingHousehold || (!!householdId && isPending),
  };
};
