/**
 * The memory lock (spec §5.3): only memory:update commits memories/ and usage/.
 * Too loose, and a session agent's Bash edit lands unreviewed. Too tight, and the pull of a
 * memory commit made on the other machine is refused, which stops the next dream at U2.
 *
 * Most cases run the lock script alone in a throwaway repo. The last ones run it through the real
 * .githooks chain, copied into that repo with a fake `pnpm` that passes, because the merge cases
 * depend on what git and the hooks hand each other (GIT_HOOK_NAME, MERGE_HEAD in a worktree).
 */
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(SCRIPTS, "..", "..");
const PRE_COMMIT = path.join(SCRIPTS, "pre-commit.mjs");

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

const tempDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), `memory-pre-commit-${prefix}-`));
  created.push(dir);
  return dir;
};

/** The parent environment without what would decide the answer: GIT_* (verify runs inside a hook) and the lock's own variables. */
const cleanEnv = (extra: Record<string, string> = {}) => {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^GIT_/i.test(name) || /^(MEMORY_UPDATE|MEMORY_SKIP)$/i.test(name)) delete env[name];
  }
  return { ...env, ...extra };
};

const run = (command: string, args: string[], cwd: string, env: Record<string, string> = {}) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: cleanEnv(env) });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
};

const git = (cwd: string, ...args: string[]) => {
  const result = run("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], cwd);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
};

const write = (repo: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), text);
};

/** A repo on `dev` with a memory folder (a fact, a usage file, the README) and a source file, committed without hooks. */
const makeRepo = () => {
  const repo = tempDir("repo");
  git(repo, "init", "-q", "-b", "dev");
  write(repo, ".claude/memory/usage/2026-11-01-u1u1.json", "{}\n");
  write(repo, ".claude/memory/README.md", "# rules\n");
  write(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md", "# auth\n");
  write(repo, "src/a.ts", "export {};\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "--no-verify", "-m", "init");
  return repo;
};

const lock = (repo: string, env: Record<string, string> = {}) => run(process.execPath, [PRE_COMMIT], repo, env);

/** Stages a change to `file`. */
const stage = (repo: string, file: string) => {
  write(repo, file, `changed ${file}\n`);
  git(repo, "add", file);
};

describe("the lock script", () => {
  it("refuses a commit staging a memory file, naming it", () => {
    const repo = makeRepo();
    stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    const result = lock(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("the memory is written by pnpm memory:update only");
    expect(result.stderr).toContain("Staged: .claude/memory/memories/auth/tokens-expire-a1b2.md");
  });

  it("refuses a new usage file, and a usage file deleted", () => {
    const added = makeRepo();
    stage(added, ".claude/memory/usage/2026-11-12-x9y8.json");
    expect(lock(added).stderr).toContain("Staged: .claude/memory/usage/2026-11-12-x9y8.json");
    const removed = makeRepo();
    git(removed, "rm", "-q", ".claude/memory/usage/2026-11-01-u1u1.json");
    expect(lock(removed).status).toBe(1);
  });

  it("passes a file of the memory folder outside memories/ and usage/, such as the old index", () => {
    const repo = makeRepo();
    stage(repo, ".claude/memory/index.md");
    expect(lock(repo).status).toBe(0);
  });

  it("refuses a memory file moved out of memories/", () => {
    const repo = makeRepo();
    mkdirSync(path.join(repo, "docs"));
    git(repo, "mv", ".claude/memory/memories/auth/tokens-expire-a1b2.md", "docs/auth.md");
    expect(lock(repo).status).toBe(1);
  });

  it("passes README.md and the files outside the memory", () => {
    const repo = makeRepo();
    stage(repo, ".claude/memory/README.md");
    stage(repo, "src/a.ts");
    expect(lock(repo)).toMatchObject({ status: 0, stderr: "" });
  });

  it("passes a MEMORY_UPDATE=1 commit staging only the memory", () => {
    const repo = makeRepo();
    stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    expect(lock(repo, { MEMORY_UPDATE: "1" }).status).toBe(0);
  });

  it("tells the hook a MEMORY_UPDATE=1 commit stages only the memory, so it runs C20 alone", () => {
    const repo = makeRepo();
    stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    expect(lock(repo, { MEMORY_UPDATE: "1" }).stdout).toBe("memory-only\n");
  });

  it("tells the hook an empty MEMORY_UPDATE=1 commit is memory-only: the dream that read no session", () => {
    const repo = makeRepo();
    expect(lock(repo, { MEMORY_UPDATE: "1" })).toMatchObject({ status: 0, stdout: "memory-only\n" });
  });

  it("tells the hook nothing for any other commit it lets through, so it runs verify", () => {
    const repo = makeRepo();
    stage(repo, "src/a.ts");
    expect(lock(repo).stdout).toBe("");
    stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    expect(lock(repo, { GIT_HOOK_NAME: "pre-merge-commit" }).stdout).toBe("");
  });

  it("refuses a MEMORY_UPDATE=1 commit staging a file outside the memory", () => {
    const repo = makeRepo();
    stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    stage(repo, "src/a.ts");
    const result = lock(repo, { MEMORY_UPDATE: "1" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Staged outside it: src/a.ts");
  });

  it.each(["MERGE_HEAD", "REVERT_HEAD"])("passes while %s exists", (state) => {
    const repo = makeRepo();
    stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    writeFileSync(path.join(repo, ".git", state), `${git(repo, "rev-parse", "HEAD")}\n`);
    expect(lock(repo).status).toBe(0);
  });

  it("passes when pre-merge-commit handed over", () => {
    const repo = makeRepo();
    stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    expect(lock(repo, { GIT_HOOK_NAME: "pre-merge-commit" }).status).toBe(0);
  });

  it("refuses a cherry-pick", () => {
    const repo = makeRepo();
    stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    writeFileSync(path.join(repo, ".git", "CHERRY_PICK_HEAD"), `${git(repo, "rev-parse", "HEAD")}\n`);
    expect(lock(repo).status).toBe(1);
  });

  it("names the pending dream commit when one waits", () => {
    const repo = makeRepo();
    write(repo, ".tmp/memory/dream-20261108-1000/pending.json", "{}");
    stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    const result = lock(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("a dream commit is pending: rerun pnpm memory:update");
  });
});

describe("through the real hooks", () => {
  /**
   * A repo whose hooks are copies of this repo's pre-commit and pre-merge-commit, with the lock
   * script beside them and a `pnpm` that passes, so verify is not run again inside the test.
   */
  const makeHookedRepo = () => {
    const repo = makeRepo();
    for (const hook of ["pre-commit", "pre-merge-commit"]) {
      cpSync(path.join(REPO_ROOT, ".githooks", hook), path.join(repo, ".githooks", hook));
      chmodSync(path.join(repo, ".githooks", hook), 0o755);
    }
    cpSync(PRE_COMMIT, path.join(repo, "scripts", "memory", "pre-commit.mjs"));
    cpSync(path.join(SCRIPTS, "_lib", "git.mjs"), path.join(repo, "scripts", "memory", "_lib", "git.mjs"));
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "--no-verify", "-m", "hooks");
    git(repo, "config", "core.hooksPath", ".githooks");
    return repo;
  };

  const bin = tempDir("bin");
  writeFileSync(path.join(bin, "pnpm"), "#!/bin/sh\nexit 0\n");
  chmodSync(path.join(bin, "pnpm"), 0o755);
  const hookEnv = { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` };
  const commit = (cwd: string, ...args: string[]) =>
    run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", ...args], cwd, hookEnv);
  const merge = (cwd: string, branch: string) =>
    run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "merge", "-q", "--no-edit", branch], cwd, hookEnv);

  /** On dev, a memory commit made the way memory:update makes it. */
  const memoryCommit = (repo: string) => {
    stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    expect(commit(repo, "-m", "chore(memory): update", "--trailer", "Memory-Update: yes").status).not.toBe(0);
    const result = run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "chore(memory): update"], repo, {
      ...hookEnv,
      MEMORY_UPDATE: "1",
    });
    expect(result.status).toBe(0);
  };

  it("refuses a plain commit of a memory file, and passes the clean merge of a memory commit", () => {
    const repo = makeHookedRepo();
    git(repo, "branch", "chore/other");
    memoryCommit(repo);

    git(repo, "switch", "-q", "chore/other");
    stage(repo, "src/a.ts");
    expect(commit(repo, "-m", "chore: other").status).toBe(0);
    const result = merge(repo, "dev");
    expect(result.stderr).not.toContain("Commit refused");
    expect(result.status).toBe(0);
    expect(git(repo, "rev-list", "--count", "--merges", "HEAD")).toBe("1");
  });

  it("passes a conflicted merge of a memory commit in a worktree", () => {
    const repo = makeHookedRepo();
    const worktree = path.join(tempDir("wt"), "wt");
    git(repo, "worktree", "add", "-q", "-b", "chore/wt", worktree);
    memoryCommit(repo);

    write(worktree, ".claude/memory/memories/auth/tokens-expire-a1b2.md", "from the worktree\n");
    git(worktree, "add", ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    git(worktree, "commit", "-q", "--no-verify", "-m", "chore: diverge");
    expect(merge(worktree, "dev").status).not.toBe(0);
    expect(readFileSync(path.join(worktree, ".claude/memory/memories/auth/tokens-expire-a1b2.md"), "utf8")).toContain("<<<<<<<");

    write(worktree, ".claude/memory/memories/auth/tokens-expire-a1b2.md", "resolved\n");
    git(worktree, "add", ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    const result = commit(worktree, "--no-edit");
    expect(result.stderr).not.toContain("Commit refused");
    expect(result.status).toBe(0);
  });

  /**
   * In a worktree git hands the hook GIT_DIR and GIT_INDEX_FILE. Verify's tests run git in
   * throwaway repos: with GIT_DIR inherited, their `git init` reinitialises the committing repo
   * instead, as a bare one, and every checkout of it stops working.
   */
  it("runs verify and the memory check without git's own variables, from a worktree too", () => {
    const repo = makeHookedRepo();
    const worktree = path.join(tempDir("wt-env"), "wt");
    git(repo, "worktree", "add", "-q", "-b", "chore/wt-env", worktree);
    const recorder = tempDir("bin-records-env");
    const seen = path.join(recorder, "seen.txt");
    writeFileSync(path.join(recorder, "pnpm"), `#!/bin/sh\nenv | grep -E '^GIT_(DIR|INDEX_FILE|WORK_TREE|PREFIX)=' >> "${seen.replace(/\\/g, "/")}"\nexit 0\n`);
    chmodSync(path.join(recorder, "pnpm"), 0o755);
    const env = { PATH: `${recorder}${path.delimiter}${process.env.PATH ?? ""}` };

    stage(worktree, "src/a.ts");
    expect(run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "chore: code"], worktree, env).status).toBe(0);
    stage(worktree, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
    expect(run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "chore(memory): update"], worktree, { ...env, MEMORY_UPDATE: "1" }).status).toBe(0);

    expect(readFileSync(seen, "utf8")).toBe("");
  });

  /**
   * A memory:update commit stages only .claude/memory (the lock refuses anything else), so the
   * hook runs the memory check, not the whole verify. The fake `pnpm` fails verify and passes
   * check:memory, so the commit passes only when verify is skipped.
   */
  describe("a memory:update commit", () => {
    const verifyFails = tempDir("bin-verify-fails");
    writeFileSync(
      path.join(verifyFails, "pnpm"),
      '#!/bin/sh\nif [ "$*" = "check:memory" ]; then echo "memory checked"; exit 0; fi\necho "verify ran" >&2\nexit 1\n',
    );
    chmodSync(path.join(verifyFails, "pnpm"), 0o755);
    const env = { PATH: `${verifyFails}${path.delimiter}${process.env.PATH ?? ""}` };
    const commitWith = (repo: string, extra: Record<string, string>) =>
      run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "chore(memory): update"], repo, { ...env, ...extra });

    it("runs the memory check instead of pnpm verify", () => {
      const repo = makeHookedRepo();
      stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
      const result = commitWith(repo, { MEMORY_UPDATE: "1" });
      expect(result.stderr).not.toContain("verify ran");
      // Git hands a hook's stdout to stderr.
      expect(result.stdout + result.stderr).toContain("memory checked");
      expect(result.status).toBe(0);
    });

    it("runs the memory check for a memory file with a non-ASCII name", () => {
      const repo = makeHookedRepo();
      stage(repo, ".claude/memory/memories/auth/café-a1b2.md");
      const result = commitWith(repo, { MEMORY_UPDATE: "1" });
      expect(result.stderr).not.toContain("verify ran");
      expect(result.status).toBe(0);
    });

    it("is refused when the memory check fails", () => {
      const repo = makeHookedRepo();
      const memoryFails = tempDir("bin-memory-fails");
      writeFileSync(path.join(memoryFails, "pnpm"), '#!/bin/sh\necho "C20 failed" >&2\nexit 1\n');
      chmodSync(path.join(memoryFails, "pnpm"), 0o755);
      stage(repo, ".claude/memory/memories/auth/tokens-expire-a1b2.md");
      const result = run("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "chore(memory): update"], repo, {
        PATH: `${memoryFails}${path.delimiter}${process.env.PATH ?? ""}`,
        MEMORY_UPDATE: "1",
      });
      expect(result.stderr).toContain("the memory check failed");
      expect(result.status).not.toBe(0);
    });

    it("still runs pnpm verify for any other commit", () => {
      const repo = makeHookedRepo();
      stage(repo, "src/a.ts");
      const result = commitWith(repo, {});
      expect(result.stderr).toContain("verify ran");
      expect(result.status).not.toBe(0);
    });
  });
});
