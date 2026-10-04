import { router, usePathname } from "expo-router";

import { useOnSharedLink } from "~/hooks/useOnSharedLink";
import { useIsInApp } from "~/modules/auth/hooks";

/** The sheet's path, as `usePathname` reads it: the `(modals)` group is not part of it. */
const SHARE_SHEET = "/share-import";

/**
 * Opens the recipe share sheet (`(modals)/share-import`) on a link shared to Cuisko from another
 * app: the one destination shares have today.
 *
 * Mounted once, at the root (`app/_layout.tsx`), because a share can arrive on any screen, or on
 * none when it cold-starts the app. Reading the share is `useOnSharedLink`'s; a second destination
 * would decide here which link goes where, not mount a second reader. Renders nothing.
 *
 * Held until the cook is past signing in (`useIsInApp`): a sheet pushed during a sign-in would be
 * closed by the gate moving it on to the onboarding. A share arriving while the sheet is open
 * replaces it rather than stacking a second: the first import keeps running and its recipe waits in
 * the cook's list, as when they close the sheet themselves.
 */
export const ShareIntentListener = () => {
  const pathname = usePathname();
  const enabled = useIsInApp();

  useOnSharedLink(
    (url) => {
      const sheet = { pathname: "/(modals)/share-import", params: { url } } as const;
      if (pathname === SHARE_SHEET) router.replace(sheet);
      else router.push(sheet);
    },
    { enabled },
  );
  return null;
};
