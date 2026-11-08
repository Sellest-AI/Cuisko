/**
 * The dream (spec §10, P2–P6): extract, plan, write, check, review. It works on a copy of the
 * memory and changes nothing else. Every model call goes through the injected `run`, so the same
 * code is tested with replies written by hand and run for real with `runAgent`.
 *
 * The script stays in charge. Agents never start agents; they do not pass files to each other,
 * their replies are checked (responses.mjs) and then put into the next prompt. Two guards hold the
 * writers to their job: each may write one file only (the grant `runAgent` gives), and after the
 * writers the copy is compared with what it was, so a change outside the plan stops the dream.
 *
 *   P2  one extractor per conversation, in parallel   → candidates, each citing a line
 *   P3  one planner                                   → which files to create, update, delete
 *   P4  one writer per file, in parallel              → the files; a delete is done by the script
 *   --  the script refreshes usage.json and index.md
 *   P5  mechanical checks (C20 --full)                → errors stop the dream
 *   P6  one reviewer                                  → flags for the owner, never edits
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { condense, excerpts } from "./condense.mjs";
import { changedPaths, refreshIndex, snapshotMemory } from "./memoryDir.mjs";
import { readMemoryFiles } from "./memoryFiles.mjs";
import { checkPlan, checkWriterReply, correctionReply, extractorReply, plannerReply, reviewerReply, writerReply } from "./responses.mjs";
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
    "A memory file is read as `.claude/memory/<path>`. The usage fields: created, reads, lastRead.",
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
    `Today is ${today} (UTC). The files you may create, edit or delete are in ${folder}.`,
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

const reviewerPrompt = ({ diff, plan, candidates, passages, writerReplies }) =>
  [
    "Review the memory changes in this diff against their sources.",
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
  const plan = await run({
    agent: "dream-planner",
    name: "planner",
    prompt: plannerPrompt({ candidates, files: memoryFiles, usage: readUsage(copy) }),
    schema: plannerReply,
    writable: [],
  });
  const planProblems = checkPlan(plan, { candidateIds: new Set(candidates.map(({ id }) => id)), existing: new Set(memoryFiles.map(({ path: name }) => name)) });
  if (planProblems.length > 0) _stop("the plan cannot be used", planProblems);

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
  const review = await run({
    agent: "dream-reviewer",
    name: "reviewer",
    prompt: reviewerPrompt({ diff: await diff(), plan, candidates, passages, writerReplies }),
    schema: reviewerReply,
    writable: [],
  });

  return {
    plan,
    candidates,
    writerReplies,
    flags: review.flags,
    alerts: writerReplies.flatMap((reply) => reply.alerts),
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
  const outside = changedPaths(before, snapshotMemory(copy)).filter((file) => !file.startsWith("memories/"));
  if (outside.length > 0) _stop("the correction changed files it must not touch", outside);
  refreshIndex(copy, now);
  return { reply, verdict: await check() };
};
