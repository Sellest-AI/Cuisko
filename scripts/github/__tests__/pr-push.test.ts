/**
 * pr:push rebases, dreams, force-pushes with a lease and opens the PR. Wrong, it overwrites
 * someone's push, pushes a branch whose memory was not dreamed, or leaves a half-rebased branch.
 *
 * Each case uses a throwaway repo with a bare origin and a second clone standing for "someone
 * else". The pushes are real; the dream, gh and the App check are stubs.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../pr-push.mjs";

type GhResult = { status: number; stdout: string; stderr: string };
type Options = {
  cwd: string;
  run: (command: string, args: string[], cwd: string) => number;
  dream: (cwd: string) => number;
  gh: (args: string[], cwd: string) => GhResult;
  checkBot: (cwd: string) => Promise<void>;
  log: (line: string) => void;
};
/** `pr-push.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { prPush } = lib as unknown as { prPush: (options: Options) => Promise<void> };

const BRANCH = "fix/12-eggs";
const TRAILER = "Memory-Update: yes";

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

/** The parent environment without GIT_* (verify runs inside a hook). */
const cleanEnv = () => {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/^GIT_/i.test(name)) delete env[name];
  return env;
};

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", ...args], {
    cwd,
    encoding: "utf8",
    env: cleanEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const write = (dir: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
};

const commit = (dir: string, file: string, text: string, message: string) => {
  write(dir, file, text);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--no-verify", "-m", message);
  return git(dir, "rev-parse", "HEAD");
};

const prFile = (base = "dev") => `---\ntitle: "fix(planning): eggs counted twice"\nbase: ${base}\n---\nFixes #12\n\n## Memory\n(filled by pr:push)\n`;

/** A bare origin holding dev and main, a work clone on BRANCH with one commit and its PR file, and another clone. */
const makeRepos = ({ base = "dev" }: { base?: string } = {}) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pr-push-"));
  created.push(root);
  const origin = path.join(root, "origin.git");
  const work = path.join(root, "work");
  const other = path.join(root, "other");
  git(root, "init", "-q", "--bare", "-b", "dev", origin);
  mkdirSync(work);
  git(work, "init", "-q", "-b", "dev");
  for (const [key, value] of [["user.name", "t"], ["user.email", "t@t"], ["core.autocrlf", "false"]] as const) git(work, "config", key, value);
  write(work, ".gitignore", ".tmp/\n");
  commit(work, "planner.ts", "export const eggs = 2;\n", "feat: base");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "-q", "origin", "dev", "dev:main");
  git(work, "checkout", "-q", "-b", BRANCH, `origin/${base}`);
  commit(work, "planner.ts", "export const eggs = 1;\n", "fix(planning): count eggs once");
  write(work, `.tmp/pr/fix-12-eggs.md`, prFile(base));
  git(root, "clone", "-q", origin, other);
  return { origin, work, other };
};

/** The stubs, and what each was asked. */
const stubs = ({
  prState = null,
  dreamFails = false,
  createFails = false,
  duringDream,
}: { prState?: string | null; dreamFails?: boolean; createFails?: boolean; duringDream?: () => void } = {}) => {
  const calls: string[] = [];
  const pushes: string[][] = [];
  const options = {
    run: (command: string, args: string[], cwd: string) => {
      pushes.push(args);
      calls.push(`${command} ${args[0]}`);
      return spawnSync(command, args, { cwd, env: cleanEnv(), stdio: "pipe" }).status ?? 1;
    },
    dream: (cwd: string) => {
      calls.push("dream");
      duringDream?.();
      if (dreamFails) return 1;
      if (!git(cwd, "log", "-1", "--format=%B").includes(TRAILER)) {
        git(cwd, "commit", "-q", "--no-verify", "--allow-empty", "-m", `chore(memory): update\n\n${TRAILER}`);
      }
      return 0;
    },
    gh: (args: string[]) => {
      calls.push(`gh pr ${args[1]}`);
      if (args[1] === "view") return prState === null ? { status: 1, stdout: "", stderr: "no pull requests found for branch" } : { status: 0, stdout: `${prState}\n`, stderr: "" };
      if (args[1] === "create" && createFails) return { status: 1, stdout: "", stderr: "HTTP 502" };
      return { status: 0, stdout: "https://github.com/Sellest-AI/Cuisko/pull/13\n", stderr: "" };
    },
    checkBot: async () => {},
    log: () => {},
  };
  return { calls, pushes, options };
};

const remoteSha = (repos: { origin: string }, branch = BRANCH) => git(repos.origin, "rev-parse", `refs/heads/${branch}`);

/** Someone else pushes a commit to `branch` on origin, on top of what origin has. */
const pushFromOther = (repos: { other: string }, branch: string, file: string, text: string) => {
  git(repos.other, "fetch", "-q", "origin");
  git(repos.other, "checkout", "-q", "-B", branch, `origin/${branch}`);
  const sha = commit(repos.other, file, text, `chore: from elsewhere on ${branch}`);
  git(repos.other, "push", "-q", "origin", branch);
  return sha;
};

/** A first pr:push that went to the end: the branch is on origin, its sha recorded. */
const pushedOnce = async () => {
  const repos = makeRepos();
  await prPush({ cwd: repos.work, ...stubs().options });
  return repos;
};

describe("pr:push refuses", () => {
  it.each([["dev"], ["main"]])("on %s", async (branch) => {
    const repos = makeRepos();
    git(repos.work, "checkout", "-q", branch);
    const { calls, options } = stubs();
    await expect(prPush({ cwd: repos.work, ...options })).rejects.toThrow(`never on ${branch}`);
    expect(calls).toEqual([]);
  });

  it("on a sync/ branch, and rebases nothing", async () => {
    const repos = makeRepos();
    git(repos.work, "checkout", "-q", "-b", "sync/main-2026-11-12");
    const before = git(repos.work, "rev-parse", "HEAD");
    const { calls, options } = stubs();
    await expect(prPush({ cwd: repos.work, ...options })).rejects.toThrow(/sync branch/);
    expect(git(repos.work, "rev-parse", "HEAD")).toBe(before);
    expect(calls).toEqual([]);
  });

  it("a dirty tree", async () => {
    const repos = makeRepos();
    write(repos.work, "planner.ts", "export const eggs = 3;\n");
    await expect(prPush({ cwd: repos.work, ...stubs().options })).rejects.toThrow(/uncommitted changes/);
  });

  it("a branch with no PR file", async () => {
    const repos = makeRepos();
    rmSync(path.join(repos.work, ".tmp", "pr", "fix-12-eggs.md"));
    await expect(prPush({ cwd: repos.work, ...stubs().options })).rejects.toThrow(/No PR file: write \.tmp\/pr\/fix-12-eggs\.md/);
  });

  it("when the App is unavailable, before anything is fetched", async () => {
    const repos = makeRepos();
    const fetched = git(repos.work, "rev-parse", "refs/remotes/origin/dev");
    pushFromOther(repos, "dev", "README.md", "# Cuisko\n");
    const { calls, options } = stubs();
    const checkBot = async () => {
      throw new Error("GITHUB_APP_ID is missing");
    };
    await expect(prPush({ cwd: repos.work, ...options, checkBot })).rejects.toThrow(/GITHUB_APP_ID/);
    expect(calls).toEqual([]);
    expect(git(repos.work, "rev-parse", "refs/remotes/origin/dev")).toBe(fetched);
  });

  it("when someone else pushed: origin is neither in HEAD nor the recorded sha", async () => {
    const repos = await pushedOnce();
    git(repos.other, "fetch", "-q", "origin");
    git(repos.other, "checkout", "-q", "-B", BRANCH, "origin/dev");
    const theirs = commit(repos.other, "planner.ts", "export const eggs = 5;\n", "fix: theirs");
    git(repos.other, "push", "-q", "--force", "origin", BRANCH);
    const { calls, options } = stubs({ prState: "OPEN" });

    await expect(prPush({ cwd: repos.work, ...options })).rejects.toThrow(/Someone else pushed to fix\/12-eggs/);
    expect(calls).toEqual([]);
    expect(remoteSha(repos)).toBe(theirs);
  });
});

describe("pr:push", () => {
  it("never pushed: rebases, dreams, pushes with -u and creates the PR with its Memory section", async () => {
    const repos = makeRepos();
    const devMoved = pushFromOther(repos, "dev", "README.md", "# Cuisko\n");
    const { calls, pushes, options } = stubs();

    await prPush({ cwd: repos.work, ...options });

    expect(calls).toEqual(["dream", "git push", "gh pr view", "gh pr create"]);
    expect(pushes[0]).toEqual(["push", "-u", "origin", `${BRANCH}:refs/heads/${BRANCH}`]);
    const head = git(repos.work, "rev-parse", "HEAD");
    expect(remoteSha(repos)).toBe(head);
    expect(git(repos.work, "merge-base", "--is-ancestor", devMoved, "HEAD")).toBe("");
    expect(git(repos.work, "log", "-1", "--format=%B")).toContain(TRAILER);
    expect(readFileSync(path.join(repos.work, ".tmp", "github", "pushed", "fix-12-eggs"), "utf8").trim()).toBe(head);
    const body = readFileSync(path.join(repos.work, ".tmp", "github", "pr-body", "fix-12-eggs.md"), "utf8");
    expect(body).toBe("Fixes #12\n\n## Memory\n\nNo fact changed.\n");
  });

  it("dev unchanged: a plain push and the PR edited", async () => {
    const repos = await pushedOnce();
    commit(repos.work, "planner.ts", "export const eggs = 1; // once\n", "fix(planning): review comment");
    const { calls, pushes, options } = stubs({ prState: "OPEN" });

    await prPush({ cwd: repos.work, ...options });

    expect(calls).toEqual(["dream", "git push", "gh pr view", "gh pr edit"]);
    expect(pushes[0]).toEqual(["push", "origin", `${BRANCH}:refs/heads/${BRANCH}`]);
    expect(remoteSha(repos)).toBe(git(repos.work, "rev-parse", "HEAD"));
  });

  it("dev moved after the PR opened: rebases, dreams, pushes with the lease of step 1", async () => {
    const repos = await pushedOnce();
    const lease = remoteSha(repos);
    const devMoved = pushFromOther(repos, "dev", "README.md", "# Cuisko\n");
    const { calls, pushes, options } = stubs({ prState: "OPEN" });

    await prPush({ cwd: repos.work, ...options });

    expect(calls).toEqual(["dream", "git push", "gh pr view", "gh pr edit"]);
    expect(pushes[0]).toEqual(["push", `--force-with-lease=${BRANCH}:${lease}`, "origin", `${BRANCH}:refs/heads/${BRANCH}`]);
    expect(remoteSha(repos)).toBe(git(repos.work, "rev-parse", "HEAD"));
    expect(git(repos.work, "merge-base", "--is-ancestor", devMoved, "HEAD")).toBe("");
  });

  it("origin moved after step 1: the lease refuses, nothing is pushed", async () => {
    const repos = await pushedOnce();
    pushFromOther(repos, "dev", "README.md", "# Cuisko\n");
    let theirs = "";
    const { calls, options } = stubs({
      prState: "OPEN",
      duringDream: () => {
        theirs = pushFromOther(repos, BRANCH, "notes.md", "theirs\n");
      },
    });

    await expect(prPush({ cwd: repos.work, ...options })).rejects.toThrow(/git push failed/);
    expect(calls).toEqual(["dream", "git push"]);
    expect(remoteSha(repos)).toBe(theirs);
  });

  it("a code conflict: the rebase is aborted, the branch unchanged, nothing pushed", async () => {
    const repos = makeRepos();
    pushFromOther(repos, "dev", "planner.ts", "export const eggs = 3;\n");
    const before = git(repos.work, "rev-parse", "HEAD");
    const { calls, options } = stubs();

    await expect(prPush({ cwd: repos.work, ...options })).rejects.toThrow(/aborted: the branch is unchanged[\s\S]*planner\.ts/);
    expect(git(repos.work, "rev-parse", "HEAD")).toBe(before);
    expect(existsSync(path.join(repos.work, ".git", "rebase-merge"))).toBe(false);
    expect(calls).toEqual([]);
  });

  it("a fact another PR changed too: the rebase is aborted, and the message says to wait for that PR", async () => {
    const fact = ".claude/memory/memories/planning/eggs-counted-once-a1b2.md";
    const repos = makeRepos();
    commit(repos.work, fact, "ours\n", "chore(memory): update");
    pushFromOther(repos, "dev", fact, "theirs\n");

    await expect(prPush({ cwd: repos.work, ...stubs().options })).rejects.toThrow(/eggs-counted-once-a1b2\.md[\s\S]*A fact conflicts/);
  });

  it("the dream fails after dev moved: nothing pushed, and a rerun is accepted by step 1 and pushes", async () => {
    const repos = await pushedOnce();
    const lease = remoteSha(repos);
    pushFromOther(repos, "dev", "README.md", "# Cuisko\n");

    await expect(prPush({ cwd: repos.work, ...stubs({ dreamFails: true }).options })).rejects.toThrow(/nothing was pushed/);
    expect(remoteSha(repos)).toBe(lease);

    const { pushes, options } = stubs({ prState: "OPEN" });
    await prPush({ cwd: repos.work, ...options });
    expect(pushes[0]).toEqual(["push", `--force-with-lease=${BRANCH}:${lease}`, "origin", `${BRANCH}:refs/heads/${BRANCH}`]);
    expect(remoteSha(repos)).toBe(git(repos.work, "rev-parse", "HEAD"));
  });

  it("a rerun after a failed pr create: no new commit, the PR created", async () => {
    const repos = makeRepos();
    await expect(prPush({ cwd: repos.work, ...stubs({ createFails: true }).options })).rejects.toThrow(/branch is pushed, but gh:bot pr create failed/);
    const head = git(repos.work, "rev-parse", "HEAD");

    const { calls, options } = stubs();
    await prPush({ cwd: repos.work, ...options });

    expect(git(repos.work, "rev-parse", "HEAD")).toBe(head);
    expect(calls).toEqual(["dream", "git push", "gh pr view", "gh pr create"]);
  });

  it("a hotfix: rebases onto main and opens the PR into main", async () => {
    const repos = makeRepos({ base: "main" });
    const mainMoved = pushFromOther(repos, "main", "hotfix.md", "1\n");
    const args: string[][] = [];
    const { options } = stubs();
    const gh = (ghArgs: string[]) => {
      args.push(ghArgs);
      return options.gh(ghArgs);
    };

    await prPush({ cwd: repos.work, ...options, gh });

    expect(git(repos.work, "merge-base", "--is-ancestor", mainMoved, "HEAD")).toBe("");
    expect(args[1]).toEqual(expect.arrayContaining(["create", "--base", "main", "--head", BRANCH]));
  });
});
