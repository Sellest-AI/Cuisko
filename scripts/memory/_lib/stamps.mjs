/**
 * The dream stamps (spec §7): which (session, branch) pairs a dream has already read, up to when.
 * One file per clone, in the git directory every worktree shares, never versioned: transcripts
 * are per machine, and so is what has been read of them.
 *
 * This module is the only reader and writer. Every read is validated: a hand-edited or truncated
 * file would otherwise select the wrong lines in silence, so it throws with the reset command.
 * Every write is atomic (a temp file, then a rename), so a killed run leaves the old file whole.
 *
 * It also holds the dream lock, beside the stamps: one dream at a time per clone, whichever
 * worktree it runs from.
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { commonDir } from "./git.mjs";

const STAMPS_FILE = "dream-stamps.json";
const LOCK_FILE = "dream.lock";
const RESET_COMMAND = "pnpm memory:setup --reset-stamps";

/** Windows refuses a rename while another process holds the target open: retried this often. */
const RENAME_ATTEMPTS = 5;
const RENAME_PAUSE_MS = 200;

const isoDate = z.iso.datetime({ offset: true });
const outcome = z.enum(["accepted", "edited", "ignored", "nochange"]);

const stampsSchema = z.strictObject({
  version: z.literal(1),
  initializedAt: isoDate,
  readsCountedUntil: isoDate.optional(),
  lastRun: z
    .strictObject({
      at: isoDate,
      status: z.enum(["ok", "failed"]),
      choice: outcome.nullable(),
      commit: z.string().nullable(),
    })
    .optional(),
  sessions: z.record(
    z.string(),
    z.strictObject({
      transcript: z.string(),
      branches: z.record(
        z.string(),
        z.strictObject({ reviewedUntil: isoDate.nullable(), outcome: outcome.optional() }),
      ),
    }),
  ),
});

/** Why the stamps cannot be used: `missing` (setup never ran here) or `invalid`. */
export class StampsError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "StampsError";
    this.kind = kind;
  }
}

/**
 * Older formats, each lifted one version. Version 0 is a file written before the format carried
 * a version: the same fields, without the number.
 */
const MIGRATIONS = {
  0: (stamps) => ({ ...stamps, version: 1 }),
};

const _migrate = (raw) => {
  let stamps = raw;
  let version = stamps?.version ?? 0;
  while (Object.hasOwn(MIGRATIONS, version)) {
    stamps = MIGRATIONS[version](stamps);
    version = stamps.version;
  }
  return stamps;
};

/** `<git common dir>/dream-stamps.json`: shared by every worktree of the clone. */
export const stampsPath = (cwd = process.cwd()) => path.join(commonDir(cwd), STAMPS_FILE);

/** A fresh file's content: every line older than `now` counts as already read (spec §7.6). */
export const createStamps = (now = new Date()) => ({ version: 1, initializedAt: now.toISOString(), sessions: {} });

/** The validated stamps, migrated to the current version. Throws StampsError. */
export const readStamps = (file = stampsPath()) => {
  if (!existsSync(file)) {
    throw new StampsError("missing", "No dream stamps on this machine yet. Run: pnpm memory:setup");
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new StampsError("invalid", `${file} is not valid JSON (${error.message}). Reset it with: ${RESET_COMMAND}`);
  }
  const parsed = stampsSchema.safeParse(_migrate(raw));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    throw new StampsError("invalid", `${file} is invalid: ${problems.join("; ")}. Reset it with: ${RESET_COMMAND}`);
  }
  return parsed.data;
};

const _pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Validates, then writes through a temp file in the same folder and a rename. On EPERM or EBUSY
 * (Windows, while another process reads the file) the rename is retried; if it still fails, the
 * temp file is removed and the error thrown, with the old file untouched. `rename` is injectable
 * for the tests.
 */
export const writeStamps = (stamps, file = stampsPath(), { rename = renameSync } = {}) => {
  const valid = stampsSchema.parse(stamps);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(valid, null, 2)}\n`);
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        rename(temp, file);
        return;
      } catch (error) {
        const busy = error.code === "EPERM" || error.code === "EBUSY";
        if (!busy || attempt === RENAME_ATTEMPTS) throw error;
        _pause(RENAME_PAUSE_MS);
      }
    }
  } finally {
    rmSync(temp, { force: true });
  }
};

/** True when a process with this pid is running. EPERM means it runs under another user. */
const _isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

/**
 * Takes the dream lock, `<git common dir>/dream.lock`, holding this process's pid, and returns the
 * function that releases it. Throws when another live process holds it; a lock left by a dead
 * process (a crash, a closed terminal) is taken over.
 */
export const acquireDreamLock = (dir = commonDir()) => {
  const file = path.join(dir, LOCK_FILE);
  const mine = String(process.pid);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, mine, { flag: "wx" });
      return () => {
        if (existsSync(file) && readFileSync(file, "utf8") === mine) rmSync(file, { force: true });
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const holder = Number.parseInt(readFileSync(file, "utf8"), 10);
    if (Number.isInteger(holder) && _isAlive(holder)) {
      throw new Error(`a dream is already running (pid ${holder})`);
    }
    rmSync(file, { force: true }); // Its process is gone: the lock is stale.
  }
  throw new Error("could not take the dream lock: another dream took it first");
};

/** The later of two ISO dates, either of which may be absent. */
const _later = (a, b) => {
  if (a === null || a === undefined) return b;
  if (b === null || b === undefined) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
};

/** A copy of the pair, created with `reviewedUntil: null` when absent. */
const _pair = (sessions, line) => {
  const session = Object.hasOwn(sessions, line.sessionId)
    ? sessions[line.sessionId]
    : { transcript: line.transcript, branches: {} };
  const branches = { ...session.branches };
  if (!Object.hasOwn(branches, line.branch)) branches[line.branch] = { reviewedUntil: null };
  sessions[line.sessionId] = { ...session, transcript: line.transcript, branches };
  return branches;
};

/**
 * The stamps after a review (spec §7.5), as a new object.
 *
 * - each pair of `selected` moves to its own newest selected line, never back, and takes `outcome`
 * - each pair of `onOpenBranches` (lines dropped only because their branch is in progress) is
 *   created with `reviewedUntil: null` when absent, to keep its transcript known; never reset
 * - `run` becomes `lastRun`; `readsCountedUntil` moves only when given (a memory commit happened)
 */
export const recordReview = (stamps, { selected, onOpenBranches = [], outcome: result, run, readsCountedUntil }) => {
  const sessions = { ...stamps.sessions };
  for (const line of onOpenBranches) _pair(sessions, line);
  for (const line of selected) {
    const branches = _pair(sessions, line);
    const current = branches[line.branch];
    branches[line.branch] = { reviewedUntil: _later(current.reviewedUntil, line.timestamp), outcome: result };
  }
  return {
    ...stamps,
    ...(readsCountedUntil === undefined ? {} : { readsCountedUntil }),
    lastRun: run,
    sessions,
  };
};

/** The stamps without the sessions whose transcript is gone (spec §7.7). */
export const pruneStamps = (stamps, exists = existsSync) => ({
  ...stamps,
  sessions: Object.fromEntries(Object.entries(stamps.sessions).filter(([, session]) => exists(session.transcript))),
});

