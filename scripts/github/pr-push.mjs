/**
 * pr:push — takes a work branch from local commits to an up-to-date pull request (the plan's §2
 * "pr:push"; ADR 0021 for the dream).
 *
 *   pnpm pr:push
 *
 * 0. refuse: on dev, main, a sync/ branch or a detached HEAD · a dirty tree · no PR file
 *    (.tmp/pr/<branch slug>.md) or a malformed one · the App unavailable
 * 1. fetch origin's base (from the PR file, dev by default) and branch; the lease is origin's sha
 *    of the branch. Refuse when that sha is neither in the local branch nor what pr:push last
 *    pushed (.tmp/github/pushed/<branch slug>): someone else pushed. A local rebase left by a run
 *    that stopped before its push is accepted.
 * 2. git rebase origin/<base>. A conflict: git rebase --abort, stop; the branch is unchanged.
 * 3. memory:update --auto, on top of the base. A failure stops here: nothing is pushed.
 * 4. push: never pushed → push -u · origin's sha in HEAD → plain push · otherwise
 *    --force-with-lease=<branch>:<lease>, the one force-push the project allows. Then HEAD's sha is
 *    recorded for step 1 of the next run.
 * 5. gh:bot pr view <branch>: open → pr edit, else → pr create. The body is the PR file's, with its
 *    "## Memory" section filled by memorySummary.
 *
 * A dream runs several agents for up to 20 minutes each, past a session's Bash timeout: a session
 * runs pr:push in the background and waits for its completion notice.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { gitIn, gitInOrNull, mainRoot } from "../memory/_lib/git.mjs";
import { MEMORIES_PATH } from "../memory/_lib/memoryFiles.mjs";
import { memorySummary } from "../memory/_lib/memorySummary.mjs";
import { AppTokenError } from "./_lib/appToken.mjs";
import { botToken } from "./_lib/botToken.mjs";
import { parsePrFile, PrFileError, renderPrBody } from "./_lib/prFile.mjs";

const UPDATE = fileURLToPath(new URL("../memory/update.mjs", import.meta.url));
const GH_BOT = fileURLToPath(new URL("./gh-bot.mjs", import.meta.url));
const PROTECTED = new Set(["dev", "main"]);

/** A refusal or a stop the agent can act on: printed as is, exit 1. */
export class PrPushError extends Error {
  constructor(message) {
    super(message);
    this.name = "PrPushError";
  }
}

/** `fix/12-eggs` → `fix-12-eggs`: the branch as one file name. */
export const branchSlug = (branch) => branch.replace(/[^A-Za-z0-9._-]+/g, "-");

const _defaultRun = (command, args, cwd) => spawnSync(command, args, { cwd, stdio: "inherit" }).status ?? 1;

const _defaultGh = (args, cwd) => {
  const result = spawnSync(process.execPath, [GH_BOT, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

/** True when `sha` is in HEAD's history: a plain push of HEAD keeps it. */
const _inHead = (top, sha) => gitInOrNull(top, "merge-base", "--is-ancestor", sha, "HEAD") !== null;

const _defaultDream =(cwd) => _defaultRun(process.execPath, [UPDATE, "--auto"], cwd);

const _defaultCheckBot = async (cwd) => {
  await botToken({ cwd });
};

/** Step 0: the branch, the PR file and the App, or a refusal. */
const _preflight = async ({ top, mainTop, checkBot }) => {
  const branch = gitIn(top, "branch", "--show-current");
  if (branch === "") throw new PrPushError("pr:push runs on a work branch, and HEAD is detached. Check out the branch first.");
  if (PROTECTED.has(branch)) throw new PrPushError(`pr:push runs on a work branch, never on ${branch}: a change reaches ${branch} through a PR.`);
  if (branch.startsWith("sync/")) {
    throw new PrPushError(`${branch} is a sync branch: its merge must not be rebased. Merge origin/dev into it and push it plainly.`);
  }

  const dirty = gitIn(top, "status", "--porcelain");
  if (dirty !== "") throw new PrPushError(`The tree has uncommitted changes. Commit or stash them first:\n${dirty}`);

  const slug = branchSlug(branch);
  const prFile = path.join(top, ".tmp", "pr", `${slug}.md`);
  if (!existsSync(prFile)) {
    throw new PrPushError(`No PR file: write ${path.relative(top, prFile).replaceAll("\\", "/")} (a "title:" header, "base: dev", then the body).`);
  }
  const pr = parsePrFile(readFileSync(prFile, "utf8"));

  await checkBot(top);
  return { branch, slug, pr, record: path.join(mainTop, ".tmp", "github", "pushed", slug) };
};

/** Step 1: fetch, and the lease, or a refusal when someone else pushed to the branch. */
const _fetch = ({ top, branch, base, record }) => {
  const remote = gitIn(top, "ls-remote", "--heads", "origin", `refs/heads/${branch}`);
  const refspecs = [`+refs/heads/${base}:refs/remotes/origin/${base}`];
  if (remote !== "") refspecs.push(`+refs/heads/${branch}:refs/remotes/origin/${branch}`);
  gitIn(top, "fetch", "--quiet", "origin", ...refspecs);
  if (remote === "") return null;

  const lease = gitIn(top, "rev-parse", `refs/remotes/origin/${branch}`);
  const contained = _inHead(top, lease);
  const recorded = existsSync(record) ? readFileSync(record, "utf8").trim() : null;
  if (!contained && lease !== recorded) {
    throw new PrPushError(
      [
        `Someone else pushed to ${branch}: origin has ${lease.slice(0, 7)}, which is neither in this branch nor what pr:push last pushed.`,
        `Look at it before anything else: git log HEAD..origin/${branch}`,
      ].join("\n"),
    );
  }
  return lease;
};

/** Step 2: the rebase, aborted on a conflict. */
const _rebase = ({ top, base }) => {
  if (gitInOrNull(top, "rebase", "--quiet", `origin/${base}`) !== null) return;
  const conflicts = (gitInOrNull(top, "diff", "--name-only", "--diff-filter=U") ?? "").split("\n").filter((file) => file !== "");
  gitInOrNull(top, "rebase", "--abort");
  const lines = [`The rebase onto origin/${base} stopped on a conflict, and was aborted: the branch is unchanged, nothing was pushed.`];
  if (conflicts.length > 0) lines.push(`Conflicting files:\n${conflicts.map((file) => `  ${file}`).join("\n")}`);
  if (conflicts.some((file) => file.startsWith(MEMORIES_PATH))) {
    lines.push("A fact conflicts: another PR changed the same fact. Wait until it merges, then decide with the owner which memory commit to drop.");
  }
  throw new PrPushError(lines.join("\n"));
};

/** Step 4: the push, then HEAD's sha recorded. */
const _push = ({ top, branch, lease, record, run }) => {
  const target = `${branch}:refs/heads/${branch}`;
  const args =
    lease === null
      ? ["push", "-u", "origin", target]
      : _inHead(top, lease)
        ?["push", "origin", target]
        : ["push", `--force-with-lease=${branch}:${lease}`, "origin", target];
  if (run("git", args, top) !== 0) {
    throw new PrPushError(
      `git push failed, so the PR was not updated. If the lease refused it, someone pushed to ${branch} since pr:push fetched: rerun pr:push to see it.`,
    );
  }
  mkdirSync(path.dirname(record), { recursive: true });
  writeFileSync(record, `${gitIn(top, "rev-parse", "HEAD")}\n`);
};

/** Step 5: the PR opened or edited, with its Memory section filled. */
const _openPr = ({ top, mainTop, branch, slug, pr, gh }) => {
  const memory = memorySummary({ top, base: `origin/${pr.base}`, head: "HEAD" });
  const bodyFile = path.join(mainTop, ".tmp", "github", "pr-body", `${slug}.md`);
  mkdirSync(path.dirname(bodyFile), { recursive: true });
  writeFileSync(bodyFile, renderPrBody(pr.body, { memory }));

  const view = gh(["pr", "view", branch, "--json", "state", "--jq", ".state"], top);
  if (view.status !== 0 && !/no pull requests? found/i.test(view.stderr)) {
    throw new PrPushError(`The branch is pushed, but gh:bot pr view failed: ${view.stderr.trim()}\nRerun pr:push: it pushes nothing new and opens the PR.`);
  }
  const open = view.status === 0 && view.stdout.trim() === "OPEN";
  const args = open
    ? ["pr", "edit", branch, "--base", pr.base, "--title", pr.title, "--body-file", bodyFile]
    : ["pr", "create", "--base", pr.base, "--head", branch, "--title", pr.title, "--body-file", bodyFile];
  const result = gh(args, top);
  if (result.status !== 0) {
    throw new PrPushError(`The branch is pushed, but gh:bot pr ${args[1]} failed: ${result.stderr.trim()}\nRerun pr:push: it pushes nothing new and ${open ? "edits" : "opens"} the PR.`);
  }
  return { action: open ? "edited" : "created", output: result.stdout.trim() };
};

/**
 * Runs the five steps in the checkout `cwd` is in. `run(command, args, cwd)` runs the push and
 * returns its exit status, `dream(cwd)` runs memory:update --auto, `gh(args, cwd)` runs gh:bot and
 * returns `{ status, stdout, stderr }`, `checkBot(cwd)` throws when the App cannot act: parameters,
 * so a test needs no model and no GitHub.
 */
export const prPush = async ({
  cwd = process.cwd(),
  run = _defaultRun,
  dream = _defaultDream,
  gh = _defaultGh,
  checkBot = _defaultCheckBot,
  log = (line) => console.log(line),
} = {}) => {
  const top = gitIn(cwd, "rev-parse", "--show-toplevel");
  const mainTop = mainRoot(top);
  const { branch, slug, pr, record } = await _preflight({ top, mainTop, checkBot });

  const lease = _fetch({ top, branch, base: pr.base, record });
  _rebase({ top, base: pr.base });

  log(`💭 memory:update --auto on ${branch}…`);
  if (dream(top) !== 0) {
    throw new PrPushError("memory:update --auto failed, so nothing was pushed. Fix what it printed above, then rerun pr:push.");
  }
  if (gitIn(top, "status", "--porcelain") !== "") {
    throw new PrPushError("The dream left the tree dirty, so nothing was pushed. Look at git status, then rerun pr:push.");
  }

  _push({ top, branch, lease, record, run });
  const { action, output } = _openPr({ top, mainTop, branch, slug, pr, gh });
  log(`✅ PR ${action}${output === "" ? "" : `: ${output}`}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await prPush();
  } catch (error) {
    const known = error instanceof PrPushError || error instanceof PrFileError || error instanceof AppTokenError;
    console.error(known ? error.message : `pr:push failed: ${error.message}`);
    process.exitCode = 1;
  }
}
