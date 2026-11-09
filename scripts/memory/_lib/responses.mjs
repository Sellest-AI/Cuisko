/**
 * What each dream agent answers (spec §10.4), as Zod schemas, and the cross-checks a schema cannot
 * express. Every agent ends with one JSON reply; runAgent validates it against the schema here and
 * hands the script plain data. The same schema, as JSON Schema, goes to `claude -p --json-schema`,
 * so the model is told the shape and the script checks it anyway.
 *
 * A reply is never trusted past its shape: `checkPlan` and `checkWriterReply` refuse a plan that
 * names a candidate nobody extracted, a file that does not exist, or a writer that answers for
 * another file. A dream that cannot be checked stops, it does not guess.
 */
import { z } from "zod";

import { NOTE_LENGTH } from "./review.mjs";

const MEMORY_PATH = /^memories\/[^/]+\.md$/;
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
 * One line per memory file a change creates, edits or deletes: the owner's summary, above the
 * prompt. The length is told, not enforced: formatSummary cuts a longer note.
 */
const notes = z
  .array(z.object({ path: z.string().regex(MEMORY_PATH), note: z.string().min(1).describe(`One line, at most ${NOTE_LENGTH} characters.`) }))
  .default([]);

/** P2: the candidates of one conversation. */
export const extractorReply = z.object({ status, error: z.string().optional(), candidates: z.array(candidate) });

/**
 * P3: which files to create, update or delete, from which candidates, and why each candidate left
 * out was left out. `dropped` is required in the JSON Schema the model gets; a reply without it
 * parses as an empty list.
 */
export const plannerReply = z.object({
  status,
  error: z.string().optional(),
  files: z.array(
    z.object({
      path: z.string().regex(MEMORY_PATH),
      action: z.enum(["create", "update", "delete"]),
      candidates: z.array(z.string()),
      reason: z.string().optional(),
      because: z.enum(["unused", "obsolete"]).optional(),
    }),
  ),
  dropped: z.array(z.object({ candidate: z.string().min(1), reason: z.string().min(1) })).default([]),
  docsIssues: z.array(z.object({ doc: z.string().regex(/^docs\//), issue: z.string().min(1) })),
});

/** P4: what one writer put in its file, and what it wants the owner to see. */
export const writerReply = z.object({
  status,
  error: z.string().optional(),
  path: z.string().regex(MEMORY_PATH),
  facts: z.array(z.object({ text: z.string().min(1), candidates: z.array(z.string()) })),
  alerts: z.array(alert),
});

/**
 * [m]: the files a correction touched. The owner's instruction is the source, not a candidate.
 * `drop` names the files to delete: the script deletes them, since the writer has no tool that can.
 * Any file in `memories/` may go: the owner asked for it and sees the diff again. `notes` replace
 * the reviewer's notes for the files the correction touched.
 */
export const correctionReply = z.object({
  status,
  error: z.string().optional(),
  changed: z.array(z.string().regex(MEMORY_PATH)),
  alerts: z.array(alert),
  drop: z.array(z.string().regex(MEMORY_PATH)).default([]),
  notes,
});

/**
 * P6: what the reviewer doubts, with its evidence. `fix` says what it changed in the copy when it
 * fixed the flag itself; a flag without it is left for the owner. `drop` names files this dream
 * created that the reviewer finds not worth keeping: the script deletes them, since Edit cannot. A
 * reply without it parses as an empty list. `notes` say, after the fixes, what each changed file
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
  drop: z.array(z.string().regex(MEMORY_PATH)).default([]),
  notes,
});

/** `schema` as the JSON text `claude -p --json-schema` takes. */
export const jsonSchemaOf = (schema) => {
  const { $schema: _draft, ...rest } = z.toJSONSchema(schema);
  return JSON.stringify(rest);
};

/**
 * What is wrong with a plan, as sentences; empty when it holds. `candidateIds` are the ids the
 * extractors returned, `existing` the memory files that exist now (`memories/<name>.md`).
 */
export const checkPlan = (plan, { candidateIds, existing }) => {
  const problems = [];
  const seenPaths = new Set();
  const assigned = new Set();
  for (const file of plan.files) {
    if (seenPaths.has(file.path)) problems.push(`${file.path} appears twice in the plan`);
    seenPaths.add(file.path);
    if (file.action === "create" && existing.has(file.path)) problems.push(`${file.path} is planned as new but exists`);
    if (file.action !== "create" && !existing.has(file.path)) problems.push(`${file.path} is planned to ${file.action} but does not exist`);
    if (file.action === "delete" && (file.reason ?? "") === "") problems.push(`${file.path} is deleted without a reason`);
    if (file.action !== "delete" && file.candidates.length === 0) problems.push(`${file.path} has no candidate to write from`);
    for (const id of file.candidates) {
      if (!candidateIds.has(id)) problems.push(`${file.path} cites candidate ${id}, which no extractor returned`);
      else if (assigned.has(id)) problems.push(`candidate ${id} is assigned to two files`);
      assigned.add(id);
    }
  }
  for (const { candidate } of plan.dropped ?? []) {
    if (!candidateIds.has(candidate)) problems.push(`the plan drops candidate ${candidate}, which no extractor returned`);
    else if (assigned.has(candidate)) problems.push(`candidate ${candidate} is both assigned to a file and dropped`);
  }
  return problems;
};

/** A memory file may be deleted as unused once this many sessions started without reading it. */
export const UNUSED_AFTER_SESSIONS = 60;

/**
 * The plan without the deletions the usage does not support, and an alert for each one removed. A
 * deletion `because: "unused"` (or with no `because`) needs UNUSED_AFTER_SESSIONS sessions since
 * the file's last read or creation. A deletion `because: "obsolete"` (its subject is gone) passes:
 * the owner judges its reason in the diff. A removed deletion does not stop the dream; the file is
 * kept.
 */
export const screenDeletions = (plan, usage) => {
  const alerts = [];
  const files = plan.files.filter((file) => {
    if (file.action !== "delete" || file.because === "obsolete") return true;
    const sessions = usage.files[file.path]?.sessionsSinceRead ?? 0;
    if (sessions >= UNUSED_AFTER_SESSIONS) return true;
    alerts.push({
      kind: "planner",
      message: `kept ${file.path}: the planner wants to delete it as unused, but only ${sessions} session(s) started since it was last read (${UNUSED_AFTER_SESSIONS} needed)`,
    });
    return false;
  });
  return { plan: { ...plan, files }, alerts };
};

/**
 * Every candidate no file of the plan uses, with its fact and the planner's reason. The list comes
 * from the candidates, not from `plan.dropped`: a candidate the planner forgot to explain is still
 * shown, with no reason.
 */
export const droppedCandidates = (plan, candidates) => {
  const used = new Set(plan.files.flatMap((file) => file.candidates));
  const reasons = new Map((plan.dropped ?? []).map((entry) => [entry.candidate, entry.reason]));
  return candidates.filter(({ id }) => !used.has(id)).map(({ id, fact }) => ({ id, fact, reason: reasons.get(id) ?? "no reason given" }));
};

/** What is wrong with a writer's reply for the plan entry it was given. */
export const checkWriterReply = (reply, entry) => {
  const problems = [];
  if (reply.path !== entry.path) problems.push(`the writer answered for ${reply.path}, not ${entry.path}`);
  if (reply.facts.length === 0) problems.push(`the writer for ${entry.path} reports no fact`);
  for (const fact of reply.facts) {
    for (const id of fact.candidates) {
      if (!entry.candidates.includes(id)) problems.push(`a fact in ${entry.path} cites ${id}, which is not one of its candidates`);
    }
  }
  return problems;
};
