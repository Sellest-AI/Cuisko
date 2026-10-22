/**
 * The client secret Sign in with Apple's web flow authenticates with: an ES256 JWT signed by the
 * .p8 key, which `convex/auth.ts` reads as `AUTH_APPLE_SECRET`.
 *
 * Apple refuses one that lives longer than six months, so it cannot be set once and forgotten:
 * `.github/workflows/apple-secret.yml` signs a fresh one every two months, and a run that fails still
 * leaves four months before sign-in breaks.
 */
import { Buffer } from "node:buffer";
import { createPrivateKey, sign } from "node:crypto";

/** Apple's cap is 15777000 s, a little over 182 days; 180 keeps clear of it. */
export const LIFETIME_S = 180 * 24 * 60 * 60;

const AUDIENCE = "https://appleid.apple.com";

const _base64url = (json) => Buffer.from(JSON.stringify(json)).toString("base64url");

/**
 * @param {{ privateKey: string, keyId: string, teamId: string, servicesId: string, now: Date }} input
 *   `privateKey` is the .p8 file's PEM text.
 * @returns {{ secret: string, expiresAt: Date }}
 */
export const appleClientSecret = ({ privateKey, keyId, teamId, servicesId, now }) => {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + LIFETIME_S;

  const header = _base64url({ alg: "ES256", kid: keyId });
  const payload = _base64url({ iss: teamId, iat: issuedAt, exp: expiresAt, aud: AUDIENCE, sub: servicesId });
  // JWS wants the raw r||s pair; Node signs ECDSA as DER unless told otherwise.
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");

  return { secret: `${header}.${payload}.${signature}`, expiresAt: new Date(expiresAt * 1000) };
};
