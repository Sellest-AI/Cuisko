import { usePathname } from "expo-router";

import { useAuthenticated } from "~/lib/convex/auth";

import { isAuthFlowPath } from "../_model/auth-flow";

/**
 * Whether the cook is signed in and past signing in: neither on `/auth` nor in the onboarding.
 *
 * For what opens from outside the app (a shared link's sheet): pushed during a sign-in, it would be
 * closed by the gate's reset to the onboarding, so it waits until this is true.
 */
export const useIsInApp = (): boolean => {
  const { isAuthenticated } = useAuthenticated();
  const pathname = usePathname();
  return isAuthenticated && !isAuthFlowPath(pathname);
};
