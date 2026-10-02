import { useCallback, useState } from "react";

import { ACCOUNT_DELETION_GRACE_MS } from "@shared/accountDeletion";

import { api } from "~/lib/convex/api";
import { useMutation } from "~/lib/convex/client";
import { useAuth } from "~/modules/auth/hooks";

type Options = {
  /**
   * The request landed but the session survived it. The deletion is scheduled, so there is nothing
   * left to ask: the screen gets control back to close itself. Signing back in still cancels.
   */
  onSignOutFailed: () => void;
};

/**
 * Asking for the account to be deleted, which signs the cook out.
 *
 * The sheet says everything before the cook confirms, the date included, so there is nothing left to
 * show once the request lands and the session ends at once. That is also what gives "sign back in to
 * keep your account" its meaning: a cook who stayed signed in would never sign back in.
 *
 * `dueAt` is the date the deletion falls on if asked now, from the same constant the server schedules
 * with. Fixed when the sheet opens, so it does not tick over at midnight while being read.
 */
export const useDeleteAccount = ({ onSignOutFailed }: Options) => {
  const { signOut } = useAuth();
  const { mutate: runRequest, isLoading: isRequesting } = useMutation(
    api.router.users.requestDeletion.authed,
  );
  const [dueAt] = useState(() => Date.now() + ACCOUNT_DELETION_GRACE_MS);
  const [hasError, setHasError] = useState(false);

  /**
   * Resolves once settled, and never throws: a refused request is `hasError`, and the cook stays
   * signed in to try again. Signing out only follows a request the server accepted.
   *
   * No navigation here: once the session is gone, `AuthGate` sends the page to `/auth`.
   */
  const request = useCallback(async (): Promise<void> => {
    setHasError(false);
    try {
      await runRequest({});
    } catch (cause) {
      setHasError(true);
      if (__DEV__) console.warn("[useDeleteAccount] request failed", cause);
      return;
    }

    await signOut().catch((cause: unknown) => {
      if (__DEV__) console.warn("[useDeleteAccount] sign-out failed", cause);
      onSignOutFailed();
    });
  }, [runRequest, signOut, onSignOutFailed]);

  return { dueAt, isRequesting, hasError, request };
};
