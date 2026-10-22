/**
 * Apple accepts the secret only if it is an ES256 JWT, signed by the key its `kid` names, for the
 * Services ID in `sub`, and alive for no more than six months. Any slip fails every Apple sign-in,
 * and nothing tells us until a user reports it.
 */
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/appleClientSecret.mjs";

/** `appleClientSecret.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { appleClientSecret, LIFETIME_S } = lib as unknown as {
  appleClientSecret: (input: {
    privateKey: string;
    keyId: string;
    teamId: string;
    servicesId: string;
    now: Date;
  }) => { secret: string; expiresAt: Date };
  LIFETIME_S: number;
};

/** Apple's documented ceiling on `exp - iat`. */
const APPLE_MAX_LIFETIME_S = 15777000;

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const now = new Date("2026-10-22T12:00:00Z");
const { secret, expiresAt } = appleClientSecret({
  privateKey: pem,
  keyId: "LUDZW6WZ8F",
  teamId: "VD33R9X5X3",
  servicesId: "com.cuisko.app.signin",
  now,
});
const [header, payload, signature] = secret.split(".") as [string, string, string];
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

describe("appleClientSecret", () => {
  it("is signed with the .p8 key, in the raw form JWS expects", () => {
    const valid = verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    );
    expect(valid).toBe(true);
  });

  it("names the key, the team and the Services ID Apple looks up", () => {
    expect(decode(header)).toEqual({ alg: "ES256", kid: "LUDZW6WZ8F" });
    expect(decode(payload)).toMatchObject({
      iss: "VD33R9X5X3",
      sub: "com.cuisko.app.signin",
      aud: "https://appleid.apple.com",
    });
  });

  it("stays under Apple's six-month cap, and reports when it runs out", () => {
    const { iat, exp } = decode(payload);
    expect(iat).toBe(now.getTime() / 1000);
    expect(exp - iat).toBe(LIFETIME_S);
    expect(LIFETIME_S).toBeLessThanOrEqual(APPLE_MAX_LIFETIME_S);
    expect(expiresAt.toISOString()).toBe("2027-04-20T12:00:00.000Z");
  });
});
