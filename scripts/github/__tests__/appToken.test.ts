/**
 * Every push, comment and PR a Claude session makes goes through this token. A wrong JWT is a 401
 * on every call; a cache trusted too long is a push refused mid-session; a token fetched on every
 * call is two extra requests per `git push`.
 */
import { generateKeyPairSync, verify } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as lib from "../_lib/appToken.mjs";

type Token = { token: string; expiresAt: Date };
/** `appToken.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { installationToken, repoOf, AppTokenError } = lib as unknown as {
  installationToken: (input: { root: string; mainRoot: string; repo: string; now: Date; fetch: typeof fetch }) => Promise<Token>;
  repoOf: (remoteUrl: string) => string | null;
  AppTokenError: new (message: string) => Error;
};

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const now = new Date("2026-11-12T10:00:00Z");
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

const dirs: string[] = [];
const checkout = (env: string | null) => {
  const made = mkdtempSync(path.join(os.tmpdir(), "app-token-"));
  dirs.push(made);
  if (env !== null) writeFileSync(path.join(made, ".env.local"), env);
  return made;
};
const VALID_ENV = `SELLEST_AGENT_APP_ID=1234\nSELLEST_AGENT_PRIVATE_KEY=${Buffer.from(pem).toString("base64")}\n`;
const cacheOf = (root: string) => path.join(root, ".tmp", "github", "token.json");

/** A GitHub that answers the two calls, counting them. */
const github = () =>
  vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith("/repos/Sellest-AI/Cuisko/installation")) return new Response(JSON.stringify({ id: 99 }));
    if (url.endsWith("/app/installations/99/access_tokens")) {
      return new Response(JSON.stringify({ token: "ghs_fresh", expires_at: "2026-11-12T11:00:00Z" }), { status: 201 });
    }
    return new Response("not found", { status: 404 });
  });

afterEach(() => {
  for (const made of dirs.splice(0)) rmSync(made, { recursive: true, force: true });
});

describe("the App's JWT", () => {
  /** The JWT `installationToken` sends to GitHub to find the installation. */
  const sentJwt = async () => {
    const root = checkout(VALID_ENV);
    const fetch = github();
    await installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: fetch as never });
    const headers = fetch.mock.calls[0]![1]!.headers as Record<string, string>;
    return headers.Authorization!.replace(/^Bearer /, "").split(".") as [string, string, string];
  };

  it("is RS256, signed by the App's key", async () => {
    const [header, payload, signature] = await sentJwt();
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(verify("sha256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("is issued 60 s back and lives under GitHub's 10-minute cap", async () => {
    const [, payload] = await sentJwt();
    const { iat, exp, iss } = decode(payload);
    expect(iss).toBe("1234");
    expect(iat).toBe(now.getTime() / 1000 - 60);
    expect(exp - now.getTime() / 1000).toBeLessThan(600);
  });
});

describe("installationToken", () => {
  it("buys a token with the JWT and caches it", async () => {
    const root = checkout(VALID_ENV);
    const fetch = github();
    const token = await installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: fetch as never });

    expect(token).toEqual({ token: "ghs_fresh", expiresAt: new Date("2026-11-12T11:00:00Z") });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]![1]).toMatchObject({ headers: { Authorization: expect.stringMatching(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/) } });
    expect(JSON.parse(readFileSync(cacheOf(root), "utf8"))).toEqual({
      appId: "1234",
      repo: "Sellest-AI/Cuisko",
      token: "ghs_fresh",
      expiresAt: "2026-11-12T11:00:00.000Z",
    });
  });

  it("does not reuse a token bought by another App or for another repository", async () => {
    const root = checkout(VALID_ENV);
    await installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: github() as never });
    writeFileSync(path.join(root, ".env.local"), VALID_ENV.replace("=1234", "=5678"));
    const fetch = github();
    await installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: fetch as never });
    expect(fetch).toHaveBeenCalledTimes(2);

    const otherRepo = vi.fn(async () => new Response("not installed", { status: 404 }));
    await expect(installationToken({ root, mainRoot: root, repo: "Sellest-AI/Website", now, fetch: otherRepo as never })).rejects.toThrow(/answered 404/);
  });

  it("names a reply that carries no token, and caches nothing", async () => {
    const root = checkout(VALID_ENV);
    const empty = vi.fn(async (url: string) =>
      url.endsWith("/installation") ? new Response(JSON.stringify({ id: 99 })) : new Response(JSON.stringify({}), { status: 201 }),
    );
    await expect(installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: empty as never })).rejects.toThrow(/no token or expiry/);
    expect(existsSync(cacheOf(root))).toBe(false);
  });

  it("uses a fresh cache without a request", async () => {
    const root = checkout(VALID_ENV);
    await installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: github() as never });
    const fetch = github();
    const later = new Date("2026-11-12T10:50:00Z");
    expect((await installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now: later, fetch: fetch as never })).token).toBe("ghs_fresh");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("replaces a cache with less than 5 minutes left", async () => {
    const root = checkout(VALID_ENV);
    await installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: github() as never });
    const fetch = github();
    await installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now: new Date("2026-11-12T10:56:00Z"), fetch: fetch as never });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("treats a corrupt cache as stale", async () => {
    const root = checkout(VALID_ENV);
    await installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: github() as never });
    writeFileSync(cacheOf(root), '{"token": "ghs_cut');
    const fetch = github();
    expect((await installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: fetch as never })).token).toBe("ghs_fresh");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches in the main checkout, read from a worktree", async () => {
    const main = checkout(VALID_ENV);
    const worktree = checkout(null);
    await installationToken({ root: worktree, mainRoot: main, repo: "Sellest-AI/Cuisko", now, fetch: github() as never });
    expect(existsSync(cacheOf(main))).toBe(true);
    expect(existsSync(cacheOf(worktree))).toBe(false);
  });

  it("names a missing variable", async () => {
    const root = checkout("SELLEST_AGENT_APP_ID=1234\n");
    const call = installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: github() as never });
    await expect(call).rejects.toThrow(AppTokenError);
    await expect(call).rejects.toThrow(/SELLEST_AGENT_PRIVATE_KEY missing/);
  });

  it("names a key that is not a PEM", async () => {
    const root = checkout(`SELLEST_AGENT_APP_ID=1234\nSELLEST_AGENT_PRIVATE_KEY=${Buffer.from("not a key").toString("base64")}\n`);
    await expect(installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: github() as never })).rejects.toThrow(/not a PEM key/);
  });

  it("names GitHub's refusal", async () => {
    const root = checkout(VALID_ENV);
    const refused = vi.fn(async () => new Response("Bad credentials", { status: 401 }));
    await expect(installationToken({ root, mainRoot: root, repo: "Sellest-AI/Cuisko", now, fetch: refused as never })).rejects.toThrow(/answered 401/);
    expect(existsSync(cacheOf(root))).toBe(false);
  });
});

describe("repoOf", () => {
  it("reads SSH and HTTPS remotes", () => {
    expect(repoOf("git@github.com:Sellest-AI/Cuisko.git")).toBe("Sellest-AI/Cuisko");
    expect(repoOf("https://github.com/Sellest-AI/Cuisko.git\n")).toBe("Sellest-AI/Cuisko");
    expect(repoOf("https://github.com/Sellest-AI/Cuisko")).toBe("Sellest-AI/Cuisko");
  });

  it("returns null for another host", () => {
    expect(repoOf("git@gitlab.com:someone/thing.git")).toBeNull();
  });
});
