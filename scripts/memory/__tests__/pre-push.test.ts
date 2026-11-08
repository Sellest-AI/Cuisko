/**
 * The pre-push (spec §8) refuses a push while a finished session has not been read by a dream.
 * Wrongly passing, a lesson is never learned; wrongly blocking, every push needs MEMORY_SKIP.
 *
 * Each case runs the real script in a throwaway repo, with a fake Claude config folder holding
 * the transcripts, and git's stdin written by hand. Dates sit in 2020 so the files' real mtimes
 * (today) are always after setup.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const PRE_PUSH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "pre-push.mjs");
const ZERO = "0".repeat(40);

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

const tempDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), `memory-pre-push-${prefix}-`));
  created.push(dir);
  return dir;
};

/** The parent environment without GIT_* (verify runs inside a hook) and the variables under test. */
const cleanEnv = (extra: Record<string, string>) => {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^GIT_/i.test(name) || /^(MEMORY_SKIP|CLAUDE_CONFIG_DIR)$/i.test(name)) delete env[name];
  }
  return { ...env, ...extra };
};

const git = (cwd: string, args: string[], env: Record<string, string> = {}) => {
  const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    encoding: "utf8",
    env: cleanEnv(env),
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
};

type Stamps = {
  version: 1;
  initializedAt: string;
  lastRun?: { at: string; status: "ok" | "failed"; choice: string | null; commit: string | null };
  sessions: Record<string, { transcript: string; branches: Record<string, { reviewedUntil: string | null }> }>;
};
const STAMPS: Stamps = { version: 1, initializedAt: "2020-01-01T00:00:00.000Z", sessions: {} };

/** A commit on the current branch, with a fixed committer date: the push's reference date. */
const commitAt = (repo: string, date: string) =>
  git(repo, ["commit", "-q", "--no-verify", "--allow-empty", "-m", "work"], { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date });

/** A repo on `dev` with one commit dated 2020-07-01, set-up stamps, and an empty Claude config folder. */
const makeRepo = (stamps: Stamps | string | null = STAMPS) => {
  const repo = tempDir("repo");
  git(repo, ["init", "-q", "-b", "dev"]);
  commitAt(repo, "2020-07-01T12:00:00Z");
  if (stamps !== null) {
    writeFileSync(path.join(repo, ".git", "dream-stamps.json"), typeof stamps === "string" ? stamps : JSON.stringify(stamps));
  }
  return { repo, config: tempDir("config"), sha: git(repo, ["rev-parse", "HEAD"]) };
};

/** One session's transcript, in the project folder Claude Code would give the repo. */
const writeSession = (
  { repo, config }: { repo: string; config: string },
  sessionId: string,
  lines: { branch: string; timestamp: string }[],
) => {
  const folder = path.join(config, "projects", repo.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(folder, { recursive: true });
  const events = lines.map(({ branch, timestamp }, index) =>
    JSON.stringify({
      type: "user",
      uuid: `${sessionId}-${index}`,
      sessionId,
      timestamp,
      cwd: repo,
      gitBranch: branch,
      message: { role: "user", content: "rename the planner" },
    }),
  );
  writeFileSync(path.join(folder, `${sessionId}.jsonl`), `${events.join("\n")}\n`);
};

const push = ({ repo, config }: { repo: string; config: string }, stdin: string, env: Record<string, string> = {}) => {
  const result = spawnSync(process.execPath, [PRE_PUSH], {
    cwd: repo,
    input: stdin,
    encoding: "utf8",
    env: cleanEnv({ CLAUDE_CONFIG_DIR: config, ...env }),
  });
  return { status: result.status, stderr: result.stderr };
};

const pushDev = (setup: { repo: string; config: string; sha: string }, env: Record<string, string> = {}) =>
  push(setup, `refs/heads/dev ${setup.sha} refs/heads/dev ${ZERO}\n`, env);

const UNREAD = [{ branch: "dev", timestamp: "2020-06-01T10:00:00.000Z" }];

describe("pre-push", () => {
  it("passes when no session is unread", () => {
    expect(pushDev(makeRepo())).toEqual({ status: 0, stderr: "" });
  });

  it("blocks on one unread session, naming the ref, the command and the way out", () => {
    const setup = makeRepo();
    writeSession(setup, "s1", UNREAD);
    const result = pushDev(setup);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("💭 1 unread Claude session on dev (no dream yet).");
    expect(result.stderr).toContain("Run:  pnpm memory:update");
    expect(result.stderr).toContain("Then: git push");
    expect(result.stderr).toContain("MEMORY_SKIP=1 git push");
  });

  it("counts sessions, not lines", () => {
    const setup = makeRepo();
    writeSession(setup, "s1", [...UNREAD, { branch: "dev", timestamp: "2020-06-02T10:00:00.000Z" }]);
    writeSession(setup, "s2", UNREAD);
    expect(pushDev(setup).stderr).toContain("2 unread Claude sessions on dev");
  });

  it.each([
    ["a failed dream", { status: "failed", choice: null }, "failed"],
    ["an accepted dream", { status: "ok", choice: "accepted" }, "accepted"],
  ] as const)("names the result of %s", (_name, run, word) => {
    const lastRun = { at: new Date(Date.now() - 3 * 86_400_000).toISOString(), commit: null, ...run };
    const setup = makeRepo({ ...STAMPS, lastRun });
    writeSession(setup, "s1", UNREAD);
    expect(pushDev(setup).stderr).toContain(`(last dream: 3 days ago, ${word}).`);
  });

  it("ignores a tag push and a branch deletion", () => {
    const setup = makeRepo();
    writeSession(setup, "s1", UNREAD);
    const stdin = [`refs/tags/v1 ${setup.sha} refs/tags/v1 ${ZERO}`, `(delete) ${ZERO} refs/heads/old ${setup.sha}`].join("\n");
    expect(push(setup, `${stdin}\n`)).toEqual({ status: 0, stderr: "" });
  });

  it("passes with MEMORY_SKIP=1, saying the sessions wait", () => {
    const setup = makeRepo();
    writeSession(setup, "s1", UNREAD);
    const result = pushDev(setup, { MEMORY_SKIP: "1" });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("MEMORY_SKIP=1");
  });

  it("blocks with the setup command when the stamps are missing", () => {
    const result = pushDev(makeRepo(null));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Run: pnpm memory:setup");
  });

  it("blocks with the reset command when the stamps are invalid", () => {
    const result = pushDev(makeRepo('{"version":1}'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pnpm memory:setup --reset-stamps");
  });

  it("names only the refs with unread sessions", () => {
    const setup = makeRepo();
    git(setup.repo, ["branch", "chore/clean"]);
    commitAt(setup.repo, "2020-07-02T12:00:00Z");
    const dev = git(setup.repo, ["rev-parse", "HEAD"]);
    writeSession(setup, "s1", UNREAD);
    const stdin = [`refs/heads/chore/clean ${setup.sha} refs/heads/chore/clean ${ZERO}`, `refs/heads/dev ${dev} refs/heads/dev ${ZERO}`];
    const result = push(setup, `${stdin.join("\n")}\n`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("💭 1 unread Claude session on dev (");
    expect(result.stderr).not.toContain("chore/clean");
  });

  it("reads a transcript written after its session's stamp", () => {
    const setup = makeRepo({
      ...STAMPS,
      sessions: { s1: { transcript: "s1.jsonl", branches: { dev: { reviewedUntil: "2020-06-01T10:00:00.000Z" } } } },
    });
    writeSession(setup, "s1", [...UNREAD, { branch: "dev", timestamp: "2020-06-20T10:00:00.000Z" }]);
    expect(pushDev(setup).status).toBe(1);
  });

  it("reads a transcript whose session has a pair stamped null (its branch was open)", () => {
    const setup = makeRepo({
      ...STAMPS,
      sessions: {
        s1: {
          transcript: "s1.jsonl",
          branches: { dev: { reviewedUntil: "2099-01-01T00:00:00.000Z" }, "feat/x": { reviewedUntil: null } },
        },
      },
    });
    writeSession(setup, "s1", [{ branch: "feat/x", timestamp: "2020-06-01T10:00:00.000Z" }]);
    expect(pushDev(setup).stderr).toContain("1 unread Claude session on dev");
  });
});
