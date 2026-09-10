import { useCallback, useState } from "react";

import type { PreferenceValues } from "@shared/preferences";

import { api } from "~/lib/convex/api";
import { useAuthenticated } from "~/lib/convex/auth";
import { useMutation, useQueryCached } from "~/lib/convex/client";

/**
 * What a user who has never answered reads as.
 *
 * The same three values `getPlanningSeed` uses for an absent row, and deliberately so: a screen
 * that opened on something else would show the user an answer they never gave, and then write it
 * back the first time they touched anything else on the page.
 */
const UNANSWERED: PreferenceValues = { diet: "omnivore", avoids: [], seeks: [] };

/**
 * The caller's own preferences, and the one way a screen changes them.
 *
 * ⚠️ **`save` replaces the whole row.** There is one write path per table by design, and the price
 * of that is that every writer sends the whole answer — a caller that sent only `seeks` would
 * silently clear somebody's gluten. The preferences sheet edits all three fields and so has them
 * all to hand; the tunnel edits `diet` and `avoids` and passes `seeks` straight back untouched.
 *
 * Both writers are asserting the caller's OWN answer. The tunnel's constraint list also shows what
 * a household imposes, and none of that is ever folded into what reaches here — see `save` on the
 * Convex side, which takes values rather than ids and so cannot reach a housemate's row.
 *
 * The local draft is what makes a chip respond to a tap rather than to a round trip. The query
 * stays the source of truth until the first local write, after which the draft leads and the
 * server confirms — so a change made on another device lands only on the next mount. That is the
 * right trade for a sheet somebody has open for four seconds; a longer-lived screen would want the
 * query to win.
 */
export const usePreferences = () => {
  const { isAuthenticated, isAuthenticating } = useAuthenticated();
  const [draft, setDraft] = useState<PreferenceValues | null>(null);

  /** `'skip'` is Convex's idiom for "not yet" — the hook call stays unconditional, the query unsent. */
  const { data, isPending } = useQueryCached(
    api.router.preferences.getMine.authed,
    isAuthenticated ? {} : "skip",
  );

  const { mutate, isLoading: isSaving } = useMutation(api.router.preferences.save.authed);

  const isLoading = isAuthenticating || (isAuthenticated && isPending);

  /**
   * `null` from the query is an answer — nobody has ever asked — and reads as `UNANSWERED`.
   * `undefined` is the absence of an answer, and stays `undefined` so the screen can wait.
   */
  const answered = data
    ? { diet: data.diet, avoids: data.avoids, seeks: data.seeks }
    : data === null
      ? UNANSWERED
      : undefined;

  const save = useCallback(
    (values: PreferenceValues) => {
      setDraft(values);

      void mutate(values).catch((error: unknown) => {
        /**
         * Reported rather than surfaced, and the draft is deliberately not rolled back: the sheet
         * has no error surface, and snapping a chip the user just tapped back to where it was is
         * a worse lie than showing their answer until the next mount re-reads the row.
         */
        if (__DEV__) console.warn("[usePreferences] save failed", error);
      });
    },
    [mutate],
  );

  return {
    preferences: draft ?? answered,
    isLoading,
    isSaving,
    save,
  };
};
