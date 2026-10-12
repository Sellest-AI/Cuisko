import { api, type Id } from "~/lib/convex/api";
import { useAuthenticated } from "~/lib/convex/auth";
import { useQueryCached } from "~/lib/convex/client";

/**
 * Who is signed in on this device, by `users` id, and nothing else: for the code that follows the
 * cook without signing anyone in (analytics), so it does not take on `useAuth`'s sign-in state.
 *
 * `isDeciding` while auth has not settled, or has and the cook's row is not there: still loading, or
 * `getMe` failed. A token being refreshed, or a query that errored, is neither a sign-in nor a
 * sign-out, and nothing should act on it. `userId` is `null` then, and when nobody is signed in.
 *
 * The query is the one `useAuth` reads, so the two share one subscription.
 */
export const useSignedInUserId = (): { userId: Id<"users"> | null; isDeciding: boolean } => {
  const { isAuthenticated, isAuthenticating } = useAuthenticated();
  const { data: user } = useQueryCached(api.router.users.getMe.authed, isAuthenticated ? {} : "skip");

  return {
    userId: isAuthenticated ? (user?.id ?? null) : null,
    isDeciding: isAuthenticating || (isAuthenticated && !user),
  };
};
