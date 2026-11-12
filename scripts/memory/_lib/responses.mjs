/**
 * What each dream agent answers (spec §10.4), as Zod schemas, and the cross-checks a schema cannot
 * express. Every agent ends with one JSON reply; runAgent validates it against the schema here and
 * hands the script plain data. The same schema, as JSON Schema, goes to `claude -p --json-schema`,
 * so the model is told the shape and the script checks it anyway.
 *
 * A reply is never trusted past its shape: `checkPlan` and `checkWriterReply` refuse a plan that
 * names a candidate nobody extracted, a fact or topic that does not exist, or a writer that answers
 * for another topic. A dream that cannot be checked stops, it does not guess.
 *
 * The memory is a folder per topic and a file per fact (memoryFiles.mjs). The planner works by
 * topic; a fact is named by its path, `memories/<topic>/<name>.md`.
 */
import { z } from "zod";

import { isTopicName } from "./memoryFiles.mjs";
import { NOTE_LENGTH } from "./review.mjs";

const FACT_PATH = /^memories\/[a-z0-9]+(?:-[a-z0-9]+)*\/[^/]+\.md$/;
const topicName = z.string().refine(isTopicName, { message: 'a topic is lowercase words joined by "-", and not "index"' });
const status = z.enum(["ok", "error"]);
const alertKind = z.enum(["flip-flop", "kept-old-value", "docs-outdated", "other"]);

const candidate = z.object({
  id: z.string().min(1),
  fact: z.string().min(1),
  kind: z.enum(["decision", "pitfall", "convention", "rule", "other"]),
  source: z.object({
    sessionId: z.string().min(1),
    line: z.string().min(1),
    timestamp: z.iso.datetime({ offset: true }),
    branch: z.string().min(1),
  }),
  signaled: z.boolean(),
});

const alert = z.object({ kind: alertKind, message: z.string().min(1) });

/**
 * One line per fact a change creates, edits or deletes: the owner's summary, above the prompt. The
 * length is told, not enforced: formatSummary cuts a longer note.
 */
const notes = z
  .array(z.object({ path: z.string().regex(FACT_PATH), note: z.string().min(1).describe(`One line, at most ${NOTE_LENGTH} characters.`) }))
  .default([]);

/** P2: the candidates of one conversation. */
export const extractorReply = z.object({ status, error: z.string().optional(), candidates: z.array(candidate) });

/**
 * P3: which topics to write (an existing one to update, a new one to create) from which candidates,
 * which facts and which whole topics to delete, and why each candidate left out was left out. A
 * fact cannot be deleted as unused: reads are counted by topic. `dropped` is required in the JSON
 * Schema the model gets; a reply without it parses as an empty list, and so do the two deletions.
 */
export const plannerReply = z.object({
  status,
  error: z.string().optional(),
  topics: z.array(z.object({ topic: topicName, action: z.enum(["create", "update"]), candidates: z.array(z.string()) })),
  delete: z.array(z.object({ fact: z.string().regex(FACT_PATH), reason: z.string().min(1), because: z.enum(["gone", "wrong"]) })).default([]),
  deleteTopics: z.array(z.object({ topic: topicName, reason: z.string().min(1), because: z.enum(["unused", "gone"]) })).default([]),
  dropped: z.array(z.object({ candidate: z.string().min(1), reason: z.string().min(1) })).default([]),
  docsIssues: z.array(z.object({ doc: z.string().regex(/^docs\//), issue: z.string().min(1) })),
});

/** P4: what one writer put in its topic, and what it wants the owner to see. */
export const writerReply = z.object({
  status,
  error: z.string().optional(),
  topic: topicName,
  facts: z.array(z.object({ text: z.string().min(1), candidates: z.array(z.string()) })),
  alerts: z.array(alert),
});

/**
 * [m]: the facts a correction touched. The owner's instruction is the source, not a candidate.
 * `drop` names the facts to delete: the script deletes them, since the writer has no tool that can.
 * Any fact may go: the owner asked for it and sees the diff again. `notes` replace the reviewer's
 * notes for the facts the correction touched.
 */
export const correctionReply = z.object({
  status,
  error: z.string().optional(),
  changed: z.array(z.string().regex(FACT_PATH)),
  alerts: z.array(alert),
  drop: z.array(z.string().regex(FACT_PATH)).default([]),
  notes,
});

/**
 * P6: what the reviewer doubts, with its evidence. `fix` says what it changed in the copy when it
 * fixed the flag itself; a flag without it is left for the owner. `drop` names facts this dream
 * created that the reviewer finds not worth keeping: the script deletes them, since Edit cannot. A
 * reply without it parses as an empty list. `notes` say, after the fixes, what each changed fact
 * now teaches or why it changed: the owner reads them last, just above the prompt.
 */
export const reviewerReply = z.object({
  status,
  error: z.string().optional(),
  flags: z.array(
    z.object({
      path: z.string().min(1),
      fact: z.string().min(1),
      problem: z.string().min(1),
      evidence: z.string().min(1),
      severity: z.enum(["low", "medium", "high"]),
      fix: z.string().min(1).optional(),
    }),
  ),
  drop: z.array(z.string().regex(FACT_PATH)).default([]),
  notes,
});

/** `schema` as the JSON text `claude -p --json-schema` takes. */
export const jsonSchemaOf = (schema) => {
  const { $schema: _draft, ...rest } = z.toJSONSchema(schema);
  return JSON.stringify(rest);
};

/**
 * What is wrong with a plan, as sentences; empty when it holds. `candidateIds` are the ids the
 * extractors returned; `topics` the topics that exist now, `facts` their fact paths.
 */
export const checkPlan = (plan, { candidateIds, topics, facts }) => {
  const problems = [];
  const written = new Set();
  const assigned = new Set();
  for (const entry of plan.topics) {
    if (written.has(entry.topic)) problems.push(`topic ${entry.topic} appears twice in the plan`);
    written.add(entry.topic);
    if (entry.action === "create" && topics.has(entry.topic)) problems.push(`topic ${entry.topic} is planned as new but exists`);
    if (entry.action === "update" && !topics.has(entry.topic)) problems.push(`topic ${entry.topic} is planned to update but does not exist`);
    if (entry.candidates.length === 0) problems.push(`topic ${entry.topic} has no candidate to write from`);
    for (const id of entry.candidates) {
      if (!candidateIds.has(id)) problems.push(`topic ${entry.topic} cites candidate ${id}, which no extractor returned`);
      else if (assigned.has(id)) problems.push(`candidate ${id} is assigned to two topics`);
      assigned.add(id);
    }
  }
  const deletedFacts = new Set();
  for (const { fact } of plan.delete) {
    if (deletedFacts.has(fact)) problems.push(`fact ${fact} is deleted twice`);
    deletedFacts.add(fact);
    if (!facts.has(fact)) problems.push(`fact ${fact} is planned to delete but does not exist`);
  }
  const deletedTopics = new Set();
  for (const { topic } of plan.deleteTopics) {
    if (deletedTopics.has(topic)) problems.push(`topic ${topic} is deleted twice`);
    deletedTopics.add(topic);
    if (!topics.has(topic)) problems.push(`topic ${topic} is planned to delete but does not exist`);
    if (written.has(topic)) problems.push(`topic ${topic} is both deleted and written`);
  }
  for (const { candidate } of plan.dropped ?? []) {
    if (!candidateIds.has(candidate)) problems.push(`the plan drops candidate ${candidate}, which no extractor returned`);
    else if (assigned.has(candidate)) problems.push(`candidate ${candidate} is both assigned to a topic and dropped`);
  }
  return problems;
};

/** A topic may be deleted as unused once this many sessions started without reading it. */
export const UNUSED_AFTER_SESSIONS = 60;

/**
 * The plan without the topic deletions the usage does not support, and an alert for each one
 * removed. A deletion `because: "unused"` needs UNUSED_AFTER_SESSIONS sessions since the topic's
 * last read or creation (`totals`: topic → `{ sessionsSinceRead }`, from usage.mjs). A deletion
 * `because: "gone"` (its subject is gone) passes: the owner judges its reason in the diff. A
 * removed deletion does not stop the dream; the topic is kept.
 */
export const screenDeletions = (plan, totals) => {
  const alerts = [];
  const deleteTopics = plan.deleteTopics.filter((entry) => {
    if (entry.because === "gone") return true;
    const sessions = totals.get(entry.topic)?.sessionsSinceRead ?? 0;
    if (sessions >= UNUSED_AFTER_SESSIONS) return true;
    alerts.push({
      kind: "planner",
      message: `kept topic ${entry.topic}: the planner wants to delete it as unused, but only ${sessions} session(s) started since it was last read (${UNUSED_AFTER_SESSIONS} needed)`,
    });
    return false;
  });
  return { plan: { ...plan, deleteTopics }, alerts };
};

/**
 * Every candidate no topic of the plan uses, with its fact and the planner's reason. The list comes
 * from the candidates, not from `plan.dropped`: a candidate the planner forgot to explain is still
 * shown, with no reason.
 */
export const droppedCandidates = (plan, candidates) => {
  const used = new Set(plan.topics.flatMap((entry) => entry.candidates));
  const reasons = new Map((plan.dropped ?? []).map((entry) => [entry.candidate, entry.reason]));
  return candidates.filter(({ id }) => !used.has(id)).map(({ id, fact }) => ({ id, fact, reason: reasons.get(id) ?? "no reason given" }));
};

/** What is wrong with a writer's reply for the plan entry it was given. */
export const checkWriterReply = (reply, entry) => {
  const problems = [];
  if (reply.topic !== entry.topic) problems.push(`the writer answered for topic ${reply.topic}, not ${entry.topic}`);
  if (reply.facts.length === 0) problems.push(`the writer for topic ${entry.topic} reports no fact`);
  for (const fact of reply.facts) {
    for (const id of fact.candidates) {
      if (!entry.candidates.includes(id)) problems.push(`a fact in topic ${entry.topic} cites ${id}, which is not one of its candidates`);
    }
  }
  return problems;
};
