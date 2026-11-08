/**
 * Claude Code's session transcripts: where they are, what a line holds, and which lines a dream
 * still has to read (spec §6.1–6.3). The pre-push and memory:update both select through `select`,
 * so they always agree on what is unread.
 *
 * A transcript is `<projects dir>/<encoded cwd>/<session id>.jsonl`, one JSON event per line. Its
 * format is internal to Claude Code and undocumented: a line that lacks a field this module needs
 * is skipped, never a crash, so a renamed field means nothing is selected rather than a broken push.
 *
 * Paths are compared after `_normalize`: transcripts written on Windows spell the cwd
 * `C:\Users\…`, git spells the root `C:/Users/…`, and the drive letter's case varies between them.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { gitIn, gitInOrNull } from "./git.mjs";

/** The trailer every memory:update commit carries (spec §9.1 U9); such commits never move the reference date. */
const MEMORY_TRAILER = "^Memory-Update: yes";

/**
 * A path with forward slashes and no trailing slash. A Windows path (it starts with a drive
 * letter) is also lowercased whole: Windows compares paths without case, and the transcripts and
 * git disagree on the drive letter's case.
 */
const _normalize = (file) => {
  const forward = file.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[A-Za-z]:\//.test(forward) ? forward.toLowerCase() : forward;
};

/** True when `file` is `dir` or lies under it; a sibling sharing a prefix (`cuisko-web`) is not. */
const _isUnder = (file, dir) => {
  const inner = _normalize(file);
  const outer = _normalize(dir);
  return inner === outer || inner.startsWith(`${outer}/`);
};

/** How Claude Code names a project folder: every character but a letter or a digit becomes `-`. */
const _encode = (dir) => dir.replace(/[^A-Za-z0-9]/g, "-");

/**
 * True when a session ran under `<root>/.tmp/memory/`: a dream agent, whose transcript the
 * selection drops and whose SessionStart gets no index (the dream gives it what it needs).
 */
export const isDreamCwd = (cwd, root) => _isUnder(cwd, `${root}/.tmp/memory`);

/**
 * Condition 1 of the selection (spec §6.2): the session ran in the repo root or under it, and not
 * under `<root>/.tmp/`, where the dreams run. The read counting applies it too.
 */
export const isRepoCwd = (cwd, root) => _isUnder(cwd, root) && !_isUnder(cwd, `${root}/.tmp`);

/**
 * Every top-level transcript of this repo, absolute paths, sorted. A project folder belongs to the
 * repo when its name starts with the encoded root, without case: the main checkout's folder and
 * one per worktree under .claude/worktrees/. A sibling such as cuisko-web shares the prefix; its
 * lines are dropped later by the cwd test. Subagent transcripts live one level deeper, in the
 * session's own folder, and are not returned.
 */
export const findTranscripts = ({ projectsDir, repoRoot }) => {
  const prefix = _encode(repoRoot).toLowerCase();
  let folders;
  try {
    folders = readdirSync(projectsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return []; // Claude Code never ran on this machine.
    throw error;
  }
  return folders
    .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith(prefix))
    .flatMap((entry) => {
      const folder = path.join(projectsDir, entry.name);
      return readdirSync(folder, { withFileTypes: true })
        .filter((file) => file.isFile() && file.name.endsWith(".jsonl"))
        .map((file) => path.join(folder, file.name));
    })
    .sort();
};

const _isText = (value) => typeof value === "string" && value !== "";

/** Where Claude Code keeps its transcripts: its config folder's `projects/`. */
export const projectsDir = () => path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude"), "projects");

/** One parsed event as a Line, or null when it is not a message or lacks a field. */
const _toLine = (entry, transcript) => {
  if (entry?.type !== "user" && entry?.type !== "assistant") return null;
  // An older Claude Code wrote subagent turns into the parent's file, flagged as a side chain.
  if (entry.isSidechain === true) return null;
  const { uuid, sessionId, timestamp, cwd, gitBranch } = entry;
  if (![uuid, sessionId, timestamp, cwd, gitBranch].every(_isText)) return null;
  if (Number.isNaN(Date.parse(timestamp))) return null;

  const content = entry.message?.content;
  const blocks = typeof content === "string" ? [{ type: "text", text: content }] : content;
  if (!Array.isArray(blocks)) return null;

  // A tool's output comes back as a `user` line; these two fields mark it, and its block type.
  const isToolResult =
    entry.toolUseResult !== undefined ||
    _isText(entry.sourceToolAssistantUUID) ||
    blocks.some((block) => block?.type === "tool_result");
  const text = blocks
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
  const toolCalls = blocks
    .filter((block) => block?.type === "tool_use" && _isText(block.name))
    .map((block) => ({ name: block.name, input: block.input ?? {} }));

  return {
    uuid,
    sessionId,
    timestamp,
    cwd,
    branch: gitBranch,
    role: entry.type,
    isToolResult,
    text: isToolResult ? "" : text,
    // Hook output, command caveats and compaction summaries sit in `user` lines but are not the owner's words.
    isSynthetic: entry.isMeta === true || entry.isCompactSummary === true,
    toolCalls,
    transcript,
  };
};

/**
 * The user and assistant lines of one transcript, in file order. Every other event (attachments,
 * queue operations, the `api-request-blob` lines that repeat message content) is dropped, and so
 * is a line cut short by a crash.
 */
export const readLines = (transcript) => {
  const lines = [];
  for (const raw of readFileSync(transcript, "utf8").split("\n")) {
    if (raw.trim() === "") continue;
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue; // The last line of a transcript whose session was killed mid-write.
    }
    const line = _toLine(entry, transcript);
    if (line !== null) lines.push(line);
  }
  return lines;
};

/**
 * Branches still in progress against a push (spec §6.3): every local branch, except the pushed
 * one, whose tip is not contained in the pushed commit. A branch the check cannot answer for
 * counts as in progress: the worst case is a review postponed, never one skipped.
 */
export const openBranches = ({ pushedSha, pushedRef, cwd = process.cwd() }) => {
  const pushed = pushedRef.replace(/^refs\/heads\//, "");
  const open = new Set();
  for (const ref of gitIn(cwd, "for-each-ref", "--format=%(refname)", "refs/heads").split("\n")) {
    if (ref === "") continue;
    const branch = ref.replace(/^refs\/heads\//, "");
    if (branch === pushed) continue;
    if (gitInOrNull(cwd, "merge-base", "--is-ancestor", ref, pushedSha) === null) open.add(branch);
  }
  return open;
};

/**
 * The newest committer date in the pushed history that is not a memory commit, ISO UTC, or null
 * when every commit is one (spec §6.2 condition 4). A line written after it cannot have shaped the
 * pushed code; the next push reads it.
 */
export const referenceDate = (pushedSha, cwd = process.cwd()) => {
  const date = gitIn(cwd, "log", "-1", "--format=%cI", "--invert-grep", `--grep=${MEMORY_TRAILER}`, pushedSha);
  return date === "" ? null : new Date(date).toISOString();
};

/** The stamp of one (session, branch) pair, or undefined. Own keys only: a branch can be named `constructor`. */
const _reviewedUntil = (stamps, sessionId, branch) => {
  const session = Object.hasOwn(stamps.sessions, sessionId) ? stamps.sessions[sessionId] : undefined;
  if (session === undefined || !Object.hasOwn(session.branches, branch)) return undefined;
  return session.branches[branch].reviewedUntil;
};

/**
 * The lines a dream must still read (spec §6.2), each judged on its own: a session that switched
 * branches midway is split by its lines' branches.
 *
 *   1. its cwd is the repo root or under it, and not under `<root>/.tmp/`
 *   2. its branch is not in `openBranches`
 *   3. it is newer than `initializedAt`, and than its pair's `reviewedUntil` when that is set
 *   4. it is older than `referenceDate`; a null reference selects nothing
 *
 * `repoRoot` is the main checkout's root, which holds every worktree.
 */
export const select = ({ lines, repoRoot, openBranches: open, stamps, referenceDate: reference }) => {
  if (reference === null) return [];
  const before = Date.parse(reference);
  const initialized = Date.parse(stamps.initializedAt);
  return lines.filter((line) => {
    if (!isRepoCwd(line.cwd, repoRoot)) return false;
    if (open.has(line.branch)) return false;
    const at = Date.parse(line.timestamp);
    if (at <= initialized || at >= before) return false;
    const reviewed = _reviewedUntil(stamps, line.sessionId, line.branch);
    return reviewed === undefined || reviewed === null || at > Date.parse(reviewed);
  });
};

/**
 * False when no line of the file can still be unread: it was last written before setup, or every
 * (session, branch) pair of its session was reviewed past that write. A pair with a null stamp (its
 * branch was open) always forces the read. This keeps a push fast as transcripts pile up.
 */
export const mayHoldUnread = (transcript, stamps) => {
  const written = statSync(transcript).mtimeMs;
  if (written < Date.parse(stamps.initializedAt)) return false;
  const sessionId = path.basename(transcript, ".jsonl");
  const session = Object.hasOwn(stamps.sessions, sessionId) ? stamps.sessions[sessionId] : undefined;
  const pairs = session === undefined ? [] : Object.values(session.branches);
  if (pairs.length === 0) return true;
  return pairs.some(({ reviewedUntil }) => reviewedUntil === null || Date.parse(reviewedUntil) < written);
};

/** How many sessions the lines come from (the pre-push message counts sessions, not lines). */
export const countSessions = (lines) => new Set(lines.map((line) => line.sessionId)).size;
