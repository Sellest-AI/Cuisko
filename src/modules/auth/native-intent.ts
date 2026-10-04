import { isShareExtensionLink } from "~/lib/share-intent/isShareExtensionLink";

import { routeForIncomingLink } from "./_model/oauth-return";

/** Where a share lands: home, under the share sheet `share-intent-listener` opens over it. */
const SHARE_LANDING = "/";

/**
 * Expo Router's hook on every link that opens the app, cold or warm, before it becomes a route:
 * `app/+native-intent.tsx` re-exports it. An OAuth return is `routeForIncomingLink`'s rule; the
 * link iOS's share extension reopens the app on names no page, so it lands on home, and the shared
 * link itself reaches the sheet through the native module, not through this path.
 *
 * @limitation Shared while the app is open on another page, iOS sends the cook home under the
 * sheet: the path is all this hook can answer, and the share link names no page to stay on.
 */
export const redirectSystemPath = ({ path }: { path: string; initial: boolean }) =>
  isShareExtensionLink(path) ? SHARE_LANDING : routeForIncomingLink(path);
