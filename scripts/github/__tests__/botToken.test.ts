/**
 * The SessionStart line is the only warning a session gets that it cannot act on GitHub: without
 * it, the first sign is a push refused at the end of a task.
 */
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as lib from "../_lib/botToken.mjs";

/** `botToken.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { identityLine } = lib as unknown as {
  identityLine: (input: { cwd: string; now?: Date; fetch: typeof fetch }) => Promise<string | null>;
};

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const now = new Date("2026-11-12T10:00:00Z");

const dirs: string[] = [];
/** A git repo whose origin is Sellest-AI/Cuisko, with the given .env.local. */
const repo = (env: string | null, origin = "git@github.com:Sellest-AI/Cuisko.git") => {
  const made = mkdtempSync(path.join(os.tmpdir(), "bot-token-"));
  dirs.push(made);
  // A git hook exports GIT_DIR and GIT_INDEX_FILE: with them, these calls would touch the real repo.
  const gitEnv = { ...process.env, GIT_DIR: undefined, GIT_INDEX_FILE: undefined };
  execFileSync("git", ["init", "-q"], { cwd: made, env: gitEnv });
  execFileSync("git", ["remote", "add", "origin", origin], { cwd: made, env: gitEnv });
  if (env !== null) writeFileSync(path.join(made, ".env.local"), env);
  return made;
};
const VALID_ENV = `SELLEST_AGENT_APP_ID=1234\nSELLEST_AGENT_PRIVATE_KEY=${Buffer.from(pem).toString("base64")}\n`;

const github = (status = 200) =>
  vi.fn(async (url: string) => {
    if (status !== 200) return new Response("Bad credentials", { status });
    if (url.endsWith("/installation")) return new Response(JSON.stringify({ id: 7 }));
    return new Response(JSON.stringify({ token: "ghs_ok", expires_at: "2026-11-12T11:00:00Z" }), { status: 201 });
  });

afterEach(() => {
  for (const made of dirs.splice(0)) rmSync(made, { recursive: true, force: true });
});

describe("identityLine", () => {
  it("says nothing when a token comes back", async () => {
    expect(await identityLine({ cwd: repo(VALID_ENV), now, fetch: github() as never })).toBeNull();
  });

  it("names the missing variables when .env.local lacks them", async () => {
    const line = await identityLine({ cwd: repo(null), now, fetch: github() as never });
    expect(line).toMatch(/^GitHub App sellest-agent is not available \(SELLEST_AGENT_APP_ID and SELLEST_AGENT_PRIVATE_KEY missing/);
    expect(line).toMatch(/open no PR until it is fixed\.$/);
  });

  it("names GitHub's refusal", async () => {
    expect(await identityLine({ cwd: repo(VALID_ENV), now, fetch: github(401) as never })).toMatch(/answered 401/);
  });

  it("names an origin that is not on GitHub", async () => {
    expect(await identityLine({ cwd: repo(VALID_ENV, "git@gitlab.com:x/y.git"), now, fetch: github() as never })).toMatch(
      /origin is not a GitHub repository/,
    );
  });

  it("never throws, even outside a repository", async () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), "bot-token-none-"));
    dirs.push(outside);
    expect(await identityLine({ cwd: outside, now, fetch: github() as never })).toMatch(/^GitHub App sellest-agent is not available/);
  });
});
