import { isShareExtensionLink } from "~/lib/share-intent/isShareExtensionLink";
import { recipeIdOfLink } from "~/modules/recipes/routes";

import { routeForIncomingLink } from "./_model/oauth-return";

/** Where a share lands: home, under the share sheet `share-intent-listener` opens over it. */
const SHARE_LANDING = "/";

/**
 * Expo Router's hook on every link that opens the app, cold or warm, before it becomes a route:
 * `app/+native-intent.tsx` re-exports it. An OAuth return is `routeForIncomingLink`'s rule; the
 * link iOS's share extension reopens the app on names no page, so it lands on home, and the shared
 * link itself reaches the sheet through the native module, not through this path. A shared recipe
 * link (`https://cuisko.app/r/<id>`, claimed for the app by the site) opens that recipe.
 *
 * @limitation Shared while the app is open on another page, iOS sends the cook home under the
 * sheet: the path is all this hook can answer, and the share link names no page to stay on.
 *
 * @limitation A recipe link tapped by someone signed out is lost: the gate sends them to `/auth`
 * and on through the onboarding, and nothing keeps the recipe across it. **Accepted because**
 * parking it across a sign-in was kept out of the share slice on purpose. **Until fixed**, they
 * tap the link again once signed in. **The fix** is the id held through `/auth` and the
 * onboarding, and opened when the gate lets them in.
 */
export const redirectSystemPath = ({ path }: { path: string; initial: boolean }) => {
  if (isShareExtensionLink(path)) return SHARE_LANDING;

  const recipeId = recipeIdOfLink(path);
  if (recipeId) return `/recipe/${encodeURIComponent(recipeId)}`;

  return routeForIncomingLink(path);
};
