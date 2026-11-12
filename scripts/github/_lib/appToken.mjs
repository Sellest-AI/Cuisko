/**
 * A token that acts on GitHub as the `sellest-agent` App, for Claude sessions on this machine.
 *
 * GitHub's chain: the App's private key signs a JWT (10 minutes at most), the JWT buys an
 * installation token (1 hour), and the installation token does the work — push, comment, open a
 * PR. The key and the App id live in `.env.local`, beside `MEMORY_KEY`:
 *
 *   SELLEST_AGENT_APP_ID=1234567
 *   SELLEST_AGENT_PRIVATE_KEY=<the .pem file, base64-encoded on one line>
 *
 * The token is cached in the main checkout's `.tmp/github/token.json` (git-ignored, shared by every
 * worktree) and reused until 5 minutes before it expires, so most calls cost no request.
 */
import { Buffer } from "node:buffer";
import { createPrivateKey, sign } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readLocalEnv } from "../../_lib/localEnv.mjs";

const API = "https://api.github.com";
/** A token closer than this to its end is treated as expired: a push may outlive the check. */
const MARGIN_MS = 5 * 60 * 1000;
const APP_ID = "SELLEST_AGENT_APP_ID";
const PRIVATE_KEY = "SELLEST_AGENT_PRIVATE_KEY";

/** Why no token: printed as is by the CLIs and the SessionStart line. */
export class AppTokenError extends Error {
  constructor(message) {
    super(message);
    this.name = "AppTokenError";
  }
}

const _base64url = (json) => Buffer.from(JSON.stringify(json)).toString("base64url");

/**
 * The JWT GitHub asks of an App: RS256, issued 60 s in the past (GitHub's advice against clock
 * drift), expiring 9 minutes from now (its cap is 10).
 *
 * @param {{ appId: string, privateKey: string, now: Date }} input `privateKey` is the PEM text
 * @returns {string}
 */
const _appJwt = ({ appId, privateKey, now }) => {
  const seconds = Math.floor(now.getTime() / 1000);
  const header = _base64url({ alg: "RS256", typ: "JWT" });
  const payload = _base64url({ iat: seconds - 60, exp: seconds + 9 * 60, iss: appId });
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), createPrivateKey(privateKey)).toString("base64url");
  return `${header}.${payload}.${signature}`;
};

/** The PEM text from the variable: base64 of the file, as stored, or the PEM itself. */
const _pem = (value) => {
  const pem = value.includes("-----BEGIN") ? value.replace(/\\n/g, "\n") : Buffer.from(value, "base64").toString("utf8");
  if (!pem.includes("-----BEGIN")) throw new AppTokenError(`${PRIVATE_KEY} in .env.local is not a PEM key, nor one encoded in base64`);
  return pem;
};

/** The cached token when it was bought by this App for this repository and has time left. */
const _readCache = (file, { appId, repo, now }) => {
  if (!existsSync(file)) return null;
  try {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    const expiresAt = new Date(cached.expiresAt);
    if (typeof cached.token !== "string" || Number.isNaN(expiresAt.getTime())) return null;
    if (cached.appId !== appId || cached.repo !== repo) return null;
    return expiresAt.getTime() - now.getTime() > MARGIN_MS ? { token: cached.token, expiresAt } : null;
  } catch (error) {
    // A cache cut short by a crash, or edited by hand, is a stale cache: a new token replaces it.
    if (error instanceof SyntaxError) return null;
    throw error;
  }
};

const _writeCache = (file, { appId, repo, value }) => {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify({ appId, repo, token: value.token, expiresAt: value.expiresAt.toISOString() }), { mode: 0o600 });
  chmodSync(temp, 0o600);
  try {
    renameSync(temp, file);
  } catch (error) {
    // Windows refuses the rename while another process reads the cache. The token is good: this
    // call keeps it, and the next purchase writes the cache.
    if (error.code !== "EPERM" && error.code !== "EBUSY") throw error;
    rmSync(temp, { force: true });
  }
};

const _call = async (fetchImpl, url, init, what) => {
  const response = await fetchImpl(url, {
    ...init,
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "cuisko-scripts", ...init.headers },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new AppTokenError(`${what}: GitHub answered ${response.status}${body ? ` (${body.slice(0, 200)})` : ""}`);
  }
  return response.json();
};

/**
 * An installation token for `repo`, from the cache when it has more than 5 minutes left.
 *
 * @param {{ root: string, mainRoot: string, repo: string, now: Date, fetch: typeof fetch }} input
 *   `repo` is `owner/name`; `root` and `mainRoot` locate `.env.local` and the cache
 * @returns {Promise<{ token: string, expiresAt: Date }>}
 */
export const installationToken = async ({ root, mainRoot, repo, now, fetch: fetchImpl }) => {
  const cacheFile = path.join(mainRoot, ".tmp", "github", "token.json");
  const appId = readLocalEnv(APP_ID, { root, mainRoot });
  const cached = _readCache(cacheFile, { appId, repo, now });
  if (cached !== null) return cached;

  const encodedKey = readLocalEnv(PRIVATE_KEY, { root, mainRoot });
  const missing = [appId === null ? APP_ID : null, encodedKey === null ? PRIVATE_KEY : null].filter(Boolean);
  if (missing.length > 0) throw new AppTokenError(`${missing.join(" and ")} missing from .env.local (see docs/external/github.md)`);

  let jwt;
  try {
    jwt = _appJwt({ appId, privateKey: _pem(encodedKey), now });
  } catch (error) {
    if (error instanceof AppTokenError) throw error;
    throw new AppTokenError(`${PRIVATE_KEY} in .env.local cannot sign: ${error.message}`);
  }

  const auth = { Authorization: `Bearer ${jwt}` };
  const installation = await _call(fetchImpl, `${API}/repos/${repo}/installation`, { headers: auth }, `finding the App's installation on ${repo}`);
  const access = await _call(
    fetchImpl,
    `${API}/app/installations/${installation.id}/access_tokens`,
    { method: "POST", headers: auth },
    "creating an installation token",
  );
  const value = { token: access.token, expiresAt: new Date(access.expires_at) };
  if (typeof value.token !== "string" || Number.isNaN(value.expiresAt.getTime())) {
    throw new AppTokenError(`creating an installation token: GitHub's reply has no token or expiry (${JSON.stringify(access).slice(0, 200)})`);
  }
  _writeCache(cacheFile, { appId, repo, value });
  return value;
};

/** `owner/name` from a GitHub remote URL, SSH or HTTPS; null for anything else. */
export const repoOf = (remoteUrl) => {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim());
  return match ? `${match[1]}/${match[2]}` : null;
};
