/**
 * Prints a fresh Sign in with Apple client secret on stdout, and its expiry on stderr.
 *
 *   node scripts/release/apple-client-secret.mjs ~/Downloads/AuthKey_LUDZW6WZ8F.p8
 *   APPLE_SIGN_IN_KEY="$(cat AuthKey.p8)" node scripts/release/apple-client-secret.mjs
 *
 * The bimonthly `apple-secret` workflow runs it the second way and sets the result on both Convex
 * deployments; the first is for renewing by hand. The ids below are identifiers, not secrets:
 * only the .p8 is, and it never enters the repo.
 */
import { readFileSync } from "node:fs";

import { appleClientSecret } from "./_lib/appleClientSecret.mjs";

/** Developer portal → Keys. Changes only if the key is revoked and replaced. */
const KEY_ID = "LUDZW6WZ8F";
/** Developer portal → Membership details. */
const TEAM_ID = "VD33R9X5X3";
/** The Services ID carrying the return URLs; also `AUTH_APPLE_ID` on both deployments. */
const SERVICES_ID = "com.cuisko.app.signin";

const keyFile = process.argv[2];
const privateKey = keyFile ? readFileSync(keyFile, "utf8") : process.env.APPLE_SIGN_IN_KEY;
if (!privateKey) {
  console.error("Pass the .p8 path, or set APPLE_SIGN_IN_KEY to its contents.");
  process.exit(1);
}

const { secret, expiresAt } = appleClientSecret({
  privateKey,
  keyId: KEY_ID,
  teamId: TEAM_ID,
  servicesId: SERVICES_ID,
  now: new Date(),
});

process.stdout.write(secret);
console.error(`Expires ${expiresAt.toISOString().slice(0, 10)}`);
