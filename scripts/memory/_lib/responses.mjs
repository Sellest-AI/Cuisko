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

/** P2: the candidates of one conversation. */
export const extractorReply = z.object({ status, error: z.string().optional(), candidates: z.array(candidate) });

/** P3: which files to create, update or delete, from which candidates. */
export const plannerReply = z.object({
  status,
  error: z.string().optional(),
  files: z.array(
    z.object({
      path: z.string().regex(MEMORY_PATH),
      action: z.enum(["create", "update", "delete"]),
      candidates: z.array(z.string()),
      reason: z.string().optional(),
    }),
  ),
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

/** [m]: the files a correction touched. The owner's instruction is the source, not a candidate. */
export const correctionReply = z.object({
  status,
  error: z.string().optional(),
  changed: z.array(z.string().regex(MEMORY_PATH)),
  alerts: z.array(alert),
});

/** P6: what the reviewer doubts, with its evidence. It never rewrites. */
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
    }),
  ),
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
  return problems;
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
