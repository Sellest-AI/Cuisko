import { api } from "~/lib/convex/api";
import { useAuthenticated } from "~/lib/convex/auth";
import { useQueryCached } from "~/lib/convex/client";

/**
 * Which household the app is shopping for.
 *
 * Every household-scoped query takes a `householdId`, so this resolves before any of them can be
 * issued — one waterfall per session, which `useQueryCached` then holds across navigations.
 *
 * It takes the first household rather than a stored choice because there is nothing to choose
 * between: a user belongs to exactly one. `getMine` orders by when they joined, so "first" is
 * stable across reads. A `currentHouseholdId` column would store a fact that is still derivable,
 * and it arrives the day someone can join a second household and the selection becomes real
 * information.
 */
export const useHousehold = () => {
  const { isAuthenticated, isAuthenticating } = useAuthenticated();

  /** `'skip'` is Convex's idiom for "not yet" — the hook call stays unconditional, the query unsent. */
  const { data, isPending } = useQueryCached(
    api.router.households.getMine.authed,
    isAuthenticated ? {} : "skip",
  );

  return {
    householdId: data?.[0]?._id,
    /** A signed-in user with no household yet is loading, not householdless — the query is in flight. */
    isLoading: isAuthenticating || (isAuthenticated && isPending),
  };
};
