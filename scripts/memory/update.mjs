/**
 * memory:update — reads the Claude sessions no dream has read, lets models propose changes to the
 * agent memory, shows the owner the diff, and commits what the owner accepts (spec §9, §10).
 *
 *   pnpm memory:update              the whole dream, U1–U11
 *   pnpm memory:update --dry-run    U1 and U3–U7: show the diff, change nothing, write no stamps
 *   pnpm memory:update --reindex    bring usage.json and index.md in line with memories/ after a
 *                                   hand-written file; no pull, no dream, no commit, no stamps
 *
 * U1  refuse unless the branch, the memory, the stamps and the claude command are in order; take
 *     the dream lock; finish a pending commit if one is waiting
 * U2  git pull (not in --dry-run: a pull cannot be undone)
 * U3  select the unread lines; none: "Nothing to read", and nothing changes
 * U4  make .tmp/memory/dream-<stamp>/, copy the memory into it, count the reads and the sessions
 *     since each file's last read, refresh the index
 * U5  P2–P6 (dream.mjs) on the copy
 * U6  the repo's memory is made equal to the copy only when the owner accepts — deviation from the
 *     spec's order: the diff is taken between the repo and the copy, so nothing needs undoing
 * U7  show the diff, the ranking changes and every alert, and the candidates the planner left out;
 *     no change in memories/ is "nochange", and still shows that report
 * U8  [o] accept · [m] modify (an instruction, or :e to edit by hand; the checks run again) ·
 *     [i] ignore (stamps written, nothing kept) · [a] abort (nothing written)
 * U9  git commit limited to .claude/memory, with MEMORY_UPDATE=1 and the trailer Memory-Update: yes
 *     (the hook output shows as one progress line, in full only when the commit is refused)
 * U10 stamps: each pair reviewed up to its newest selected line; readsCountedUntil only when a
 *     commit was made (the reads are counted again otherwise); sessions with no transcript pruned
 * U11 remove the dream folder
 *
 * Any failure keeps the dream folder (its logs/ say why), writes lastRun failed and nothing else.
 * A refused U9 commit keeps pending.json, so the next run finishes U9–U11 without a model.
 *
 * P1–P7 live in _lib/dream.mjs: P1 is U3 and U4, P2 the extractors, P3 the planner, P4 the writers,
 * P5 check C20 --full, P6 the reviewer, P7 the owner's choice. Spec sections are named in each
 * _lib module's docblock.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { correct, dream } from "./_lib/dream.mjs";
import { commonDir, gitIn, gitInOrNull, mainRoot } from "./_lib/git.mjs";
import { compareMemories, copyMemory, mirrorMemory, refreshIndex } from "./_lib/memoryDir.mjs";
import { isEncrypted, readMemoryFiles } from "./_lib/memoryFiles.mjs";
import { dreamDirs, findPending, pairsOf, writePending } from "./_lib/pending.mjs";
import { ownerIdentity } from "./_lib/pii.mjs";
import { formatReport, formatSummary, memoryDiff, rankingChanges } from "./_lib/review.mjs";
import { droppedCandidates } from "./_lib/responses.mjs";
import { runAgent } from "./_lib/runAgent.mjs";
import { acquireDreamLock, pruneStamps, readStamps, recordReview, StampsError, stampsPath, writeStamps } from "./_lib/stamps.mjs";
import { countSessions, findTranscripts, mayHoldUnread, openBranches, projectsDir, readLines, referenceDate, select } from "./_lib/transcripts.mjs";
import { applyReads, applySessions, countReads, sessionStarts } from "./_lib/usage.mjs";
import { createSteps } from "./_lib/steps.mjs";
import { createLastLine, formatHookStatus } from "./_lib/hookStatus.mjs";

const MEMORY = ".claude/memory";
const TMP = ".tmp/memory";
const CHECK = fileURLToPath(new URL("../checks/c20-memory-integrity.mjs", import.meta.url));

/** A refusal the owner can act on: printed as is, exit 1. */
class UpdateError extends Error {
  constructor(message) {
    super(message);
    this.name = "UpdateError";
  }
}

const _arguments = (argv) => {
  const known = new Set(["--dry-run", "--reindex"]);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length > 0) throw new UpdateError(`unknown argument ${unknown[0]}. Usage: pnpm memory:update [--dry-run | --reindex]`);
  if (argv.includes("--dry-run") && argv.includes("--reindex")) throw new UpdateError("--dry-run and --reindex cannot go together");
  return { dryRun: argv.includes("--dry-run"), reindex: argv.includes("--reindex") };
};

/** C20 on a memory folder, as P5 and --reindex need it. */
const _runCheck = ({ top, memoryDir, full, now }) => {
  const args = [CHECK, "--memory-dir", memoryDir, ...(full ? ["--full", "--now", now.toISOString()] : [])];
  const run = spawnSync(process.execPath, args, { cwd: top, encoding: "utf8", env: { ...process.env, CHECK_ROOT: top } });
  return { ok: run.status === 0, output: `${run.stdout ?? ""}${run.stderr ?? ""}` };
};

const _hasClaude = () => spawnSync("claude", ["--version"], { stdio: "ignore" }).status === 0;

const _plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const _commitMessage = ({ sessions, changes }) =>
  [
    `chore(memory): update after ${_plural(sessions, "session")}`,
    "",
    ...changes.created.map((file) => `- creates ${file}`),
    ...changes.modified.map((file) => `- modifies ${file}`),
    ...changes.deleted.map((file) => `- deletes ${file}`),
    "",
    "Memory-Update: yes",
    "",
  ].join("\n");

/** Puts `.claude/memory` back to HEAD: what U9 changed and a refused commit left behind. */
const _restoreMemory = (top) => {
  gitInOrNull(top, "reset", "-q", "HEAD", "--", MEMORY);
  gitInOrNull(top, "checkout", "--", MEMORY);
  gitInOrNull(top, "clean", "-fdq", "--", MEMORY);
};

/** U9: the repo's memory becomes the copy's, committed alone. Returns the commit's sha, or null when git refused. */
const _commit = async ({ top, dreamDir, memoryDir, message, io }) => {
  mirrorMemory(path.join(dreamDir, "memory"), memoryDir);
  gitIn(top, "add", "-A", "--", MEMORY);
  const messageFile = path.join(dreamDir, "commit-message.txt");
  writeFileSync(messageFile, message);
  io.out("Committing the memory (the pre-commit checks it)...");
  const run = await _runShowingStatus({ top, args: ["commit", "-F", messageFile, "--", MEMORY], io });
  if (run.status !== 0) {
    io.err(run.output.trimEnd());
    _restoreMemory(top);
    return null;
  }
  return gitIn(top, "rev-parse", "HEAD");
};

/**
 * Runs `git <args>` with its output kept, not shown: the owner sees one status line with the last
 * line printed. The caller prints `output` when the run failed.
 */
const _runShowingStatus = ({ top, args, io }) =>
  new Promise((resolve, reject) => {
    const lastLine = createLastLine();
    let output = "";
    // The output is read from a pipe, so the tools would drop their colours: kept for a failure the owner reads.
    const child = spawn("git", args, { cwd: top, env: { ...process.env, MEMORY_UPDATE: "1", ...(io.color ? { FORCE_COLOR: "1" } : {}) } });
    const read = (chunk) => {
      const text = chunk.toString();
      output += text;
      lastLine.push(text);
      io.status?.(formatHookStatus(lastLine.state()));
    };
    io.status?.(formatHookStatus(lastLine.state()));
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("error", (error) => {
      io.status?.(null);
      reject(error);
    });
    child.on("close", (status) => {
      lastLine.end();
      io.status?.(null);
      resolve({ status, output });
    });
  });

/** U10: the stamps after a review. */
const _stamp = ({ stampsFile, selected, onOpenBranches, outcome, commit, readsCountedUntil, at }) => {
  const stamps = readStamps(stampsFile);
  const next = recordReview(stamps, {
    selected,
    onOpenBranches,
    outcome,
    run: { at, status: "ok", choice: outcome, commit },
    readsCountedUntil: commit === null ? undefined : readsCountedUntil,
  });
  writeStamps(pruneStamps(next), stampsFile);
};

const _markFailed = (stampsFile, at) => {
  try {
    writeStamps({ ...readStamps(stampsFile), lastRun: { at, status: "failed", choice: null, commit: null } }, stampsFile);
  } catch {
    // The stamps are what failed (missing or invalid): the error already printed says so.
  }
};

/** U1 — the refusals. Returns the facts the later steps use. */
const _preflight = ({ top, hasClaude, io }) => {
  const branch = gitInOrNull(top, "symbolic-ref", "--short", "-q", "HEAD");
  if (!branch) throw new UpdateError("HEAD is detached. Switch to the branch you are about to push, then run this again.");
  const memoryDir = path.join(top, MEMORY);
  const index = path.join(memoryDir, "index.md");
  if (!existsSync(index)) throw new UpdateError(`There is no memory here (${MEMORY}/index.md is missing). Is this branch older than the memory? Merge dev into it.`);
  if (isEncrypted(readFileSync(index, "utf8"))) throw new UpdateError("The memory is still encrypted on this clone. Run: pnpm memory:setup");
  const stampsFile = stampsPath(top);
  try {
    readStamps(stampsFile);
  } catch (error) {
    if (error instanceof StampsError) throw new UpdateError(error.message);
    throw error;
  }
  if (!hasClaude()) throw new UpdateError("The claude command is not available. Install Claude Code and make sure `claude --version` works.");
  io.out(`Branch ${branch}.`);
  return { branch, memoryDir, stampsFile };
};

/** The memory must be clean: what a dream changes must be the dream's alone. */
const _requireCleanMemory = (top) => {
  if (gitIn(top, "status", "--porcelain", "--", MEMORY) !== "") {
    throw new UpdateError(`${MEMORY} has uncommitted changes. Commit or discard them, then run this again. (For a hand-written memory file: pnpm memory:update --reindex.)`);
  }
};

/** U2. */
const _pull = ({ top, io }) => {
  if (gitInOrNull(top, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}") === null) {
    io.out("No upstream branch: skipping git pull.");
    return;
  }
  io.out("git pull...");
  const run = spawnSync("git", ["pull"], { cwd: top, stdio: "inherit" });
  if (run.status !== 0) throw new UpdateError("git pull failed. Resolve it (and any conflict in .claude/memory), commit, then run this again.");
  _requireCleanMemory(top);
};

/** U3: the unread lines, and the lines read for counting. */
const _select = ({ top, branch, stamps }) => {
  const repoRoot = mainRoot(top);
  const sha = gitIn(top, "rev-parse", "HEAD");
  const ref = `refs/heads/${branch}`;
  const since = Date.parse(stamps.readsCountedUntil ?? stamps.initializedAt);
  const lines = findTranscripts({ projectsDir: projectsDir(), repoRoot })
    .filter((transcript) => mayHoldUnread(transcript, stamps) || statSync(transcript).mtimeMs > since)
    .flatMap(readLines);
  const common = { lines, repoRoot, stamps, referenceDate: referenceDate(sha, top) };
  const selected = select({ ...common, openBranches: openBranches({ pushedSha: sha, pushedRef: ref, cwd: top }) });
  const read = new Set(selected.map((line) => line.uuid));
  const onOpenBranches = select({ ...common, openBranches: new Set() }).filter((line) => !read.has(line.uuid));
  return { lines, selected, onOpenBranches, repoRoot, sha };
};

const _stampName = (now) => now.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");

/** The diff from the repo's memories/ to the dream's (an empty folder stands in for a memory with none yet). */
const _diff = ({ top, memoryDir, dreamDir, color = false }) => {
  const empty = path.join(dreamDir, "empty");
  mkdirSync(empty, { recursive: true });
  const memories = path.join(memoryDir, "memories");
  return memoryDiff({
    cwd: top,
    from: path.relative(top, existsSync(memories) ? memories : empty),
    to: path.relative(top, path.join(dreamDir, "memory", "memories")),
    color,
  });
};

/** Each changed file with its text on both sides, as formatSummary takes it. */
const _changedFiles = ({ memoryDir, copy, changes }) => {
  const read = (dir, name) => readFileSync(path.join(dir, name), "utf8");
  return [
    ...changes.created.map((name) => ({ path: name, after: read(copy, name) })),
    ...changes.modified.map((name) => ({ path: name, before: read(memoryDir, name), after: read(copy, name) })),
    ...changes.deleted.map((name) => ({ path: name, before: read(memoryDir, name) })),
  ];
};

/**
 * Everything the owner reads before choosing: the diff, the ranking changes, the alerts, then the
 * summary last, right above the prompt, where the owner lands after scrolling.
 */
const _show = ({ io, top, memoryDir, dreamDir, report, changes }) => {
  const copy = path.join(dreamDir, "memory");
  io.out(`\n${_diff({ top, memoryDir, dreamDir, color: io.color })}`);
  const ranking = rankingChanges(readFileSync(path.join(memoryDir, "index.md"), "utf8"), readFileSync(path.join(copy, "index.md"), "utf8"));
  if (ranking.length > 0) io.out(`Index ranking:\n${ranking.map((row) => `  ${row}`).join("\n")}\n`);
  const text = formatReport(report);
  if (text !== "") io.out(text);
  io.out(formatSummary({ files: _changedFiles({ memoryDir, copy, changes }), notes: report.notes, flags: report.flags, color: io.color }));
};

/**
 * U7–U8: show, ask, and loop on [m]. Returns `{ choice: "accepted" | "edited" | "ignored" | "aborted" | "nochange" }`.
 */
const _decide = async ({ io, steps, top, memoryDir, dreamDir, report, passages, run, check, now, today }) => {
  const copy = path.join(dreamDir, "memory");
  const diff = () => _diff({ top, memoryDir, dreamDir });
  let edited = false;
  let corrections = 0;
  for (;;) {
    const changes = compareMemories(memoryDir, copy);
    if (changes.created.length + changes.modified.length + changes.deleted.length === 0) {
      const text = formatReport(report);
      if (text !== "") io.out(text);
      return { choice: "nochange", changes };
    }
    _show({ io, top, memoryDir, dreamDir, report, changes });
    const answer = (await io.ask("[o] accept   [m] modify   [i] ignore   [a] abort  > ")).toLowerCase();
    if (answer.startsWith("o")) return { choice: edited ? "edited" : "accepted", changes };
    if (answer.startsWith("i")) return { choice: "ignored", changes };
    if (answer.startsWith("a")) return { choice: "aborted", changes };
    if (!answer.startsWith("m")) continue;
    for (;;) {
      const instruction = await io.ask("Describe the correction, or :e to edit the files yourself > ");
      if (instruction === "") break;
      edited = true;
      let verdict;
      if (instruction === ":e") {
        await io.edit(readMemoryFiles(copy).files.map((file) => file.file));
        refreshIndex(copy, now);
        verdict = await check();
      } else {
        corrections += 1;
        steps.step("Applying your correction");
        const result = await correct({ instruction, copy, run, check, diff, passages, now, today, name: `correction-${corrections}` });
        steps.end();
        report.alerts.push(...result.reply.alerts);
        for (const { path: name, note } of result.reply.notes ?? []) report.notes.set(name, note);
        verdict = result.verdict;
      }
      if (verdict.ok) break;
      io.out(`The checks failed:\n${verdict.output}`);
    }
  }
};

const _finish = ({ io, outcome, changes, commit }) => {
  if (outcome === "accepted" || outcome === "edited") io.out(`✅ Memory updated (${_plural(changes.created.length + changes.modified.length + changes.deleted.length, "file")} changed, commit ${commit?.slice(0, 7)}).`);
  else if (outcome === "ignored") io.out("✅ Changes ignored; the sessions are marked as read.");
  else io.out("✅ No change needed.");
};

/** The reindex mode: no pull, no dream, no commit, no stamps. */
const _reindex = ({ top, io, now, check }) => {
  const memoryDir = path.join(top, MEMORY);
  const index = path.join(memoryDir, "index.md");
  if (!existsSync(index)) throw new UpdateError(`${MEMORY}/index.md is missing.`);
  if (isEncrypted(readFileSync(index, "utf8"))) throw new UpdateError("The memory is still encrypted on this clone. Run: pnpm memory:setup");
  const incomplete = readMemoryFiles(memoryDir).files.filter((file) => file.title === null || file.summary === null);
  if (incomplete.length > 0) {
    throw new UpdateError(`These files need a title and a summary first (see ${MEMORY}/_template.md): ${incomplete.map((file) => file.path).join(", ")}`);
  }
  const files = refreshIndex(memoryDir, now);
  io.out(`Reindexed ${_plural(files.length, "memory file")}.`);
  const verdict = check({ full: false });
  if (!verdict.ok) throw new UpdateError(`The memory does not pass the checks:\n${verdict.output}`);
  io.out(`Commit them yourself: MEMORY_UPDATE=1 git commit -- ${MEMORY}`);
};

/**
 * The command. `io` is the terminal (`out`, `ask`, `edit`, `onInterrupt`); `deps` replaces the
 * pieces a test cannot run for real: `run` (one agent call), `check`, `hasClaude`, `now`.
 * Returns the exit code.
 */
export const runUpdate = async ({ argv, cwd = process.cwd(), io, deps = {} }) => {
  const now = (deps.now ?? (() => new Date()))();
  const today = now.toISOString().slice(0, 10);
  let release = () => {};
  let dreamDir = null;
  let stampsFile = null;
  let finished = false;
  const steps = createSteps({ status: io.status, out: io.out });
  const stopListening = io.onInterrupt?.(() => {
    if (dreamDir !== null && !finished && stampsFile !== null) _markFailed(stampsFile, now.toISOString());
    release();
  });
  try {
    const { dryRun, reindex } = _arguments(argv);
    const top = gitIn(cwd, "rev-parse", "--show-toplevel");
    const check = deps.check ?? (({ memoryDir = path.join(top, MEMORY), full = true } = {}) => _runCheck({ top, memoryDir, full, now }));
    release = acquireDreamLock(commonDir(cwd));
    const pendingFound = findPending(path.join(top, TMP));

    if (reindex) {
      if (pendingFound !== null) throw new UpdateError(`A dream commit is pending (${pendingFound.dir}). Run pnpm memory:update to finish it first.`);
      _reindex({ top, io, now, check });
      return 0;
    }

    const { branch, memoryDir, stampsFile: file } = _preflight({ top, hasClaude: deps.hasClaude ?? _hasClaude, io });
    stampsFile = file;
    _requireCleanMemory(top);

    if (pendingFound !== null) {
      if (dryRun) throw new UpdateError("A dream commit is pending. Run pnpm memory:update (without --dry-run) to finish it.");
      const { dir, pending } = pendingFound;
      if (pending.branch !== branch) throw new UpdateError(`A dream commit is pending on branch ${pending.branch}. Switch back to it and run this again.`);
      const here = gitIn(top, "rev-parse", `HEAD:${MEMORY}`);
      if (here !== gitIn(top, "rev-parse", `${pending.base}:${MEMORY}`)) {
        throw new UpdateError(`The memory changed since this dream started (a pull, or a hand-written file). Delete ${dir}, then run the dream again.`);
      }
      dreamDir = dir;
      io.out(`Finishing the pending dream commit from ${dir}.`);
      const commit = await _commit({ top, dreamDir: dir, memoryDir, message: pending.message, io });
      if (commit === null) throw new UpdateError(`The commit was refused again. Fix what it reported, then run this again; the dream is kept in ${dir}.`);
      _stamp({ stampsFile, selected: pending.selected, onOpenBranches: pending.onOpenBranches, outcome: pending.outcome, commit, readsCountedUntil: pending.readsCountedUntil, at: now.toISOString() });
      rmSync(dir, { recursive: true, force: true });
      finished = true;
      _finish({ io, outcome: pending.outcome, changes: pending.changes, commit });
      return 0;
    }

    if (!dryRun) _pull({ top, io });

    const stamps = readStamps(stampsFile);
    const { lines, selected, onOpenBranches, repoRoot, sha } = _select({ top, branch, stamps });
    if (selected.length === 0) {
      io.out("Nothing to read: every finished session has been read.");
      return 0;
    }
    io.out(`${_plural(countSessions(selected), "session")} to read.`);

    // U4
    const tmp = path.join(top, TMP);
    for (const old of dreamDirs(tmp)) rmSync(old, { recursive: true, force: true });
    dreamDir = path.join(tmp, `dream-${_stampName(now)}`);
    const copy = path.join(dreamDir, "memory");
    mkdirSync(path.join(dreamDir, "logs"), { recursive: true });
    copyMemory(memoryDir, copy);
    const window = { since: stamps.readsCountedUntil ?? stamps.initializedAt, until: now.toISOString() };
    const counts = countReads({ lines, repoRoot, memoryFiles: readMemoryFiles(copy).files.map((file) => file.path), ...window });
    const starts = sessionStarts({ lines, repoRoot, ...window });
    refreshIndex(copy, now, (usage) => applySessions(applyReads(usage, counts), counts, starts));

    // U5
    const run = deps.run ?? ((call) => runAgent({ ...call, cwd: dreamDir, repoRoot: top, logDir: path.join(dreamDir, "logs") }));
    const checkCopy = () => check({ memoryDir: copy, full: true });
    const diff = () => _diff({ top, memoryDir, dreamDir });
    const result = await dream({
      lines: selected,
      copy,
      context: { identity: ownerIdentity(top), repoRoot },
      run: async (call) => {
        const reply = await run(call);
        steps.finished();
        return reply;
      },
      check: checkCopy,
      diff,
      now,
      today,
      inputsDir: path.join(dreamDir, "inputs"),
      progress: steps.step,
    });

    steps.end();
    const report = {
      flags: result.flags,
      notes: new Map(result.notes.map(({ path: name, note }) => [name, note])),
      alerts: [...result.alerts],
      docsIssues: result.plan.docsIssues,
      deletions: result.plan.files.filter((file) => file.action === "delete"),
      dropped: droppedCandidates(result.plan, result.candidates),
    };
    if (dryRun) {
      const changes = compareMemories(memoryDir, copy);
      _show({ io, top, memoryDir, dreamDir, report, changes });
      io.out(`Dry run: nothing was written. The dream folder, with its logs, stays in ${dreamDir}.`);
      return 0;
    }

    const decision = await _decide({ io, steps, top, memoryDir, dreamDir, report, passages: result.passages, run, check: checkCopy, now, today });
    if (decision.choice === "aborted") {
      rmSync(dreamDir, { recursive: true, force: true });
      finished = true;
      io.out("Aborted. Nothing was written; the sessions stay unread and the push stays blocked.");
      return 0;
    }

    const pairs = { selected: pairsOf(selected), onOpenBranches: pairsOf(onOpenBranches) };
    const kept = decision.choice === "accepted" || decision.choice === "edited";
    let commit = null;
    if (kept) {
      const message = _commitMessage({ sessions: countSessions(selected), changes: decision.changes });
      commit = await _commit({ top, dreamDir, memoryDir, message, io });
      if (commit === null) {
        writePending(dreamDir, {
          version: 1,
          branch,
          base: sha,
          message,
          outcome: decision.choice,
          readsCountedUntil: now.toISOString(),
          ...pairs,
          changes: decision.changes,
        });
        throw new UpdateError(`The commit was refused. Fix what it reported, then run pnpm memory:update again: it finishes the commit without calling a model. The dream is kept in ${dreamDir}.`);
      }
    }
    _stamp({ stampsFile, ...pairs, outcome: decision.choice, commit, readsCountedUntil: now.toISOString(), at: now.toISOString() });
    rmSync(dreamDir, { recursive: true, force: true });
    finished = true;
    _finish({ io, outcome: decision.choice, changes: decision.changes, commit });
    return 0;
  } catch (error) {
    steps.fail();
    const known = error instanceof UpdateError;
    io.err(known ? error.message : `memory:update failed: ${error.message}`);
    if (dreamDir !== null && !finished) {
      if (!known && stampsFile !== null && !argv.includes("--dry-run")) _markFailed(stampsFile, now.toISOString());
      io.err(`The dream folder is kept for inspection: ${dreamDir} (see logs/).`);
    }
    return 1;
  } finally {
    stopListening?.();
    release();
  }
};

const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

/**
 * One line redrawn in place behind a spinner, cut to the terminal's width; `null` clears it. On a
 * terminal only: a pipe or a log would keep every frame.
 */
const _statusLine = ({ color }) => {
  if (process.stdout.isTTY !== true) return () => {};
  let text = "";
  let frame = 0;
  let timer = null;
  let since = 0;
  const draw = () => {
    const spinner = SPINNER[frame % SPINNER.length];
    frame += 1;
    // The time first, so a long last line cut at the edge never hides it.
    const elapsed = `${Math.floor((Date.now() - since) / 1000)}s`.padStart(4);
    const line = [...`${elapsed}  ${text}`].slice(0, Math.max(0, (process.stdout.columns ?? 80) - 3)).join("");
    process.stdout.write(`\r\u001b[2K${color ? `\u001b[36m${spinner}\u001b[39m` : spinner} ${line}`);
  };
  return (next) => {
    if (next === null) {
      clearInterval(timer);
      timer = null;
      process.stdout.write("\r\u001b[2K");
      return;
    }
    text = next;
    if (timer === null) {
      since = Date.now();
      timer = setInterval(draw, 80);
      draw();
    }
  };
};

/** The real terminal. */
const _terminal = () => ({
  status: _statusLine({ color: process.stdout.isTTY === true && process.env.NO_COLOR === undefined }),
  // Colour on a terminal only, and never when the owner set NO_COLOR (no-color.org).
  color: process.stdout.isTTY === true && process.env.NO_COLOR === undefined,
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  ask: async (question) => {
    if (!process.stdin.isTTY) throw new UpdateError("memory:update needs a terminal to show you the diff and ask. Run it in one.");
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return (await prompt.question(question)).trim();
    } finally {
      prompt.close();
    }
  },
  edit: (files) => {
    const editor = process.env.VISUAL ?? process.env.EDITOR ?? (process.platform === "win32" ? "notepad" : "vi");
    spawnSync(`${editor} ${files.map((file) => `"${file}"`).join(" ")}`, { shell: true, stdio: "inherit" });
  },
  onInterrupt: (callback) => {
    const handler = () => {
      callback();
      process.exit(130);
    };
    process.once("SIGINT", handler);
    return () => process.off("SIGINT", handler);
  },
});

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runUpdate({ argv: process.argv.slice(2), io: _terminal() });
}
