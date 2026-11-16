/**
 * The dream (spec §10, P2–P6): extract, plan, write, check, review. It works on a copy of the
 * memory and changes nothing else. Every model call goes through the injected `run`, so the same
 * code is tested with replies written by hand and run for real with `runAgent`.
 *
 * The script stays in charge. Agents never start agents; they do not pass files to each other,
 * their replies are checked (responses.mjs) and then put into the next prompt. The memory is a
 * folder per topic and a file per fact. Each writer may write its topic folder only (the grant
 * `runAgent` gives), and after the writers the copy is compared with what it was: a change outside
 * a written topic, or a fact gone, stops the dream. A writer never deletes or renames: a fact gone
 * without a `drop` is how a rename shows up.
 *
 * Only the script names a fact (factNames.mjs). After each step that may create one (the writers,
 * an [m] correction, a hand edit) it renames every new file, and every file whose name breaks the
 * rule, to the slug of its title and a random id. A file already named keeps its name, so its id
 * never changes between two diffs the owner reads.
 *
 *   P2  one extractor per conversation, in parallel   → candidates, each citing a line
 *   P3  one planner                                   → topics to write, facts and topics to
 *                                                       delete; an unused topic too recently read
 *                                                       is kept
 *   P4  one writer per topic, in parallel             → its facts; deletions are done by the script
 *   --  the script names the new facts
 *   P5  mechanical checks (C20 --full)                → errors stop the dream
 *   P6  one reviewer                                  → flags, fixes, notes, and new facts to drop;
 *                                                       C20 --full again if it changed a fact
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { condense, excerpts } from "./condense.mjs";
import { factName } from "./factNames.mjs";
import { changedPaths, snapshotMemory } from "./memoryDir.mjs";
import { isFactName, readFacts, topicOf, topicsOf } from "./memoryFiles.mjs";
import { topicCreated } from "./memoryIndex.mjs";
import { checkPlan, checkWriterReply, correctionReply, extractorReply, plannerReply, reviewerReply, screenDeletions, UNUSED_AFTER_SESSIONS, writerReply } from "./responses.mjs";
import { NOTE_LENGTH } from "./review.mjs";
import { mapLimit } from "./runAgent.mjs";
import { readUsageFiles, totals } from "./usage.mjs";

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
const _isFact = (name) => name.startsWith("memories/") && name.split("/").length === 3;

const extractorPrompt = ({ sessionId, text, inputsDir, inlineLimit = INLINE_LIMIT }) => {
  const intro = `Extract the candidate facts from the conversation of session ${sessionId}. Use "${sessionId}-NN" as candidate ids.`;
  if (text.length <= inlineLimit) return `${intro}\n\n<conversation>\n${text}\n</conversation>\n`;
  mkdirSync(inputsDir, { recursive: true });
  const file = path.join(inputsDir, `conversation-${_fileName(sessionId)}.md`);
  writeFileSync(file, text);
  return `${intro}\n\nThe conversation is long: read it with the Read tool from ${file}.\n`;
};

/** What the planner is told of each topic: its facts by title, and its usage. */
const _topicsForPlanner = (topics, usage) =>
  [...topics.entries()].map(([topic, facts]) => ({
    topic,
    ...(usage.get(topic) ?? { reads: 0, lastRead: null, sessionsSinceRead: 0 }),
    facts: facts.map((fact) => ({ path: fact.path, title: fact.title, status: fact.status, lastVerified: fact.lastVerified })),
  }));

const plannerPrompt = ({ candidates, topics, usage }) =>
  [
    "Plan the memory changes for these candidates.",
    "",
    "<candidates>",
    _json(candidates),
    "</candidates>",
    "",
    "<topics>",
    _json(_topicsForPlanner(topics, usage)),
    "</topics>",
    "",
    "A fact is read as `.claude/memory/<path>`. The usage fields of a topic: reads, lastRead, and",
    "sessionsSinceRead: the sessions that started since the topic was last read or created.",
    `A topic deletion because "unused" needs sessionsSinceRead of ${UNUSED_AFTER_SESSIONS} or more; the script keeps the topic otherwise.`,
    "",
  ].join("\n");

const writerPrompt = ({ entry, folder, candidates, passages, today }) =>
  [
    `${entry.action === "create" ? "Create" : "Update"} the memory topic ${entry.topic}. The one folder you may write is ${folder}.`,
    "Write one fact per file, as _template.md shows. Give a new file any name ending in .md: the script names it from its title.",
    "Never rename or delete a file: to replace a fact, edit its file.",
    `Today is ${today} (UTC). Use it for last_verified, and for created in a new file.`,
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
    `Today is ${today} (UTC). The facts you may create or edit are in the topic folders of ${folder}; a new topic is a new folder there.`,
    "Give a new fact any name ending in .md: the script names it from its title. Never rename a file. To delete a fact, name it in `drop`: you cannot delete it yourself.",
    `In \`notes\`, give one line per fact you create, change or delete: what changed and why, at most ${NOTE_LENGTH} characters.`,
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

/** Told to the reviewer of an --auto dream, where no owner reads the flags before the commit. */
const NON_INTERACTIVE = "The terminal is non-interactive: fix as many flags as you can; everything you leave flagged is dropped.";

const reviewerPrompt = ({ diff, plan, candidates, passages, writerReplies, folder, interactive }) =>
  [
    "Review the memory changes in this diff against their sources, and fix, trim or remove what you flag.",
    `You may edit the facts this diff creates or changes, in ${folder}. Create no file, rename none, and touch no other. To drop a fact this diff creates, name it in \`drop\`.`,
    `In \`notes\`, give one line per fact this dream creates, changes or deletes, as it stands after your fixes: what a session now learns from it, or what changed and why, at most ${NOTE_LENGTH} characters.`,
    ...(interactive ? [] : [NON_INTERACTIVE]),
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
 * Where the reviewer's account and the copy disagree: a fact it changed that no fixed flag names,
 * or a flag it says it fixed in a fact it did not change. A fact it dropped counts as changed for
 * a flag that says it fixed it; `drop` already names it, so it needs no flag. The owner sees both
 * next to the diff.
 */
const _fixMismatches = (flags, fixed, dropped) => {
  const claimed = new Set(flags.filter((flag) => flag.fix !== undefined).map((flag) => flag.path));
  const changed = new Set([...fixed, ...dropped]);
  return [
    ...fixed.filter((name) => !claimed.has(name)).map((name) => ({ kind: "reviewer", message: `the reviewer changed ${name} without a fixed flag saying why` })),
    ...[...claimed].filter((name) => !changed.has(name)).map((name) => ({ kind: "reviewer", message: `the reviewer says it fixed ${name}, but the file did not change` })),
  ];
};

const _stop = (what, problems) => {
  throw new DreamError(`${what}:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
};

const _checked = async (check, what) => {
  const verdict = await check();
  if (!verdict.ok) _stop(what, verdict.output.split("\n").filter((row) => row.trim() !== ""));
};

/**
 * Renames the facts of `copy` that are not in `before` (a snapshot), or whose name breaks the
 * rule, to `factName(title)`. `drawn` holds every name given in this dream, so two topics written
 * in parallel never get the same one; the names given are added to it. A fact with no title is
 * named from its file name: C20 reports the missing title. Returns old path → new path.
 */
export const nameNewFacts = (copy, { before, drawn = new Set() }) => {
  const { facts } = readFacts(copy);
  const renamed = new Map();
  const names = new Set(facts.map((fact) => fact.path));
  for (const fact of facts) {
    const name = path.basename(fact.path);
    if (before.has(fact.path) && isFactName(name)) continue;
    const taken = new Set([...drawn, ...[...names].filter((other) => other !== fact.path && topicOf(other) === fact.topic).map((other) => path.basename(other))]);
    const fresh = factName(fact.title ?? name.replace(/\.md$/, ""), { taken });
    const target = `memories/${fact.topic}/${fresh}`;
    renameSync(path.join(copy, fact.path), path.join(copy, target));
    names.delete(fact.path);
    names.add(target);
    drawn.add(fresh);
    renamed.set(fact.path, target);
  }
  return renamed;
};

/** `name` after `renamed` (nameNewFacts). */
const _after = (renamed, name) => renamed.get(name) ?? name;

/**
 * What a writing step did, from the snapshots around it: paths created, changed, and gone. A fact
 * gone that the step did not `drop` is a rename or a deletion, both refused.
 */
const _changes = (before, after) => {
  const changed = changedPaths(before, after);
  return {
    created: changed.filter((name) => !before.has(name)),
    modified: changed.filter((name) => before.has(name) && after.has(name)),
    gone: changed.filter((name) => !after.has(name)),
  };
};

/** The usage totals of a memory folder, per topic (usage.mjs `totals`), from its facts and usage files. */
const _usageOf = (dir, topics, today) => {
  const usages = readUsageFiles(dir)
    .filter(({ usage }) => usage !== null)
    .map(({ usage }) => usage);
  return totals(usages, new Map([...topics.entries()].map(([topic, facts]) => [topic, { created: topicCreated(facts, today) }])));
};

/**
 * Runs P2–P6 on `copy`. `lines` are the selected transcript lines; `context` is `{ identity,
 * repoRoot }` for the masks. `run(call)` makes one agent call (`{ agent, name, prompt, schema,
 * writable }`), `check()` runs C20 on the copy and returns `{ ok, output }`, `diff()` returns the
 * diff the reviewer reads. Returns what update.mjs shows the owner.
 */
export const dream = async ({ lines, copy, context, run, check, diff, today, inputsDir, progress = () => {}, interactive = true, inlineLimit = INLINE_LIMIT, parallel = PARALLEL }) => {
  const conversations = [...Map.groupBy(lines, (line) => line.sessionId)]
    .map(([sessionId, own]) => ({ sessionId, own, ...condense(own, context) }))
    .filter((conversation) => conversation.text !== "");

  progress(`P2  extracting from ${conversations.length} conversation(s)`, conversations.length);
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
  const empty = { topics: [], delete: [], deleteTopics: [], dropped: [], docsIssues: [] };
  if (candidates.length === 0) return { plan: empty, candidates, writerReplies: [], flags: [], notes: [], alerts: [], passages: "" };

  progress(`P3  planning from ${candidates.length} candidate(s)`);
  const topics = topicsOf(readFacts(copy).facts);
  const usage = _usageOf(copy, topics, today);
  const proposed = await run({
    agent: "dream-planner",
    name: "planner",
    prompt: plannerPrompt({ candidates, topics, usage }),
    schema: plannerReply,
    writable: [],
  });
  const facts = new Set([...topics.values()].flat().map((fact) => fact.path));
  const planProblems = checkPlan(proposed, { candidateIds: new Set(candidates.map(({ id }) => id)), topics: new Set(topics.keys()), facts });
  if (planProblems.length > 0) _stop("the plan cannot be used", planProblems);
  const { plan, alerts: deletionAlerts } = screenDeletions(proposed, usage);

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const passagesOf = (entry) => excerpts({ lines, candidates: entry.candidates.map((id) => byId.get(id)), context });
  for (const { fact } of plan.delete) rmSync(path.join(copy, fact), { force: true });
  for (const { topic } of plan.deleteTopics) rmSync(path.join(copy, "memories", topic), { recursive: true, force: true });
  const before = snapshotMemory(copy);

  progress(`P4  writing ${plan.topics.length} topic(s), deleting ${plan.delete.length} fact(s) and ${plan.deleteTopics.length} topic(s)`, plan.topics.length);
  const writerReplies = await mapLimit(plan.topics, parallel, async (entry, at) => {
    const folder = path.join(copy, "memories", entry.topic);
    mkdirSync(folder, { recursive: true });
    const reply = await run({
      agent: "dream-writer",
      name: `writer-${at + 1}-${entry.topic}`,
      prompt: writerPrompt({ entry, folder, candidates: entry.candidates.map((id) => byId.get(id)), passages: passagesOf(entry), today }),
      schema: writerReply,
      writable: [path.join(folder, "**")],
    });
    const wrong = checkWriterReply(reply, entry);
    if (wrong.length > 0) _stop(`the writer for topic ${entry.topic} cannot be used`, wrong);
    return reply;
  });

  const written = _changes(before, snapshotMemory(copy));
  const granted = new Set(plan.topics.map((entry) => entry.topic));
  const outside = [...written.created, ...written.modified].filter((name) => !_isFact(name) || !granted.has(topicOf(name)));
  if (outside.length > 0) _stop("a writer changed files outside its topic", outside);
  if (written.gone.length > 0) _stop("a writer renamed or deleted facts", written.gone);
  const touched = new Set([...written.created, ...written.modified].map(topicOf));
  const idle = [...granted].filter((topic) => !touched.has(topic));
  if (idle.length > 0) _stop("a writer wrote nothing", idle.map((topic) => `topic ${topic}`));
  const renamed = nameNewFacts(copy, { before });
  const created = new Set(written.created.map((name) => _after(renamed, name)));
  const changed = new Set([...created, ...written.modified]);

  progress("P5  mechanical checks");
  await _checked(check, "the mechanical checks failed");

  progress("P6  review");
  const passages = plan.topics.map(passagesOf).join("\n");
  const folder = path.join(copy, "memories");
  const reviewed = snapshotMemory(copy);
  const review = await run({
    agent: "dream-reviewer",
    name: "reviewer",
    prompt: reviewerPrompt({ diff: await diff(), plan, candidates, passages, writerReplies, folder, interactive }),
    schema: reviewerReply,
    writable: [path.join(folder, "**")],
  });
  const fixes = _changes(reviewed, snapshotMemory(copy));
  const refused = [
    ...fixes.created.map((name) => `${name}: the reviewer may not create a file`),
    ...fixes.gone.map((name) => `${name}: the reviewer may not rename or delete a fact; it names it in drop`),
    ...fixes.modified.filter((name) => !changed.has(name)).map((name) => `${name}: the reviewer may edit only the facts this dream wrote`),
  ];
  if (refused.length > 0) _stop("the reviewer changed files it must not touch", refused);
  const dropAlerts = [];
  const droppedNew = [];
  for (const name of review.drop ?? []) {
    if (created.has(name)) {
      rmSync(path.join(copy, name), { force: true });
      droppedNew.push(name);
    } else dropAlerts.push({ kind: "reviewer", message: `the reviewer wants to drop ${name}, which this dream did not create; it is kept` });
  }
  if (fixes.modified.length > 0 || droppedNew.length > 0) {
    progress("P6  checking the reviewer's fixes");
    await _checked(check, "the mechanical checks failed after the reviewer's fixes");
  }

  return {
    plan,
    candidates,
    writerReplies,
    flags: review.flags,
    notes: review.notes ?? [],
    alerts: [...deletionAlerts, ...writerReplies.flatMap((reply) => reply.alerts), ..._fixMismatches(review.flags, fixes.modified, droppedNew), ...dropAlerts],
    passages,
  };
};

/**
 * The [m] choice (spec §9.3): the writer applies the owner's instruction anywhere in `memories/` of
 * the copy, new topics included; the script drops what it names, names the new facts, then the
 * mechanical checks run again. No second review: the owner is the reference. Returns the writer's
 * reply, its paths after naming, and the checks' verdict; a failed verdict leaves the copy as the
 * writer made it, so the owner can correct again. A renamed fact stops the dream.
 */
export const correct = async ({ instruction, copy, run, check, diff, passages, today, name }) => {
  const before = snapshotMemory(copy);
  const reply = await run({
    agent: "dream-writer",
    name,
    prompt: correctionPrompt({ instruction, diff: await diff(), passages, today, folder: path.join(copy, "memories") }),
    schema: correctionReply,
    writable: [path.join(copy, "memories", "**")],
  });
  const dropped = new Set(reply.drop ?? []);
  for (const fact of dropped) rmSync(path.join(copy, fact), { force: true });
  const { created, modified, gone } = _changes(before, snapshotMemory(copy));
  const outside = [...created, ...modified].filter((file) => !_isFact(file));
  if (outside.length > 0) _stop("the correction changed files it must not touch", outside);
  const lost = gone.filter((file) => !dropped.has(file));
  if (lost.length > 0) _stop("the correction renamed or deleted facts without naming them in drop", lost);
  const renamed = nameNewFacts(copy, { before });
  const mapped = {
    ...reply,
    changed: reply.changed.map((file) => _after(renamed, file)),
    notes: (reply.notes ?? []).map((note) => ({ ...note, path: _after(renamed, note.path) })),
  };
  return { reply: mapped, verdict: await check() };
};
