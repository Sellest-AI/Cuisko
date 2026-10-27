import { api } from "~/lib/convex/api";
import { useAuthenticated } from "~/lib/convex/auth";
import { useQueryDevice } from "~/lib/convex/client";

/**
 * Which household the app is shopping for.
 *
 * Every household-scoped query takes a `householdId`, so this resolves before any of them can be
 * issued — one waterfall per session, which `useQueryCached` then holds across navigations.
 *
 * The choice is the server's: `getMine` marks exactly one household current — the one the cook
 * selected, or their oldest when nothing is selected — so this reads the flag rather than picking.
 * Picking here would be a second producer of the same answer (ADR 0015), and the drawer and the
 * cellar could then disagree about which kitchen the cook is standing in.
 */
export const useHousehold = () => {
  const { isAuthenticating, hasSession } = useAuthenticated();

  /**
   * `'skip'` is Convex's idiom for "not yet" — the hook call stays unconditional, the query unsent.
   * A stored session is enough to read the device copy; the live query waits for confirmation.
   */
  const { data, isPending } = useQueryDevice(api.router.households.getMine.authed, hasSession ? {} : "skip");
  const householdId = data?.find((household) => household.isCurrent)?._id;

  return {
    householdId,
    /**
     * A signed-in user with no household yet is loading, not householdless — the query is in
     * flight. One on the device is not loading, whether or not Convex has confirmed the session.
     */
    isLoading: householdId === undefined && (isAuthenticating || (hasSession && isPending)),
  };
};
