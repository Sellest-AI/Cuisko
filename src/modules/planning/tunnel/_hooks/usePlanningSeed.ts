import { api } from "~/lib/convex/api";
import { useQueryCached } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";

/**
 * Everything the tunnel opens already knowing: the caller's own preferences, the union of their
 * housemates', the household's kitchen and plan defaults, and the day its kept week ends on.
 *
 * The tunnel's reads, and only its reads. They sit here rather than in `useTunnel` because that
 * hook is the tunnel's *state* — the step, the draft, the toggles — and folding a query into it
 * would make every screen that reads a slider re-render on a round trip it does not care about.
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

  /**
   * The household's latest kept plate, which the week starts after. A failed read answers `null`
   * rather than waiting: the week then starts tomorrow, and `commit` holds the one-plate-per-slot
   * rule server-side whatever the client counted from.
   */
  const { data: lastDate, isError: isLastDateUnknown } = useQueryCached(
    api.router.planning.getLastDate.authed,
    householdId ? { householdId } : "skip",
  );

  return {
    seed: data,
    /** `undefined` while the round trip is out, `null` for a household that has never kept a plate. */
    lastDate: isLastDateUnknown ? null : lastDate,
    householdId,
    /** A signed-in user whose household has not resolved is loading, not householdless. */
    isLoading: isResolvingHousehold || (!!householdId && isPending),
  };
};
