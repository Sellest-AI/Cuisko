import { env } from "./env";

/**
 * The JWT issuer Convex validates incoming tokens against.
 *
 * `domain` must be this deployment's own site URL, because @convex-dev/auth issues the tokens
 * itself. A wrong or missing issuer does not fail loudly — it fails every sign-in with a generic
 * "not authenticated", which is why `CONVEX_SITE_URL` is required in env.ts rather than optional
 * (ADR 0005): a deployment that cannot name its own issuer should refuse to boot.
 */
export default {
  providers: [
    {
      domain: env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
