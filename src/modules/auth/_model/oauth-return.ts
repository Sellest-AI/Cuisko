/** Where an OAuth return is kept: the page that started the sign-in, and the one the gate reads. */
const AUTH_PATH = "/auth";

/** Where an OAuth return that starts the app lands: nothing is left to finish there. */
const HOME_PATH = "/";

/**
 * The bare return Convex Auth redirects to: the app's root, scheme or not, with a `code` among its
 * query parameters. Not `barcode=`, and not a page of the app that has a `code` of its own.
 */
const _OAUTH_RETURN = /^(?:[a-z][a-z0-9+.-]*:\/\/)?\/?\?(?:[^#]*&)?code=/i;

/**
 * Where a link opening the app should take it: an OAuth return goes to `/auth`, anything else as
 * it came.
 *
 * On Android the auth session's `cuisko://?code=…` also reaches the app as a deep link, and read as
 * a route it is home (`/`). The sign-in then finishes on home instead of on `/auth`, and the gate,
 * which ends a sign-in (the held recipe) only from `/auth`, lets it stay there. The code itself is
 * read by the auth session, not by the route, so dropping it here loses nothing.
 *
 * Unless the return starts the app: Android killed it while the browser was in front, and the auth
 * session that would have read the code died with it. Nothing finishes the sign-in, so the return
 * lands on home, signed out, rather than on `/auth` as a sheet over no page.
 */
export const routeForIncomingLink = (path: string, { isColdStart = false }: { isColdStart?: boolean } = {}): string => {
  if (!_OAUTH_RETURN.test(path)) return path;
  return isColdStart ? HOME_PATH : AUTH_PATH;
};
