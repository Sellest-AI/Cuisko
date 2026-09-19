/** The native deep-link scheme, as declared by `scheme` in app.json. */
export const APP_SCHEME = "cuisko";

/**
 * Where @convex-dev/auth may send the browser once a sign-in step completes — and with it the
 * one-time `code` in the query string.
 *
 * Replacing the component's `redirect` callback replaces its validation too, so this restates the
 * library default (a relative path, or a URL on `SITE_URL`'s origin) and adds the one thing the
 * default refuses: the app's own `cuisko://` scheme, which is how the native OAuth round-trip
 * lands back in the app. Everything else throws.
 *
 * The origin is compared parsed, not by string prefix: `http://localhost:8081.evil.com` starts
 * with `http://localhost:8081`.
 */
export const resolveAuthRedirect = (redirectTo: string, siteUrl: string): string => {
  if (redirectTo.startsWith("/") || redirectTo.startsWith("?")) return `${siteUrl}${redirectTo}`;

  let target: URL;
  try {
    target = new URL(redirectTo);
  } catch {
    throw new Error(`Invalid \`redirectTo\` ${redirectTo}: not a URL`);
  }

  if (target.protocol === `${APP_SCHEME}:`) return redirectTo;

  const isWeb = target.protocol === "http:" || target.protocol === "https:";
  if (isWeb && target.origin === new URL(siteUrl).origin) return redirectTo;

  throw new Error(`Invalid \`redirectTo\` ${redirectTo} for SITE_URL ${siteUrl}`);
};
