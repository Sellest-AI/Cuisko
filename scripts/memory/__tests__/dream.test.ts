/**
 * The dream with its models replaced by hand-written replies (spec §10, P2–P6). What is pinned:
 * the order and the inputs of the steps, that a reply is checked before it is trusted, that a
 * writer changes its own topic folder only and never renames or deletes a fact, that only the
 * script names a fact, and that the reviewer's fixes stay inside what the dream wrote and are
 * checked again. No model is called.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/dream.mjs";
import * as files from "../_lib/memoryFiles.mjs";
import * as responses from "../_lib/responses.mjs";

type Line = {
  uuid: string;
  sessionId: string;
  timestamp: string;
  cwd: string;
  branch: string;
  role: "user" | "assistant";
  isToolResult: boolean;
  isSynthetic: boolean;
  text: string;
  toolCalls: { name: string; input: Record<string, unknown> }[];
  transcript: string;
};
type Call = { agent: string; name: string; prompt: string; writable: string[] };
type Run = (call: Call) => Promise<unknown>;
type Verdict = { ok: boolean; output: string };
type Result = {
  plan: { topics: { topic: string; action: string }[]; delete: unknown[]; deleteTopics: unknown[] };
  candidates: { id: string }[];
  writerReplies: unknown[];
  flags: { path: string; fix?: string }[];
  notes: { path: string; note: string }[];
  alerts: { kind: string; message: string }[];
  passages: string;
};
type CorrectionReply = { changed: string[]; notes: { path: string; note: string }[] };
const { UNUSED_AFTER_SESSIONS } = responses as unknown as { UNUSED_AFTER_SESSIONS: number };
const { isFactName } = files as unknown as { isFactName: (name: string) => boolean };
const { correct, dream } = lib as unknown as {
  dream: (input: Record<string, unknown>) => Promise<Result>;
  correct: (input: Record<string, unknown>) => Promise<{ reply: CorrectionReply; verdict: Verdict }>;
};

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const CONTEXT = { identity: {}, repoRoot: "C:/work/cuisko" };
const FACT = (title: string, fact = "A fact. (source: 2026-11-02)", created = "2026-09-01") =>
  `---\ntitle: ${title}\nstatus: stable\ncreated: ${created}\nlast_verified: 2026-11-08\n---\n\n${fact}\n`;

/** The facts of the copy every test starts from: two in topic api, one in topic old. */
const API_FACT = "memories/api/dates-are-timestamps-k3f9.md";
const API_OLD_FACT = "memories/api/old-endpoint-q1w2.md";
const OLD_FACT = "memories/old/old-stuff-p2a7.md";

/**
 * A working copy: the owner's two files, three facts, and one usage file. `sessions` sessions
 * started after the api topic was last read and after the old topic was created; old was never
 * read, so `sessions` is its sessionsSinceRead too.
 */
const makeCopy = ({ sessions = UNUSED_AFTER_SESSIONS }: { sessions?: number } = {}) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "memory-dream-"));
  dirs.push(dir);
  const copy = path.join(dir, "copy");
  for (const folder of ["memories/api", "memories/old", "usage"]) mkdirSync(path.join(copy, folder), { recursive: true });
  writeFileSync(path.join(copy, "README.md"), "# Rules\n");
  writeFileSync(path.join(copy, "_template.md"), "# Template\n");
  writeFileSync(path.join(copy, API_FACT), FACT("Dates are timestamps"));
  writeFileSync(path.join(copy, API_OLD_FACT), FACT("Old endpoint"));
  writeFileSync(path.join(copy, OLD_FACT), FACT("Old stuff"));
  const starts = Array.from({ length: sessions }, (_, at) => new Date(Date.UTC(2026, 9, 2, 0, at)).toISOString());
  writeFileSync(
    path.join(copy, "usage", "2026-11-01-a1b2.json"),
    JSON.stringify({ version: 2, sessions: starts, reads: { api: { count: 4, last: "2026-10-01T00:00:00.000Z" } } }),
  );
  return { dir, copy, inputsDir: path.join(dir, "inputs") };
};

/** The facts of one topic folder of the copy, by file name. */
const factsIn = (copy: string, topic: string) => (existsSync(path.join(copy, "memories", topic)) ? readdirSync(path.join(copy, "memories", topic)).sort() : []);

let counter = 0;
const line = (sessionId: string, over: Partial<Line> = {}): Line => {
  counter += 1;
  return {
    uuid: `${sessionId}-line-${counter}`,
    sessionId,
    timestamp: `2026-11-02T10:${String(counter % 60).padStart(2, "0")}:00.000Z`,
    cwd: "C:/work/cuisko",
    branch: "dev",
    role: "user",
    isToolResult: false,
    isSynthetic: false,
    text: "Dates are timestamps in milliseconds.",
    toolCalls: [],
    transcript: "t.jsonl",
    ...over,
  };
};

const candidate = (id: string, sessionId: string, lineId: string) => ({
  id,
  fact: `fact ${id}`,
  kind: "pitfall",
  source: { sessionId, line: lineId, timestamp: "2026-11-02T10:00:00.000Z", branch: "dev" },
  signaled: false,
});

/** A planner reply: the lists it may leave out parse as empty, so the fake gives them. */
const planOf = (over: Record<string, unknown>) => ({ status: "ok", topics: [], delete: [], deleteTopics: [], dropped: [], docsIssues: [], ...over });

/** The folder a writer was granted: its one writable glob, without the `**`. */
const folderOf = (call: Call) => path.dirname(call.writable[0] as string);

/** Replies by agent, with a log of every call. A writer's or a reviewer's reply may also write files. */
const stub = (replies: {
  extractor?: (call: Call) => unknown;
  planner?: unknown;
  writer?: (call: Call) => unknown;
  reviewer?: unknown;
  review?: (call: Call) => unknown;
}) => {
  const calls: Call[] = [];
  const run: Run = async (call) => {
    calls.push(call);
    if (call.agent === "dream-extractor") return replies.extractor?.(call);
    if (call.agent === "dream-planner") return replies.planner;
    if (call.agent === "dream-writer") return replies.writer?.(call);
    if (replies.review !== undefined) return replies.review(call);
    return replies.reviewer ?? { status: "ok", flags: [] };
  };
  return { run, calls };
};

const OK_CHECK = (): Verdict => ({ ok: true, output: "" });
const base = (copy: string, inputsDir: string, over: Record<string, unknown> = {}) => ({
  copy,
  inputsDir,
  context: CONTEXT,
  check: OK_CHECK,
  diff: () => "the diff",
  today: "2026-11-08",
  ...over,
});

const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (result) => ({ result, error: undefined }),
    (caught: Error) => ({ result: undefined, error: caught }),
  );

describe("dream: the whole chain", () => {
  const lineA = line("sA");
  const lineB = line("sB", { role: "assistant", text: "Mail jean@example.com about it." });

  /** sA-01 updates topic api with a new fact, sB-01 creates topic upload; the plan also deletes a fact and topic old. */
  const happy = (over: { sessions?: number } = {}) => {
    const { copy, inputsDir } = makeCopy(over);
    const s = stub({
      extractor: (call) => ({
        status: "ok",
        candidates: call.name === "extractor-sA" ? [candidate("sA-01", "sA", lineA.uuid)] : [candidate("sB-01", "sB", lineB.uuid)],
      }),
      planner: planOf({
        topics: [
          { topic: "api", action: "update", candidates: ["sA-01"] },
          { topic: "upload", action: "create", candidates: ["sB-01"] },
        ],
        delete: [{ fact: API_OLD_FACT, reason: "The endpoint is gone.", because: "gone" }],
        deleteTopics: [{ topic: "old", reason: "Never read.", because: "unused" }],
        docsIssues: [{ doc: "docs/ARCHITECTURE.md", issue: "Stale." }],
      }),
      writer: (call) => {
        const isApi = call.name.endsWith("-api");
        writeFileSync(path.join(folderOf(call), "fact.md"), FACT(isApi ? "Dates in milliseconds" : "Upload limits", "A fact. (source: 2026-11-02)", "2026-11-08"));
        return {
          status: "ok",
          topic: isApi ? "api" : "upload",
          facts: [{ text: "A fact.", candidates: [isApi ? "sA-01" : "sB-01"] }],
          alerts: [{ kind: "flip-flop", message: "went back" }],
        };
      },
      reviewer: { status: "ok", flags: [{ path: "memories/upload/fact.md", fact: "A fact.", problem: "Unsupported.", evidence: "sB-01", severity: "medium" }] },
    });
    return { copy, inputsDir, ...s };
  };

  it("runs extract, plan, write, check, review in order and returns what the owner sees", async () => {
    const { copy, inputsDir, run, calls } = happy();

    const result = await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    expect(calls.map((call) => call.agent)).toEqual(["dream-extractor", "dream-extractor", "dream-planner", "dream-writer", "dream-writer", "dream-reviewer"]);
    expect(result.candidates.map((c) => c.id)).toEqual(["sA-01", "sB-01"]);
    expect(result.plan.topics.map((entry) => entry.topic)).toEqual(["api", "upload"]);
    expect(result.flags).toHaveLength(1);
    expect(result.alerts).toEqual([
      { kind: "flip-flop", message: "went back" },
      { kind: "flip-flop", message: "went back" },
    ]);
    expect(result.writerReplies).toHaveLength(2);
  });

  it("grants each writer its own topic folder, the new one included", async () => {
    const { copy, inputsDir, run, calls } = happy();

    await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    const writers = calls.filter((call) => call.agent === "dream-writer");
    expect(writers.map((call) => call.name)).toEqual(["writer-1-api", "writer-2-upload"]);
    expect(writers.map((call) => call.writable)).toEqual([[path.join(copy, "memories", "api", "**")], [path.join(copy, "memories", "upload", "**")]]);
    expect(writers[1]?.prompt).toContain(`The one folder you may write is ${path.join(copy, "memories", "upload")}`);
  });

  it("deletes the facts and the topics the plan deletes before the writers run", async () => {
    const { copy, inputsDir, run } = happy();

    await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    expect(existsSync(path.join(copy, API_OLD_FACT))).toBe(false);
    expect(existsSync(path.join(copy, "memories", "old"))).toBe(false);
    expect(existsSync(path.join(copy, API_FACT))).toBe(true);
  });

  it("keeps a topic the planner deletes as unused when too few sessions ran since it was read, and tells the owner", async () => {
    const { copy, inputsDir, run } = happy({ sessions: 10 });

    const result = await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    expect(existsSync(path.join(copy, OLD_FACT))).toBe(true);
    expect(result.plan.deleteTopics).toEqual([]);
    expect(result.alerts[0]).toEqual({
      kind: "planner",
      message: `kept topic old: the planner wants to delete it as unused, but only 10 session(s) started since it was last read (${UNUSED_AFTER_SESSIONS} needed)`,
    });
  });

  it("names every new fact from its title, and leaves a fact already named as it was", async () => {
    const { copy, inputsDir, run } = happy();

    await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    const api = factsIn(copy, "api");
    expect(api).toHaveLength(2);
    expect(api).toContain(path.basename(API_FACT));
    expect(api.find((name) => name !== path.basename(API_FACT))).toMatch(/^dates-in-milliseconds-[a-z0-9]{4}\.md$/);
    expect(factsIn(copy, "upload")).toEqual([expect.stringMatching(/^upload-limits-[a-z0-9]{4}\.md$/)]);
  });

  it("gives facts with the same title in two topics written in parallel two different legal names", async () => {
    const { copy, inputsDir } = makeCopy();
    const s = stub({
      extractor: () => ({ status: "ok", candidates: [candidate("sA-01", "sA", lineA.uuid), candidate("sA-02", "sA", lineA.uuid)] }),
      planner: planOf({
        topics: [
          { topic: "api", action: "update", candidates: ["sA-01"] },
          { topic: "upload", action: "create", candidates: ["sA-02"] },
        ],
      }),
      writer: (call) => {
        const isApi = call.name.endsWith("-api");
        writeFileSync(path.join(folderOf(call), "new.md"), FACT("Same title"));
        return { status: "ok", topic: isApi ? "api" : "upload", facts: [{ text: "f", candidates: [isApi ? "sA-01" : "sA-02"] }], alerts: [] };
      },
    });

    await dream({ ...base(copy, inputsDir), lines: [lineA], run: s.run, parallel: 2 });

    const named = [...factsIn(copy, "api").filter((name) => name.startsWith("same-title-")), ...factsIn(copy, "upload")];
    expect(named).toHaveLength(2);
    expect(named.every((name) => isFactName(name) && name.startsWith("same-title-"))).toBe(true);
    expect(new Set(named).size).toBe(2);
  });

  it("renames a new fact even when the writer gave it a legal-looking name", async () => {
    const { copy, inputsDir } = makeCopy();
    const s = stub({
      extractor: () => ({ status: "ok", candidates: [candidate("sA-01", "sA", lineA.uuid)] }),
      planner: planOf({ topics: [{ topic: "upload", action: "create", candidates: ["sA-01"] }] }),
      writer: (call) => {
        writeFileSync(path.join(folderOf(call), "chosen-by-model-ab12.md"), FACT("Upload limits"));
        return { status: "ok", topic: "upload", facts: [{ text: "f", candidates: ["sA-01"] }], alerts: [] };
      },
    });

    await dream({ ...base(copy, inputsDir), lines: [lineA], run: s.run });

    expect(factsIn(copy, "upload")).toEqual([expect.stringMatching(/^upload-limits-[a-z0-9]{4}\.md$/)]);
  });

  it("masks personal data in every prompt a model reads", async () => {
    const { copy, inputsDir, run, calls } = happy();

    await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    for (const call of calls) expect(call.prompt).not.toContain("jean@example.com");
    expect(calls.find((call) => call.name === "extractor-sB")?.prompt).toContain("[email masked]");
  });

  it("hands the planner each topic's facts and usage totals, and the reviewer the diff, the plan and the writers' replies", async () => {
    const { copy, inputsDir, run, calls } = happy();

    await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    const planner = calls.find((call) => call.agent === "dream-planner")?.prompt ?? "";
    expect(planner).toContain('"topic": "api"');
    expect(planner).toContain('"reads": 4');
    expect(planner).toContain('"lastRead": "2026-10-01T00:00:00.000Z"');
    expect(planner).toContain(`"sessionsSinceRead": ${UNUSED_AFTER_SESSIONS}`);
    expect(planner).toContain(`"path": "${API_FACT}"`);
    expect(planner).toContain('"title": "Dates are timestamps"');
    const review = calls.find((call) => call.agent === "dream-reviewer")?.prompt ?? "";
    expect(review).toContain("the diff");
    expect(review).toContain('"action": "create"');
    expect(review).toContain("<writer-replies>");
  });

  it("writes a very long conversation to a file and points the prompt at it", async () => {
    const { copy, inputsDir } = makeCopy();
    const long = line("sL", { text: "x".repeat(500) });
    const s = stub({ extractor: () => ({ status: "ok", candidates: [] }) });

    await dream({ ...base(copy, inputsDir), lines: [long], run: s.run, inlineLimit: 100 });

    expect(s.calls[0]?.prompt).toContain(path.join(inputsDir, "conversation-sL.md"));
    expect(readFileSync(path.join(inputsDir, "conversation-sL.md"), "utf8")).toContain("xxxx");
  });

  it("stops after the extractors when they find nothing, and plans nothing", async () => {
    const { copy, inputsDir } = makeCopy();
    const s = stub({ extractor: () => ({ status: "ok", candidates: [] }) });

    const result = await dream({ ...base(copy, inputsDir), lines: [lineA], run: s.run });

    expect(s.calls.map((call) => call.agent)).toEqual(["dream-extractor"]);
    expect(result.plan.topics).toEqual([]);
  });
});

describe("dream: what it refuses", () => {
  const lineA = line("sA");
  const cands = (...list: ReturnType<typeof candidate>[]) => () => ({ status: "ok", candidates: list });

  const failing = async (replies: Parameters<typeof stub>[0], over: Record<string, unknown> = {}) => {
    const { copy, inputsDir } = makeCopy();
    const s = stub(replies);
    const { error } = await settle(dream({ ...base(copy, inputsDir, over), lines: [lineA], run: s.run }));
    return { error, calls: s.calls, copy };
  };

  it("refuses a candidate that cites a line not in the conversation, a session not read, or a reused id", async () => {
    const wrongLine = await failing({ extractor: cands(candidate("sA-01", "sA", "invented")) });
    const wrongSession = await failing({ extractor: cands(candidate("sA-01", "zzz", lineA.uuid)) });
    const reused = await failing({ extractor: cands(candidate("sA-01", "sA", lineA.uuid), candidate("sA-01", "sA", lineA.uuid)) });

    expect(wrongLine.error?.name).toBe("DreamError");
    expect(wrongLine.error?.message).toContain("cites line invented, which is not in session sA");
    expect(wrongSession.error?.message).toContain("cites session zzz, which was not read");
    expect(reused.error?.message).toContain("candidate id sA-01 is used twice");
    expect(wrongLine.calls.map((call) => call.agent)).toEqual(["dream-extractor"]);
  });

  it("refuses a plan that cites a candidate nobody extracted, before anything is deleted or written", async () => {
    const { error, calls, copy } = await failing({
      extractor: cands(candidate("sA-01", "sA", lineA.uuid)),
      planner: planOf({
        topics: [{ topic: "api", action: "update", candidates: ["ghost"] }],
        delete: [{ fact: API_OLD_FACT, reason: "Gone.", because: "gone" }],
      }),
    });

    expect(error?.message).toContain("the plan cannot be used");
    expect(error?.message).toContain("ghost");
    expect(calls.some((call) => call.agent === "dream-writer")).toBe(false);
    expect(existsSync(path.join(copy, API_OLD_FACT))).toBe(true);
  });

  const withWriter = (writer: (call: Call) => unknown) => ({
    extractor: cands(candidate("sA-01", "sA", lineA.uuid)),
    planner: planOf({ topics: [{ topic: "api", action: "update", candidates: ["sA-01"] }] }),
    writer,
  });
  const reply = { status: "ok", topic: "api", facts: [{ text: "f", candidates: ["sA-01"] }], alerts: [] };

  it("refuses a writer that answers for another topic or writes nothing", async () => {
    const wrongTopic = await failing(withWriter(() => ({ ...reply, topic: "other" })));
    const nothing = await failing(withWriter(() => reply));

    expect(wrongTopic.error?.message).toContain("the writer for topic api cannot be used");
    expect(wrongTopic.error?.message).toContain("answered for topic other, not api");
    expect(nothing.error?.message).toContain("a writer wrote nothing");
    expect(nothing.error?.message).toContain("topic api");
  });

  it("refuses a writer that changed files outside its topic folder", async () => {
    const { error, copy } = await failing(
      withWriter((call) => {
        const copyDir = path.join(folderOf(call), "..", "..");
        writeFileSync(path.join(copyDir, API_FACT), FACT("Dates are timestamps", "Edited. (source: 2026-11-02)"));
        writeFileSync(path.join(copyDir, OLD_FACT), "tampered");
        writeFileSync(path.join(copyDir, "README.md"), "tampered");
        return reply;
      }),
    );

    expect(error?.message).toContain("a writer changed files outside its topic");
    expect(error?.message).toContain(OLD_FACT);
    expect(error?.message).toContain("README.md");
    expect(error?.message).not.toContain(API_FACT);
    expect(readFileSync(path.join(copy, OLD_FACT), "utf8")).toBe("tampered");
  });

  it("refuses a writer that renamed a fact, or deleted one, in its own topic", async () => {
    const renamed = await failing(
      withWriter((call) => {
        renameSync(path.join(folderOf(call), path.basename(API_FACT)), path.join(folderOf(call), "better-name-zz99.md"));
        return reply;
      }),
    );
    const deleted = await failing(
      withWriter((call) => {
        rmSync(path.join(folderOf(call), path.basename(API_OLD_FACT)));
        writeFileSync(path.join(folderOf(call), path.basename(API_FACT)), FACT("Dates are timestamps", "Edited. (source: 2026-11-02)"));
        return reply;
      }),
    );

    expect(renamed.error?.message).toContain("a writer renamed or deleted facts");
    expect(renamed.error?.message).toContain(API_FACT);
    expect(deleted.error?.message).toContain("a writer renamed or deleted facts");
    expect(deleted.error?.message).toContain(API_OLD_FACT);
    expect(renamed.calls.some((call) => call.agent === "dream-reviewer")).toBe(false);
  });

  it("stops on a failed mechanical check, with its output, before the reviewer", async () => {
    const good = withWriter((call) => {
      writeFileSync(path.join(folderOf(call), "new.md"), FACT("New fact"));
      return reply;
    });

    const { error, calls } = await failing(good, { check: () => ({ ok: false, output: "❌ C20\n   memories/api/new.md\n      fact without a source date\n" }) });

    expect(error?.message).toContain("the mechanical checks failed");
    expect(error?.message).toContain("fact without a source date");
    expect(calls.some((call) => call.agent === "dream-reviewer")).toBe(false);
  });
});

describe("dream: the reviewer's fixes", () => {
  const lineA = line("sA");
  const flag = (over: Record<string, unknown> = {}) => ({ path: API_FACT, fact: "A fact.", problem: "Unsupported.", evidence: "sA-01", severity: "medium", ...over });

  /**
   * One topic written, then `review(call, copy)` as the reviewer; `verdicts` are the checks'
   * answers, in order. By default the writer edits API_FACT in topic api; with `create`, it writes
   * a new fact in topic upload, which the script then names.
   */
  const reviewing = async (review: (call: Call, copy: string) => unknown, { verdicts = [], create = false }: { verdicts?: Verdict[]; create?: boolean } = {}) => {
    const { copy, inputsDir } = makeCopy();
    const topic = create ? "upload" : "api";
    const s = stub({
      extractor: () => ({ status: "ok", candidates: [candidate("sA-01", "sA", lineA.uuid)] }),
      planner: planOf({ topics: [{ topic, action: create ? "create" : "update", candidates: ["sA-01"] }] }),
      writer: (call) => {
        if (create) writeFileSync(path.join(folderOf(call), "new.md"), FACT("Upload limits"));
        else writeFileSync(path.join(copy, API_FACT), FACT("Dates are timestamps", "Dates are milliseconds. (source: 2026-11-02)"));
        return { status: "ok", topic, facts: [{ text: "A fact.", candidates: ["sA-01"] }], alerts: [] };
      },
      review: (call) => review(call, copy),
    });
    let checks = 0;
    const check = () => verdicts[checks++] ?? OK_CHECK();
    const outcome = await settle(dream({ ...base(copy, inputsDir, { check }), lines: [lineA], run: s.run }));
    return { ...outcome, calls: s.calls, copy, checks: () => checks };
  };

  /** The one fact the dream created in topic upload, as a memory path. */
  const createdFact = (copy: string) => `memories/upload/${factsIn(copy, "upload")[0]}`;

  it("lets the reviewer edit a fact this dream wrote, then runs the checks again", async () => {
    const { result, calls, copy, checks } = await reviewing((_call, dir) => {
      writeFileSync(path.join(dir, API_FACT), FACT("Dates are timestamps", "Hypothesis: dates are milliseconds. (source: 2026-11-02)"));
      return { status: "ok", flags: [flag({ fix: "rewrote the fact as a hypothesis" })] };
    });

    const reviewer = calls.find((call) => call.agent === "dream-reviewer");
    expect(reviewer?.name).toBe("reviewer");
    expect(reviewer?.writable).toEqual([path.join(copy, "memories", "**")]);
    expect(reviewer?.prompt).toContain(path.join(copy, "memories"));
    expect(checks()).toBe(2);
    expect(readFileSync(path.join(copy, API_FACT), "utf8")).toContain("Hypothesis: dates are milliseconds.");
    expect(result?.flags).toEqual([flag({ fix: "rewrote the fact as a hypothesis" })]);
    expect(result?.alerts).toEqual([]);
  });

  it("runs the checks once when the reviewer changed nothing", async () => {
    const { result, checks } = await reviewing(() => ({ status: "ok", flags: [flag()] }));

    expect(checks()).toBe(1);
    expect(result?.flags).toEqual([flag()]);
  });

  it("stops when the checks fail on the reviewer's fixes, with their output", async () => {
    const { error } = await reviewing(
      (_call, dir) => {
        writeFileSync(path.join(dir, API_FACT), FACT("Dates are timestamps", "A fact without a date."));
        return { status: "ok", flags: [flag({ fix: "reworded" })] };
      },
      { verdicts: [OK_CHECK(), { ok: false, output: `❌ C20\n   ${API_FACT}\n      fact without a source date\n` }] },
    );

    expect(error?.message).toContain("the mechanical checks failed after the reviewer's fixes");
    expect(error?.message).toContain("fact without a source date");
  });

  it("refuses a reviewer that creates a file, edits a fact this dream did not write, or renames or deletes a fact", async () => {
    const created = await reviewing((_call, dir) => {
      writeFileSync(path.join(dir, "memories", "api", "extra.md"), FACT("Extra"));
      return { status: "ok", flags: [] };
    });
    const untouched = await reviewing((_call, dir) => {
      writeFileSync(path.join(dir, OLD_FACT), FACT("Old stuff", "Rewritten. (source: 2026-11-02)"));
      return { status: "ok", flags: [] };
    });
    const deleted = await reviewing((_call, dir) => {
      rmSync(path.join(dir, API_OLD_FACT));
      return { status: "ok", flags: [] };
    });
    const outside = await reviewing((_call, dir) => {
      writeFileSync(path.join(dir, "README.md"), "rewritten\n");
      return { status: "ok", flags: [] };
    });

    for (const { error } of [created, untouched, deleted, outside]) expect(error?.message).toContain("the reviewer changed files it must not touch");
    expect(created.error?.message).toContain("memories/api/extra.md: the reviewer may not create a file");
    expect(untouched.error?.message).toContain(`${OLD_FACT}: the reviewer may edit only the facts this dream wrote`);
    expect(deleted.error?.message).toContain(`${API_OLD_FACT}: the reviewer may not rename or delete a fact; it names it in drop`);
    expect(outside.error?.message).toContain("README.md");
  });

  it("lets the reviewer edit a fact this dream created, under the name the script gave it", async () => {
    const { result, copy, checks } = await reviewing(
      (_call, dir) => {
        const fact = createdFact(dir);
        writeFileSync(path.join(dir, fact), FACT("Upload limits", "Trimmed. (source: 2026-11-02)"));
        return { status: "ok", flags: [flag({ path: fact, fix: "trimmed" })] };
      },
      { create: true },
    );

    expect(checks()).toBe(2);
    expect(readFileSync(path.join(copy, createdFact(copy)), "utf8")).toContain("Trimmed.");
    expect(result?.alerts).toEqual([]);
  });

  it("drops a fact this dream created when the reviewer names it, and runs the checks again", async () => {
    let dropped = "";
    const { result, copy, checks } = await reviewing(
      (_call, dir) => {
        dropped = createdFact(dir);
        return { status: "ok", flags: [flag({ path: dropped, fix: "dropped the fact" })], drop: [dropped] };
      },
      { create: true },
    );

    expect(dropped).toMatch(/^memories\/upload\/upload-limits-[a-z0-9]{4}\.md$/);
    expect(existsSync(path.join(copy, dropped))).toBe(false);
    expect(checks()).toBe(2);
    expect(result?.alerts).toEqual([]);
  });

  it("asks the reviewer for a note per changed fact, and returns its notes for the owner's summary", async () => {
    const { result, calls } = await reviewing(() => ({ status: "ok", flags: [], notes: [{ path: API_FACT, note: "Adds that Convex wants milliseconds." }] }));

    expect(calls.find((call) => call.agent === "dream-reviewer")?.prompt).toContain("`notes`");
    expect(result?.notes).toEqual([{ path: API_FACT, note: "Adds that Convex wants milliseconds." }]);
  });

  it("keeps a fact the dream did not create when the reviewer asks to drop it, and tells the owner", async () => {
    const { result, copy, checks } = await reviewing(() => ({ status: "ok", flags: [], drop: [API_FACT, OLD_FACT] }));

    expect(existsSync(path.join(copy, API_FACT))).toBe(true);
    expect(existsSync(path.join(copy, OLD_FACT))).toBe(true);
    expect(checks()).toBe(1);
    expect(result?.alerts).toEqual([
      { kind: "reviewer", message: `the reviewer wants to drop ${API_FACT}, which this dream did not create; it is kept` },
      { kind: "reviewer", message: `the reviewer wants to drop ${OLD_FACT}, which this dream did not create; it is kept` },
    ]);
  });

  it("alerts the owner when the reviewer's account and the copy disagree", async () => {
    const { result } = await reviewing((_call, dir) => {
      writeFileSync(path.join(dir, API_FACT), FACT("Dates are timestamps", "Another fact. (source: 2026-11-02)"));
      return { status: "ok", flags: [flag(), flag({ path: OLD_FACT, fix: "removed a sentence" })] };
    });

    expect(result?.alerts).toEqual([
      { kind: "reviewer", message: `the reviewer changed ${API_FACT} without a fixed flag saying why` },
      { kind: "reviewer", message: `the reviewer says it fixed ${OLD_FACT}, but the file did not change` },
    ]);
  });
});

describe("correct", () => {
  const input = (copy: string, run: Run, over: Record<string, unknown> = {}) => ({
    instruction: "The limit is 10 MB, not 5.",
    copy,
    run,
    check: OK_CHECK,
    diff: () => "the current diff",
    passages: "### sA-01\n...",
    today: "2026-11-08",
    name: "correction-1",
    ...over,
  });
  const ok = { status: "ok", changed: [], alerts: [], drop: [], notes: [] };

  it("gives the writer the instruction, the diff and the passages, and the right to edit memories/ only", async () => {
    const { copy } = makeCopy();
    const s = stub({ writer: () => ({ ...ok, changed: [API_FACT] }) });

    const { verdict } = await correct(input(copy, s.run));

    expect(verdict.ok).toBe(true);
    expect(s.calls[0]).toMatchObject({ agent: "dream-writer", name: "correction-1", writable: [path.join(copy, "memories", "**")] });
    expect(s.calls[0]?.prompt).toContain("The limit is 10 MB, not 5.");
    expect(s.calls[0]?.prompt).toContain("the current diff");
    expect(s.calls[0]?.prompt).toContain("### sA-01");
    expect(s.calls[0]?.prompt).toContain("`drop`");
  });

  it("deletes any fact the writer names in drop, since it has no tool to delete it itself", async () => {
    const { copy } = makeCopy();
    const s = stub({ writer: () => ({ ...ok, changed: [OLD_FACT], drop: [OLD_FACT] }) });

    const { verdict } = await correct(input(copy, s.run));

    expect(verdict.ok).toBe(true);
    expect(existsSync(path.join(copy, OLD_FACT))).toBe(false);
  });

  it("refuses a correction that removed a fact without naming it in drop", async () => {
    const { copy } = makeCopy();
    const s = stub({
      writer: () => {
        renameSync(path.join(copy, OLD_FACT), path.join(copy, "memories", "old", "renamed-zz99.md"));
        return ok;
      },
    });

    await expect(correct(input(copy, s.run))).rejects.toThrow("the correction renamed or deleted facts without naming them in drop");
  });

  it("refuses a correction that touched a file other than a fact", async () => {
    const { copy } = makeCopy();
    const s = stub({
      writer: () => {
        writeFileSync(path.join(copy, "README.md"), "tampered");
        return ok;
      },
    });

    await expect(correct(input(copy, s.run))).rejects.toThrow("the correction changed files it must not touch");
  });

  it("names a new fact, in a new topic too, and its changed path and note follow the new name", async () => {
    const { copy } = makeCopy();
    const s = stub({
      writer: () => {
        mkdirSync(path.join(copy, "memories", "limits"), { recursive: true });
        writeFileSync(path.join(copy, "memories", "limits", "new.md"), FACT("Upload limit", "The limit is 10 MB. (source: correction of 2026-11-08)"));
        return { ...ok, changed: ["memories/limits/new.md", API_FACT], notes: [{ path: "memories/limits/new.md", note: "The limit is 10 MB." }] };
      },
    });

    const { reply } = await correct(input(copy, s.run));

    const named = `memories/limits/${factsIn(copy, "limits")[0]}`;
    expect(named).toMatch(/^memories\/limits\/upload-limit-[a-z0-9]{4}\.md$/);
    expect(reply.changed).toEqual([named, API_FACT]);
    expect(reply.notes).toEqual([{ path: named, note: "The limit is 10 MB." }]);
  });

  it("returns a failed verdict instead of throwing, so the owner can correct again", async () => {
    const { copy } = makeCopy();
    const s = stub({ writer: () => ok });

    const { verdict } = await correct(input(copy, s.run, { check: () => ({ ok: false, output: "dead link" }) }));

    expect(verdict).toEqual({ ok: false, output: "dead link" });
  });

  it("keeps the name the dream gave a fact through a later correction of it", async () => {
    const lineA = line("sA");
    const { copy, inputsDir } = makeCopy();
    const s = stub({
      extractor: () => ({ status: "ok", candidates: [candidate("sA-01", "sA", lineA.uuid)] }),
      planner: planOf({ topics: [{ topic: "upload", action: "create", candidates: ["sA-01"] }] }),
      writer: (call) => {
        if (call.name === "correction-1") {
          const fact = `memories/upload/${factsIn(copy, "upload")[0]}`;
          writeFileSync(path.join(copy, fact), FACT("Upload limits", "The limit is 10 MB. (source: correction of 2026-11-08)"));
          return { ...ok, changed: [fact] };
        }
        writeFileSync(path.join(folderOf(call), "new.md"), FACT("Upload limits", "The limit is 5 MB. (source: 2026-11-02)"));
        return { status: "ok", topic: "upload", facts: [{ text: "f", candidates: ["sA-01"] }], alerts: [] };
      },
    });

    await dream({ ...base(copy, inputsDir), lines: [lineA], run: s.run });
    const given = factsIn(copy, "upload");
    const { reply } = await correct(input(copy, s.run));

    expect(factsIn(copy, "upload")).toEqual(given);
    expect(reply.changed).toEqual([`memories/upload/${given[0]}`]);
    expect(readFileSync(path.join(copy, "memories", "upload", given[0] as string), "utf8")).toContain("10 MB");
  });
});
