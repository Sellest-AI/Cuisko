import { useCallback, useState } from "react";

import { api, type Id } from "~/lib/convex/api";
import { useAction } from "~/lib/convex/client";
import { useLocale } from "~/hooks/useLocale";
import { useAuth } from "~/modules/auth/hooks";

/** What the last verify said: the fixes it made, or that there were none. */
export type VerifyOutcome = { verdict: "unchanged" } | { verdict: "rewritten"; corrections: string[] };

type Status = "idle" | "verifying" | "done" | "failed";

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
 */
export const useVerifyRecipe = (id?: string) => {
  const locale = useLocale();
  const { user } = useAuth();
  const { action } = useAction(api.router.recipes.verifyOne.admin);

  const [status, setStatus] = useState<Status>("idle");
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [error, setError] = useState<unknown>(null);

  const verify = useCallback(async () => {
    if (!id || status === "verifying") return;

    setError(null);
    setOutcome(null);
    setStatus("verifying");

    try {
      setOutcome(await action({ recipeId: id as Id<"recipes">, locale }));
      setStatus("done");
    } catch (caught) {
      setError(caught);
      setStatus("failed");
    }
  }, [action, id, locale, status]);

  return {
    canVerify: user?.role === "ADMIN",
    isVerifying: status === "verifying",
    outcome,
    error,
    verify,
  };
};
