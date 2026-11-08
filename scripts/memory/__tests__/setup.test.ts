/**
 * `setup.mjs` runs from `prepare`, so on every `pnpm install`: on the owner's machines, in
 * GitHub Actions, on EAS builds. With `--auto` it must never fail the install, never ask a
 * question, and stay silent once a clone is set up. By hand it must say what is missing and exit 1.
 *
 * Each case runs the real script in a throwaway repository, with a fake home folder and a PATH
 * holding only git, so the machine running the test (its transcrypt, its Claude settings, its CI
 * variables) cannot change the answer. The cases needing a real transcrypt run only where one is
 * installed; CI has none.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SETUP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "setup.mjs");
const KEY = "a-test-key-not-the-real-one";

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

const tempDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), `memory-setup-${prefix}-`));
  created.push(dir);
  return dir;
};

const whichGit = () =>
  execFileSync(process.platform === "win32" ? "where" : "which", ["git"], { encoding: "utf8" })
    .split(/\r?\n/)[0]!
    .trim();
const GIT_DIR = path.dirname(whichGit());

/** The real transcrypt, looked up the way setup does: PATH, then ~/bin and ~/.local/bin. */
const REAL_TRANSCRYPT = [
  ...(process.env.PATH ?? "").split(path.delimiter),
  path.join(os.homedir(), "bin"),
  path.join(os.homedir(), ".local", "bin"),
]
  .filter(Boolean)
  .map((dir) => path.join(dir, "transcrypt"))
  .find((file) => existsSync(file) && statSync(file).isFile());

/**
 * The test's own git calls keep the real PATH: a `git add` runs transcrypt's filter through `sh`,
 * which the reduced PATH lacks when git resolves to Git for Windows' mingw64 binary (the one a
 * hook's PATH finds first). Only the setup runs get the reduced PATH.
 */
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: cleanEnv({ PATH: process.env.PATH ?? "" }),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

/**
 * The parent environment without what would leak into the run: CI flags, Claude's config folder,
 * and GIT_* variables (verify runs inside the pre-commit hook, which sets GIT_INDEX_FILE).
 */
function cleanEnv(extra: Record<string, string>) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^(CI|EAS_BUILD|CLAUDE_CONFIG_DIR|PATH|HOME|USERPROFILE)$/i.test(name) || /^GIT_/i.test(name)) delete env[name];
  }
  return { ...env, PATH: GIT_DIR, ...extra };
}

/** A git repository with one empty commit; `.env.local` holds the key unless `key` is null. */
const makeRepo = ({ key = KEY as string | null } = {}) => {
  const repo = tempDir("repo");
  git(repo, "init", "-q");
  git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "--allow-empty", "-m", "init");
  if (key !== null) writeFileSync(path.join(repo, ".env.local"), `OTHER=1\nMEMORY_KEY=${key}\n`);
  return repo;
};

/** Marks a repo as already set up, the way a finished transcrypt init leaves it. */
const fakeConfigured = (repo: string, key = KEY) => {
  git(repo, "config", "core.hooksPath", ".githooks");
  git(repo, "config", "filter.crypt.clean", "transcrypt clean");
  git(repo, "config", "transcrypt.password", key);
  mkdirSync(path.join(repo, ".git", "crypt"), { recursive: true });
  writeFileSync(path.join(repo, ".git", "crypt", "transcrypt"), "#!/bin/sh\n");
};

const runSetup = (
  cwd: string,
  { args = ["--auto"], env = {}, home = tempDir("home"), script = SETUP } = {} as {
    args?: string[];
    env?: Record<string, string>;
    home?: string;
    script?: string;
  },
) => {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: cleanEnv({ HOME: home, USERPROFILE: home, ...env }),
  });
  const output = `${result.stdout}${result.stderr}`
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "" && !/deprecated key derivation|pbkdf2 would be better/.test(line));
  return { code: result.status, output };
};

const homeWithRetention = (days: number) => {
  const home = tempDir("home");
  mkdirSync(path.join(home, ".claude"));
  writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ cleanupPeriodDays: days }));
  return home;
};

describe("setup --auto: never fails the install", () => {
  it("does nothing in CI", () => {
    const repo = makeRepo({ key: null });
    expect(runSetup(repo, { env: { CI: "true" } })).toEqual({ code: 0, output: [] });
    expect(() => git(repo, "config", "core.hooksPath")).toThrow(); // untouched
  });

  it("does nothing on an EAS build", () => {
    const repo = makeRepo({ key: null });
    expect(runSetup(repo, { env: { EAS_BUILD: "true" } })).toEqual({ code: 0, output: [] });
  });

  it("does nothing outside a git work tree", () => {
    expect(runSetup(tempDir("plain"))).toEqual({ code: 0, output: [] });
  });

  it("names the missing key in one line, and still enables the hooks", () => {
    const repo = makeRepo({ key: null });
    const { code, output } = runSetup(repo);
    expect(code).toBe(0);
    expect(output).toHaveLength(1);
    expect(output[0]).toMatch(/^memory: add MEMORY_KEY to \.env\.local/);
    expect(git(repo, "config", "core.hooksPath")).toBe(".githooks");
  });

  it("names a missing transcrypt in one line", () => {
    const { code, output } = runSetup(makeRepo());
    expect(code).toBe(0);
    expect(output).toHaveLength(1);
    expect(output[0]).toMatch(/^memory: install transcrypt \(https:/);
  });

  it("turns a thrown error into one line", () => {
    const repo = makeRepo({ key: null });
    mkdirSync(path.join(repo, ".env.local")); // reading it throws EISDIR
    const { code, output } = runSetup(repo);
    expect(code).toBe(0);
    expect(output).toHaveLength(1);
    expect(output[0]).toMatch(/^memory setup failed: .*Run pnpm memory:setup to see why\.$/);
  });

  it("survives a _lib module that throws at import", () => {
    const copy = tempDir("copy");
    const script = path.join(copy, "setup.mjs");
    cpSync(SETUP, script);
    mkdirSync(path.join(copy, "_lib"));
    writeFileSync(path.join(copy, "_lib", "git.mjs"), 'throw new Error("broken at import");\n');
    const { code, output } = runSetup(makeRepo(), { script });
    expect(code).toBe(0);
    expect(output).toEqual(["memory setup failed: broken at import. Run pnpm memory:setup to see why."]);
  });

  it("is silent on a clone already set up", () => {
    const repo = makeRepo();
    fakeConfigured(repo);
    expect(runSetup(repo)).toEqual({ code: 0, output: [] });
  });

  it("reads the key from the main checkout when a worktree has none", () => {
    const repo = makeRepo();
    fakeConfigured(repo, "another-key");
    const worktree = path.join(repo, "wt");
    git(repo, "worktree", "add", "-q", "--detach", worktree);
    const { output } = runSetup(worktree);
    expect(output).toEqual(["memory: MEMORY_KEY in .env.local is not the key this clone was set up with"]);
  });

  it("says when .env.local holds another key than the configured one", () => {
    const repo = makeRepo();
    fakeConfigured(repo, "another-key");
    expect(runSetup(repo).output).toEqual([
      "memory: MEMORY_KEY in .env.local is not the key this clone was set up with",
    ]);
  });

  it("refuses a transcript retention of 0", () => {
    const repo = makeRepo();
    fakeConfigured(repo);
    const { code, output } = runSetup(repo, { home: homeWithRetention(0) });
    expect(code).toBe(0);
    expect(output).toEqual([
      "memory: cleanupPeriodDays is 0 in your Claude Code settings: set it to 30 or more",
    ]);
  });

  it("warns about a retention under 30 days", () => {
    const repo = makeRepo();
    fakeConfigured(repo);
    expect(runSetup(repo, { home: homeWithRetention(10) }).output).toEqual([
      "memory: cleanupPeriodDays is 10: sessions older than that are deleted before a dream reads them",
    ]);
  });

  it("refuses an unknown option in one line", () => {
    const repo = makeRepo();
    fakeConfigured(repo);
    expect(runSetup(repo, { args: ["--auto", "--reset-stamps"] })).toEqual({
      code: 0,
      output: ["memory: unknown option --reset-stamps"],
    });
  });
});

describe("setup by hand: loud", () => {
  it("exits 1 when the key is missing", () => {
    const { code, output } = runSetup(makeRepo({ key: null }), { args: [] });
    expect(code).toBe(1);
    expect(output).toContain("✗ add MEMORY_KEY to .env.local (see .env.example), then rerun pnpm install");
  });

  it("exits 1 on a retention of 0", () => {
    const repo = makeRepo();
    fakeConfigured(repo);
    const { code } = runSetup(repo, { args: [], home: homeWithRetention(0) });
    expect(code).toBe(1);
  });
});

describe.skipIf(REAL_TRANSCRYPT === undefined)("setup with a real transcrypt", () => {
  const withTranscrypt = () => ({ PATH: [GIT_DIR, path.dirname(REAL_TRANSCRYPT!)].join(path.delimiter) });
  const MEMORY_FILE = ".claude/memory/memories/probe.md";

  /** A repo whose .gitattributes encrypts the memory files, as this repository's does. */
  const makeMemoryRepo = () => {
    const repo = makeRepo();
    const attributes = readFileSync(path.resolve(path.dirname(SETUP), "..", "..", ".gitattributes"), "utf8");
    writeFileSync(path.join(repo, ".gitattributes"), attributes);
    git(repo, "add", ".gitattributes");
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "attributes");
    return repo;
  };

  it(
    "configures transcrypt on a dirty tree, encrypts a memory file, and keeps .githooks clean",
    () => {
      const repo = makeMemoryRepo();
      writeFileSync(path.join(repo, "unrelated.txt"), "work in progress\n"); // a dirty tree
      git(repo, "add", "unrelated.txt");
      // An untracked memory file: transcrypt's re-checkout never touches it, so it must not block.
      mkdirSync(path.join(repo, ".claude", "memory", "memories"), { recursive: true });
      writeFileSync(path.join(repo, ".claude", "memory", "memories", "early.md"), "drafted before setup\n");

      const first = runSetup(repo, { env: withTranscrypt() });
      expect(first).toEqual({ code: 0, output: ["memory: git hooks enabled; transcrypt configured, memory decrypted"] });
      expect(existsSync(path.join(repo, ".githooks"))).toBe(false);

      mkdirSync(path.join(repo, ".claude", "memory", "memories"), { recursive: true });
      writeFileSync(path.join(repo, MEMORY_FILE), "a fact\n");
      git(repo, "add", MEMORY_FILE);
      expect(git(repo, "show", `:${MEMORY_FILE}`)).toMatch(/^U2FsdGVkX1/);

      expect(runSetup(repo, { env: withTranscrypt() })).toEqual({ code: 0, output: [] });
    },
    60_000,
  );

  it(
    "refuses when a tracked memory file has uncommitted changes",
    () => {
      const repo = makeMemoryRepo();
      mkdirSync(path.join(repo, ".claude", "memory", "memories"), { recursive: true });
      // Committed as ciphertext, the way a clone without the key receives it.
      writeFileSync(path.join(repo, MEMORY_FILE), "U2FsdGVkX1+committed\n");
      git(repo, "add", MEMORY_FILE);
      git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "memory");

      writeFileSync(path.join(repo, MEMORY_FILE), "unsaved\n");
      const { code, output } = runSetup(repo, { env: withTranscrypt() });
      expect(code).toBe(0);
      expect(output).toEqual(["memory: commit or stash your changes in .claude/memory first"]);
      expect(() => git(repo, "config", "filter.crypt.clean")).toThrow();
    },
    60_000,
  );
});
