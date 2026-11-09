/**
 * The dream (spec §10, P2–P6): extract, plan, write, check, review. It works on a copy of the
 * memory and changes nothing else. Every model call goes through the injected `run`, so the same
 * code is tested with replies written by hand and run for real with `runAgent`.
 *
 * The script stays in charge. Agents never start agents; they do not pass files to each other,
 * their replies are checked (responses.mjs) and then put into the next prompt. Two guards hold the
 * writers to their job: each may write one file only (the grant `runAgent` gives), and after the
 * writers the copy is compared with what it was, so a change outside the plan stops the dream.
 * The reviewer may edit `memories/` of the copy to fix what it flags; it may touch nothing else,
 * and the mechanical checks run again on what it changed.
 *
 *   P2  one extractor per conversation, in parallel   → candidates, each citing a line
 *   P3  one planner                                   → which files to create, update, delete;
 *                                                       an unused file too recently read is kept
 *   P4  one writer per file, in parallel              → the files; a delete is done by the script
 *   --  the script refreshes usage.json and index.md
 *   P5  mechanical checks (C20 --full)                → errors stop the dream
 *   P6  one reviewer                                  → flags, fixes, notes, and new files to drop;
 *                                                       C20 --full again if it changed a file
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { condense, excerpts } from "./condense.mjs";
import { changedPaths, refreshIndex, snapshotMemory } from "./memoryDir.mjs";
import { readMemoryFiles } from "./memoryFiles.mjs";
import { checkPlan, checkWriterReply, correctionReply, extractorReply, plannerReply, reviewerReply, screenDeletions, UNUSED_AFTER_SESSIONS, writerReply } from "./responses.mjs";
import { NOTE_LENGTH } from "./review.mjs";
import { mapLimit } from "./runAgent.mjs";
import { readUsage } from "./usage.mjs";

/** The dream cannot go on; the message says why. */
class DreamError extends Error {
  constructor(message) {
    super(message);
    this.name = "DreamError";
  }
}

const PARALLEL = 4;
/** A conversation longer than this goes to a file the prompt points at (spec §6.4). */
const INLINE_LIMIT = 120_000;

const _json = (value) => JSON.stringify(value, null, 2);
const _fileName = (text) => text.replace(/[^A-Za-z0-9._-]/g, "_");

const extractorPrompt = ({ sessionId, text, inputsDir, inlineLimit = INLINE_LIMIT }) => {
  const intro = `Extract the candidate facts from the conversation of session ${sessionId}. Use "${sessionId}-NN" as candidate ids.`;
  if (text.length <= inlineLimit) return `${intro}\n\n<conversation>\n${text}\n</conversation>\n`;
  mkdirSync(inputsDir, { recursive: true });
  const file = path.join(inputsDir, `conversation-${_fileName(sessionId)}.md`);
  writeFileSync(file, text);
  return `${intro}\n\nThe conversation is long: read it with the Read tool from ${file}.\n`;
};

const plannerPrompt = ({ candidates, files, usage }) =>
  [
    "Plan the memory changes for these candidates.",
    "",
    "<candidates>",
    _json(candidates),
    "</candidates>",
    "",
    "<memory-files>",
    _json(
      files.map((file) => ({
        path: file.path,
        title: file.title,
        summary: file.summary,
        status: file.status,
        lastVerified: file.lastVerified,
        ...(usage.files[file.path] ?? {}),
      })),
    ),
    "</memory-files>",
    "",
    "A memory file is read as `.claude/memory/<path>`. The usage fields: created, reads, lastRead, and",
    "sessionsSinceRead: the sessions that started since the file was last read or created (absent is 0).",
    `A deletion because "unused" needs sessionsSinceRead of ${UNUSED_AFTER_SESSIONS} or more; the script keeps the file otherwise.`,
    "",
  ].join("\n");

const writerPrompt = ({ entry, file, candidates, passages, today }) =>
  [
    `${entry.action === "create" ? "Create" : "Update"} the memory file ${entry.path}. The one file you may write is ${file}.`,
    `Today is ${today} (UTC). Use it for last_verified.`,
    "",
    "<candidates>",
    _json(candidates),
    "</candidates>",
    "",
    "<passages>",
    passages,
    "</passages>",
    "",
  ].join("\n");

const correctionPrompt = ({ instruction, diff, passages, today, folder }) =>
  [
    "The owner reviewed the dream's diff and wants a correction.",
    `Today is ${today} (UTC). The files you may create or edit are in ${folder}. To delete a file, name it in \`drop\`: you cannot delete it yourself.`,
    `In \`notes\`, give one line per file you create, change or delete: what changed and why, at most ${NOTE_LENGTH} characters.`,
    "",
    "<instruction>",
    instruction,
    "</instruction>",
    "",
    "<diff>",
    diff,
    "</diff>",
    "",
    "<passages>",
    passages,
    "</passages>",
    "",
  ].join("\n");

const reviewerPrompt = ({ diff, plan, candidates, passages, writerReplies, folder }) =>
  [
    "Review the memory changes in this diff against their sources, and fix, trim or remove what you flag.",
    `The files you may edit are in ${folder}. Nothing else is writable. To drop a file the plan creates, name it in \`drop\`.`,
    `In \`notes\`, give one line per memory file this dream creates, changes or deletes, as it stands after your fixes: what a session now learns from it, or what changed and why, at most ${NOTE_LENGTH} characters.`,
    "",
    "<diff>",
    diff,
    "</diff>",
    "",
    "<plan>",
    _json(plan),
    "</plan>",
    "",
    "<candidates>",
    _json(candidates),
    "</candidates>",
    "",
    "<passages>",
    passages,
    "</passages>",
    "",
    "<writer-replies>",
    _json(writerReplies),
    "</writer-replies>",
    "",
  ].join("\n");

/** What is wrong with the candidates as a whole: ids reused, a source that is not in the conversation read. */
const _candidateProblems = (candidates, conversations) => {
  const lineIds = new Map(conversations.map(({ sessionId, own }) => [sessionId, new Set(own.map((line) => line.uuid))]));
  const seen = new Set();
  return candidates.flatMap(({ id, source }) => {
    const problems = [];
    if (seen.has(id)) problems.push(`candidate id ${id} is used twice`);
    seen.add(id);
    if (!lineIds.has(source.sessionId)) problems.push(`candidate ${id} cites session ${source.sessionId}, which was not read`);
    else if (!lineIds.get(source.sessionId).has(source.line)) problems.push(`candidate ${id} cites line ${source.line}, which is not in session ${source.sessionId}`);
    return problems;
  });
};

/**
 * Where the reviewer's account and the copy disagree: a file it changed that no fixed flag names,
 * or a flag it says it fixed in a file it did not change. The owner sees both next to the diff.
 */
const _fixMismatches = (flags, fixed) => {
  const claimed = new Set(flags.filter((flag) => flag.fix !== undefined).map((flag) => flag.path));
  const changed = new Set(fixed);
  return [
    ...fixed.filter((name) => !claimed.has(name)).map((name) => ({ kind: "reviewer", message: `the reviewer changed ${name} without a fixed flag saying why` })),
    ...[...claimed].filter((name) => !changed.has(name)).map((name) => ({ kind: "reviewer", message: `the reviewer says it fixed ${name}, but the file did not change` })),
  ];
};

const _stop = (what, problems) => {
  throw new DreamError(`${what}:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
};

/**
 * Runs P2–P6 on `copy`. `lines` are the selected transcript lines; `context` is `{ identity,
 * repoRoot }` for the masks. `run(call)` makes one agent call (`{ agent, name, prompt, schema,
 * writable }`), `check()` runs C20 on the copy and returns `{ ok, output }`, `diff()` returns the
 * diff the reviewer reads. Returns what update.mjs shows the owner.
 */
export const dream = async ({ lines, copy, context, run, check, diff, now, today, inputsDir, progress = () => {}, inlineLimit = INLINE_LIMIT, parallel = PARALLEL }) => {
  const conversations = [...Map.groupBy(lines, (line) => line.sessionId)]
    .map(([sessionId, own]) => ({ sessionId, own, ...condense(own, context) }))
    .filter((conversation) => conversation.text !== "");

  progress(`P2  extracting from ${conversations.length} conversation(s)`);
  const extracted = await mapLimit(conversations, parallel, (conversation) =>
    run({
      agent: "dream-extractor",
      name: `extractor-${_fileName(conversation.sessionId)}`,
      prompt: extractorPrompt({ ...conversation, inputsDir, inlineLimit }),
      schema: extractorReply,
      writable: [],
    }),
  );
  const candidates = extracted.flatMap((reply) => reply.candidates);
  const problems = _candidateProblems(candidates, conversations);
  if (problems.length > 0) _stop("an extractor returned unusable candidates", problems);
  if (candidates.length === 0) return { plan: { files: [], docsIssues: [] }, candidates, writerReplies: [], flags: [], alerts: [], passages: "" };

  progress(`P3  planning from ${candidates.length} candidate(s)`);
  const memoryFiles = readMemoryFiles(copy).files;
  const usage = readUsage(copy);
  const proposed = await run({
    agent: "dream-planner",
    name: "planner",
    prompt: plannerPrompt({ candidates, files: memoryFiles, usage }),
    schema: plannerReply,
    writable: [],
  });
  const planProblems = checkPlan(proposed, { candidateIds: new Set(candidates.map(({ id }) => id)), existing: new Set(memoryFiles.map(({ path: name }) => name)) });
  if (planProblems.length > 0) _stop("the plan cannot be used", planProblems);
  const { plan, alerts: deletionAlerts } = screenDeletions(proposed, usage);

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const passagesOf = (entry) => excerpts({ lines, candidates: entry.candidates.map((id) => byId.get(id)), context });
  const before = snapshotMemory(copy);
  for (const entry of plan.files.filter((file) => file.action === "delete")) rmSync(path.join(copy, entry.path), { force: true });

  const writing = plan.files.filter((file) => file.action !== "delete");
  progress(`P4  writing ${writing.length} file(s), deleting ${plan.files.length - writing.length}`);
  const writerReplies = await mapLimit(writing, parallel, async (entry, at) => {
    const file = path.join(copy, entry.path);
    const reply = await run({
      agent: "dream-writer",
      name: `writer-${at + 1}-${_fileName(path.basename(entry.path, ".md"))}`,
      prompt: writerPrompt({ entry, file, candidates: entry.candidates.map((id) => byId.get(id)), passages: passagesOf(entry), today }),
      schema: writerReply,
      writable: [file],
    });
    const wrong = checkWriterReply(reply, entry);
    if (wrong.length > 0) _stop(`the writer for ${entry.path} cannot be used`, wrong);
    try {
      readFileSync(file);
    } catch {
      _stop(`the writer for ${entry.path} wrote nothing`, [`${file} does not exist`]);
    }
    return reply;
  });

  const planned = new Set(plan.files.map((file) => file.path));
  const stray = changedPaths(before, snapshotMemory(copy)).filter((name) => !planned.has(name));
  if (stray.length > 0) _stop("a writer changed files outside the plan", stray);

  refreshIndex(copy, now);
  progress("P5  mechanical checks");
  const verdict = await check();
  if (!verdict.ok) _stop("the mechanical checks failed", verdict.output.split("\n").filter((row) => row.trim() !== ""));

  progress("P6  review");
  const passages = plan.files.map(passagesOf).join("\n");
  const folder = path.join(copy, "memories");
  const reviewed = snapshotMemory(copy);
  const review = await run({
    agent: "dream-reviewer",
    name: "reviewer",
    prompt: reviewerPrompt({ diff: await diff(), plan, candidates, passages, writerReplies, folder }),
    schema: reviewerReply,
    writable: [path.join(folder, "**")],
  });
  const created = new Set(plan.files.filter((file) => file.action === "create").map((file) => file.path));
  const dropAlerts = [];
  for (const name of review.drop ?? []) {
    if (created.has(name)) rmSync(path.join(copy, name), { force: true });
    else dropAlerts.push({ kind: "reviewer", message: `the reviewer wants to drop ${name}, which this dream did not create; it is kept` });
  }
  const fixed = changedPaths(reviewed, snapshotMemory(copy));
  const outside = fixed.filter((name) => !name.startsWith("memories/"));
  if (outside.length > 0) _stop("the reviewer changed files it must not touch", outside);
  if (fixed.length > 0) {
    refreshIndex(copy, now);
    progress("P6  checking the reviewer's fixes");
    const recheck = await check();
    if (!recheck.ok) _stop("the mechanical checks failed after the reviewer's fixes", recheck.output.split("\n").filter((row) => row.trim() !== ""));
  }

  return {
    plan,
    candidates,
    writerReplies,
    flags: review.flags,
    notes: review.notes ?? [],
    alerts: [...deletionAlerts, ...writerReplies.flatMap((reply) => reply.alerts), ..._fixMismatches(review.flags, fixed), ...dropAlerts],
    passages,
  };
};

/**
 * The [m] choice (spec §9.3): the writer applies the owner's instruction anywhere in `memories/` of
 * the copy; the index follows; the mechanical checks run again. No second review: the owner is
 * the reference. Returns the writer's reply and the checks' verdict; a failed verdict leaves the
 * copy as the writer made it, so the owner can correct again.
 */
export const correct = async ({ instruction, copy, run, check, diff, passages, now, today, name }) => {
  const before = snapshotMemory(copy);
  const reply = await run({
    agent: "dream-writer",
    name,
    prompt: correctionPrompt({ instruction, diff: await diff(), passages, today, folder: path.join(copy, "memories") }),
    schema: correctionReply,
    writable: [path.join(copy, "memories", "**")],
  });
  for (const name of reply.drop ?? []) rmSync(path.join(copy, name), { force: true });
  const outside = changedPaths(before, snapshotMemory(copy)).filter((file) => !file.startsWith("memories/"));
  if (outside.length > 0) _stop("the correction changed files it must not touch", outside);
  refreshIndex(copy, now);
  return { reply, verdict: await check() };
};
