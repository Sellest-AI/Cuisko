import { useShareIntent } from "expo-share-intent";
import { useEffect, useEffectEvent } from "react";

import { sharedLinkOf } from "~/lib/share-intent/sharedLinkOf";

/**
 * Calls `onLink` with each link shared to Cuisko from another app, once, while `enabled`.
 *
 * `expo-share-intent` hands a share over through its native module: on Android the activity's
 * `SEND` intent, on iOS what the share extension saved before reopening the app on its `dataUrl=`
 * link (which `auth/native-intent` lands on home). Read on mount and every time the app comes back
 * to the foreground, so a share that cold-starts the app and one that wakes it both arrive.
 *
 * Generic on purpose: what a link becomes, and when the app can take one, are the caller's
 * (`recipes/share-intent-listener`). Mount it ONCE, at the root: two callers would each clear the
 * share, and only the first would see it.
 *
 * Held while `enabled` is false, and handed over once it turns true. Then cleared, natively as
 * well, so the next foreground does not hand it over again. A share with no link in it is cleared
 * unseen.
 *
 * @limitation A held share is lost if the app leaves the foreground before `enabled` turns true (a
 * Google or Apple sign-in sheet backgrounds it, and the library clears a share on background).
 * Shared again, it arrives.
 */
export const useOnSharedLink = (onLink: (link: string) => void, { enabled }: { enabled: boolean }) => {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  // The latest callbacks, without a new one re-running the effect: callers pass an inline arrow,
  // and the library builds a new `resetShareIntent` every render.
  const handOver = useEffectEvent((link: string) => onLink(link));
  const clear = useEffectEvent(() => resetShareIntent());

  useEffect(() => {
    if (!hasShareIntent || !enabled) return;

    const link = sharedLinkOf(shareIntent);
    clear();
    if (link) handOver(link);
  }, [enabled, hasShareIntent, shareIntent]);
};
