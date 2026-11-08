/**
 * memory:setup — makes this clone able to read and write the agent memory in .claude/memory/.
 *
 * The memory is encrypted on GitHub by transcrypt. A clone gets ciphertext until transcrypt is
 * configured with the owner's key, which lives in `.env.local` as MEMORY_KEY. This script checks
 * the prerequisites and configures transcrypt once per clone; every worktree shares that config.
 *
 *   node scripts/memory/setup.mjs          by hand: says what it did, exits 1 if something is missing
 *   node scripts/memory/setup.mjs --auto   from `prepare`, so every `pnpm install`
 *
 * `--auto` never fails the install, whatever happens: it exits 0 and prints at most one line, or
 * nothing when every step is already done. It does nothing in CI or on an EAS build (both run
 * `pnpm install` without a key) and outside a git work tree.
 *
 * Only `node:` builtins are imported statically. A static import that fails (a dependency not yet
 * linked, a syntax error in `_lib/`) would exit 1 before any `try` runs and fail `pnpm install`;
 * `_lib` is loaded with a dynamic `import()` inside the `try` instead.
 *
 * transcrypt installs a helper `pre-commit` into `core.hooksPath`, which here is the versioned
 * `.githooks/`: it would leave an untracked `pre-commit-crypt` there on every new machine. The
 * init runs with `core.hooksPath` pointed at `<git common dir>/crypt/hooks` instead, for that one
 * command, through git's GIT_CONFIG_COUNT environment.
 *
 * transcrypt refuses to init on a dirty tree, and an install on a working machine usually is
 * dirty. Its check guards one thing, the forced re-checkout of the encrypted files, so setup runs
 * it with `--force` and refuses by itself when a file under .claude/memory has uncommitted changes.
 *
 * @limitation The key is passed to transcrypt on its command line (`--password`), the only way it
 * takes one non-interactively: it is visible in the process list for the second the init runs.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const TRANSCRYPT_URL = "https://github.com/elasticdog/transcrypt";
const CIPHER = "aes-256-cbc";
const MEMORY_DIR = ".claude/memory";
/** Claude Code's default retention; below it, sessions can be deleted before a dream reads them. */
const RETENTION_DAYS = 30;
const KNOWN_FLAGS = new Set(["--auto"]);

const flags = process.argv.slice(2);
const auto = flags.includes("--auto");

/** `MEMORY_KEY` from a dotenv file, or null when the file or the key is absent or empty. */
const readKey = (file) => {
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?MEMORY_KEY\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const value = match[1].replace(/^(["'])(.*)\1$/, "$2");
    return value === "" ? null : value;
  }
  return null;
};

/** The first file named `name` on PATH, in `~/bin` or in `~/.local/bin`; null when none. */
const findExecutable = (names) => {
  const dirs = [
    ...(process.env.PATH ?? "").split(path.delimiter),
    path.join(os.homedir(), "bin"),
    path.join(os.homedir(), ".local", "bin"),
  ].filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
  }
  return null;
};

/**
 * The bash that runs transcrypt. On Windows `bash` on PATH is usually WSL's, which sees another
 * filesystem and another git; Git for Windows ships its own, three levels above `git --exec-path`.
 */
const findBash = (git) => {
  if (process.platform !== "win32") return "bash";
  const gitRoot = path.resolve(git("--exec-path"), "..", "..", "..");
  const bash = path.join(gitRoot, "bin", "bash.exe");
  return existsSync(bash) ? bash : null;
};

/**
 * A path as Git Bash spells it. transcrypt copies itself into the git dir through its own
 * `realpath`, which treats anything not starting with `/` as relative: `C:/x` breaks it, `/c/x`
 * does not. Elsewhere paths are already POSIX.
 */
const toBashPath = (file) =>
  process.platform === "win32"
    ? file.replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/${drive.toLowerCase()}/`).split("\\").join("/")
    : file;

/** `cleanupPeriodDays` from the user's Claude Code settings; undefined when unset or unreadable. */
const readRetention = () => {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
  const file = path.join(configDir, "settings.json");
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")).cleanupPeriodDays;
  } catch {
    return undefined; // Claude Code refuses an invalid settings file itself; not ours to report.
  }
};

const run = async () => {
  const { git, gitOrNull } = await import("./_lib/git.mjs");

  /** Blocking: the memory cannot work until it is fixed. */
  const missing = [];
  /** Not blocking, but worth a line. */
  const warnings = [];
  /** Steps this run actually performed; empty on a clone already set up. */
  const done = [];

  const unknown = flags.filter((flag) => !KNOWN_FLAGS.has(flag));
  if (unknown.length > 0) return { missing: [`unknown option ${unknown.join(" ")}`], warnings, done };

  if (gitOrNull("rev-parse", "--is-inside-work-tree") !== "true") {
    if (auto) return null; // An unpacked tarball, a CI cache: nothing to set up, nothing to say.
    return { missing: ["run this inside the cuisko git repository"], warnings, done };
  }
  const root = git("rev-parse", "--show-toplevel");
  const commonDir = path.resolve(root, git("rev-parse", "--git-common-dir"));
  // In a worktree `.env.local` may live only in the main checkout, which owns the common dir.
  const key = readKey(path.join(root, ".env.local")) ?? readKey(path.join(path.dirname(commonDir), ".env.local"));

  if (gitOrNull("config", "core.hooksPath") !== ".githooks") {
    git("config", "core.hooksPath", ".githooks");
    done.push("git hooks enabled");
  }

  const configured =
    gitOrNull("config", "--get", "filter.crypt.clean") !== null &&
    existsSync(path.join(commonDir, "crypt", "transcrypt"));
  if (configured) {
    if (key !== null && key !== gitOrNull("config", "--get", "transcrypt.password")) {
      missing.push("MEMORY_KEY in .env.local is not the key this clone was set up with");
    }
  } else if (key === null) {
    missing.push("add MEMORY_KEY to .env.local (see .env.example), then rerun pnpm install");
  } else {
    const transcrypt = findExecutable(["transcrypt"]);
    const bash = transcrypt === null ? null : findBash(git);
    // `--force` skips transcrypt's clean-tree check, which would refuse almost every install on a
    // working machine. What it guards is the re-checkout of the encrypted files, and nothing else:
    // so setup refuses on its own when one of those has uncommitted changes.
    const dirtyMemory = gitOrNull("status", "--porcelain", "--untracked-files=no", "--", MEMORY_DIR);
    if (transcrypt === null) {
      missing.push(`install transcrypt (${TRANSCRYPT_URL}), then rerun pnpm install`);
    } else if (bash === null) {
      missing.push("Git Bash not found next to git; transcrypt needs it");
    } else if (dirtyMemory) {
      missing.push(`commit or stash your changes in ${MEMORY_DIR} first`);
    } else {
      const result = spawnSync(
        bash,
        [toBashPath(transcrypt), `--cipher=${CIPHER}`, `--password=${key}`, "--yes", "--force"],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "core.hooksPath",
            GIT_CONFIG_VALUE_0: toBashPath(path.join(commonDir, "crypt", "hooks")),
          },
        },
      );
      if (result.status === 0) {
        done.push("transcrypt configured, memory decrypted");
      } else {
        const reason = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim().split(/\r?\n/).pop() ?? "";
        missing.push(`transcrypt init failed (${reason || `exit ${result.status}`})`);
      }
    }
  }

  const retention = readRetention();
  if (retention === 0) {
    missing.push(`cleanupPeriodDays is 0 in your Claude Code settings: set it to ${RETENTION_DAYS} or more`);
  } else if (typeof retention === "number" && retention < RETENTION_DAYS) {
    warnings.push(`cleanupPeriodDays is ${retention}: sessions older than that are deleted before a dream reads them`);
  }

  // The dream needs the CLI; `--auto` stays quiet about it so a machine that only builds the app
  // gets no noise on every install.
  if (!auto && findExecutable(["claude", "claude.exe", "claude.cmd"]) === null) {
    missing.push("the claude command is not on PATH; memory:update calls it");
  }

  return { missing, warnings, done };
};

if (auto && (process.env.CI || process.env.EAS_BUILD)) process.exit(0);

try {
  const report = await run();
  if (report === null) process.exit(0);
  const { missing, warnings, done } = report;

  if (auto) {
    const parts = [...missing, ...warnings, ...(missing.length === 0 ? done : [])];
    if (parts.length > 0) console.log(`memory: ${parts.join("; ")}`);
    process.exit(0);
  }

  for (const line of done) console.log(`✓ ${line}`);
  for (const line of warnings) console.log(`! ${line}`);
  for (const line of missing) console.error(`✗ ${line}`);
  if (missing.length === 0 && done.length === 0) console.log("✓ memory already set up");
  process.exit(missing.length > 0 ? 1 : 0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (auto) {
    console.log(`memory setup failed: ${message.split(/\r?\n/)[0]}. Run pnpm memory:setup to see why.`);
    process.exit(0);
  }
  console.error(error);
  process.exit(1);
}
