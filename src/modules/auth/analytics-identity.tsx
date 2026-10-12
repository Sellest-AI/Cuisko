import { usePostHog } from "posthog-react-native";
import { useEffect } from "react";

import { useSignedInUserId } from "./_hooks/useSignedInUserId";
import { identityStep } from "./_model/analytics-identity";

/**
 * Keeps analytics attributing events to the cook signed in, by their `users` id: the id the
 * backend records each paid call under, so a cook's screens and what they cost join on one person.
 * Nothing else is sent about them: no name, no email (the privacy policy promises as much).
 *
 * Mounted once, at the root, rather than inside `useAuth`: several screens call that at once, and
 * identifying from inside it would fire once per screen mounted.
 *
 * It waits while auth is still deciding, so a token being refreshed is never read as a sign-out.
 * Analytics loads what it holds from storage after launch, so the step is decided once it is ready.
 * A failure is logged and dropped: analytics is an add-on, and must never break signing in.
 */
export const AnalyticsIdentity = () => {
  const posthog = usePostHog();
  const { userId, isDeciding } = useSignedInUserId();

  useEffect(() => {
    if (isDeciding) return;
    let isCurrent = true;

    posthog
      .ready()
      .then(() => {
        if (!isCurrent) return;
        const step = identityStep({
          userId,
          distinctId: posthog.getDistinctId(),
          anonymousId: posthog.getAnonymousId(),
        });
        if (step === "reset" || step === "reset-and-identify") posthog.reset();
        if (userId !== null && (step === "identify" || step === "reset-and-identify")) posthog.identify(userId);
      })
      .catch((cause: unknown) => console.error("[AnalyticsIdentity] could not update the analytics identity", cause));

    return () => {
      isCurrent = false;
    };
  }, [isDeciding, posthog, userId]);

  return null;
};
