/**
 * The pre-push check (spec §8): a push is refused while a finished Claude session on this repo
 * has not been read by a dream. Fast, deterministic, no model, no question.
 *
 *   1. read the pushed refs from stdin, as git writes them: `<local ref> <local sha> <remote ref> <remote sha>`
 *   2. keep branch pushes; drop tags and branch deletions (an all-zero local sha)
 *   3. MEMORY_SKIP=1 passes, with a reminder (spec §8.3); so does a clone whose memory is still
 *      encrypted, with a warning that the dream is skipped
 *   4. missing or invalid stamps block, with the setup or reset command
 *   5–6. per pushed ref: the open branches and the reference date from its sha, then `select`
 *   7. nothing selected passes
 *   8. otherwise block, naming each ref and its count of unread sessions (§8.2's message)
 *
 * A transcript is not read at all when `mayHoldUnread` says nothing in it can be unread.
 *
 * Any other failure blocks too, with MEMORY_SKIP named: the worst case is a postponed review,
 * never a silent one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { gitOrNull, mainRoot } from "./_lib/git.mjs";
import { isEncrypted, readFacts } from "./_lib/memoryFiles.mjs";
import { readStamps, StampsError, stampsPath } from "./_lib/stamps.mjs";
import { countSessions, findTranscripts, mayHoldUnread, openBranches, projectsDir, readLines, referenceDate, select } from "./_lib/transcripts.mjs";

const ZERO_SHA = /^0+$/;
const UPDATE_COMMAND = "pnpm memory:update";
const SETUP_COMMAND = "pnpm memory:setup";
const SKIP_HINT = "(If the dream cannot run: MEMORY_SKIP=1 git push)";
const MEMORY_DIR = path.join(".claude", "memory");

/**
 * True when this clone holds the facts as transcrypt ciphertext (no key: a contributor, a fresh
 * clone). The dream cannot run there, so blocking would only force MEMORY_SKIP on every push.
 * `usage/` is never encrypted and says nothing. No fact (a branch older than the memory) is not
 * encrypted: the usual check runs.
 */
const _memoryEncrypted = () => {
  const { facts } = readFacts(path.join(gitOrNull("rev-parse", "--show-toplevel") ?? process.cwd(), MEMORY_DIR));
  return facts.some((fact) => isEncrypted(fact.text));
};

/** The branch pushes git announced. `HEAD:dev` arrives with `HEAD` as the local ref: the remote one names the branch then. */
const _pushedBranches = (input) =>
  input
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields.length === 4)
    .map(([localRef, localSha, remoteRef]) => ({ localRef, localSha, remoteRef }))
    .filter(({ localSha, remoteRef }) => remoteRef.startsWith("refs/heads/") && !ZERO_SHA.test(localSha))
    .map(({ localRef, localSha, remoteRef }) => ({
      ref: localRef.startsWith("refs/heads/") ? localRef : remoteRef,
      sha: localSha,
    }));

/** "3 days ago", "1 hour ago", "just now". */
const _ago = (at, now = Date.now()) => {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  const [count, unit] =
    minutes >= 1440 ? [Math.floor(minutes / 1440), "day"] : minutes >= 60 ? [Math.floor(minutes / 60), "hour"] : [minutes, "minute"];
  if (count < 1) return "just now";
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
};

const _lastDream = (stamps) => {
  if (stamps.lastRun === undefined) return "no dream yet";
  const result = stamps.lastRun.status === "failed" ? "failed" : (stamps.lastRun.choice ?? "ok");
  return `last dream: ${_ago(stamps.lastRun.at)}, ${result}`;
};

const _block = (lines) => {
  process.stderr.write(`${lines.join("\n")}\n`);
  process.exit(1);
};

const _check = () => {
  const pushed = _pushedBranches(readFileSync(0, "utf8"));
  if (pushed.length === 0) return;

  if (process.env.MEMORY_SKIP === "1") {
    process.stderr.write(`💭 MEMORY_SKIP=1: the push passes; unread sessions wait for the next ${UPDATE_COMMAND}.\n`);
    return;
  }

  if (_memoryEncrypted()) {
    process.stderr.write(
      `⚠️ 💭 The memory is encrypted on this clone: dream skipped, the push passes.\n   To read and update the memory here: ${SETUP_COMMAND}\n`,
    );
    return;
  }

  let stamps;
  try {
    stamps = readStamps(stampsPath());
  } catch (error) {
    if (!(error instanceof StampsError)) throw error;
    _block([`💭 Push refused: ${error.message}`, `   ${SKIP_HINT}`]);
  }

  const repoRoot = mainRoot();
  const lines = findTranscripts({ projectsDir: projectsDir(), repoRoot })
    .filter((transcript) => mayHoldUnread(transcript, stamps))
    .flatMap(readLines);

  const unread = pushed
    .map(({ ref, sha }) => ({
      branch: ref.replace(/^refs\/heads\//, ""),
      sessions: countSessions(
        select({
          lines,
          repoRoot,
          openBranches: openBranches({ pushedSha: sha, pushedRef: ref }),
          stamps,
          referenceDate: referenceDate(sha),
        }),
      ),
    }))
    .filter(({ sessions }) => sessions > 0);
  if (unread.length === 0) return;

  const counts = unread
    .map(({ branch, sessions }) => `${sessions} unread Claude session${sessions === 1 ? "" : "s"} on ${branch}`)
    .join(", ");
  _block([
    `💭 ${counts} (${_lastDream(stamps)}).`,
    `   Run:  ${UPDATE_COMMAND}${unread.length > 1 ? " (on each of these branches)" : ""}`,
    "   Then: git push",
    "   On dev, one command does both: pnpm push:dev",
    `   ${SKIP_HINT}`,
  ]);
};

try {
  _check();
} catch (error) {
  _block([`💭 Push refused: the memory check failed: ${error.message}`, `   ${SKIP_HINT}`]);
}
