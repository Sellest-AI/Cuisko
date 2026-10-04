import { useCallback } from "react";
import { useAtom } from "jotai";

import { api, type Id } from "~/lib/convex/api";
import { useAction } from "~/lib/convex/client";
import { useLocale } from "~/hooks/useLocale";
import { useAuth } from "~/modules/auth/hooks";

import { verificationsAtom, type Verification } from "./atoms";

/**
 * An admin's "Verify the recipe": the recipe checked against the page it was imported from, and
 * rewritten by the server when it was wrong.
 *
 * `canVerify` is a convenience, not the gate — `verifyOne.admin` refuses anyone who is not an admin
 * whatever this says. It exists so a cook never sees a button that could only fail for them.
 *
 * The outcome is returned rather than shown in an alert: `Alert.alert` does nothing on web, and the
 * corrections are worth reading where the button is. A rewrite needs no refetch here — `useRecipe`
 * is a live query, and the row it watches is the one the server just patched.
 *
 * The check lives in `verificationsAtom` under the recipe's id, not in this hook, so it outlives the
 * screen: leave mid-check and come back, and `startedAt` still says how long it has been running.
 */
export const useVerifyRecipe = (id?: string) => {
  const locale = useLocale();
  const { user } = useAuth();
  const { action } = useAction(api.router.recipes.verifyOne.admin);

  const [verifications, setVerifications] = useAtom(verificationsAtom);
  const verification = id ? verifications[id] : undefined;
  const isVerifying = verification?.status === "verifying";

  const verify = useCallback(async () => {
    if (!id || isVerifying) return;

    /** Functional, because the answer lands a minute later, over whatever other recipes wrote since. */
    const record = (next: Verification) => setVerifications((all) => ({ ...all, [id]: next }));

    record({ status: "verifying", startedAt: Date.now() });

    try {
      record({ status: "done", outcome: await action({ recipeId: id as Id<"recipes">, locale }) });
    } catch (caught) {
      record({ status: "failed", error: caught });
    }
  }, [action, id, isVerifying, locale, setVerifications]);

  return {
    canVerify: user?.role === "ADMIN",
    isVerifying,
    /** When the running check started, for a bar that resumes where it was. */
    startedAt: verification?.status === "verifying" ? verification.startedAt : undefined,
    outcome: verification?.status === "done" ? verification.outcome : null,
    error: verification?.status === "failed" ? verification.error : null,
    verify,
  };
};
