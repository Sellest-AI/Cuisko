/**
 * The dream with its models replaced by hand-written replies (spec §10, P2–P6). What is pinned:
 * the order and the inputs of the steps, that a reply is checked before it is trusted, that a
 * writer cannot change a file its plan did not name, and that the reviewer's fixes stay in
 * memories/ and are checked again. No model is called.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/dream.mjs";
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
type Result = {
  plan: { files: { path: string; action: string }[] };
  candidates: { id: string }[];
  writerReplies: unknown[];
  flags: { path: string; fix?: string }[];
  alerts: { kind: string; message: string }[];
  passages: string;
};
const { UNUSED_AFTER_SESSIONS } = responses as unknown as { UNUSED_AFTER_SESSIONS: number };
const { correct, dream } = lib as unknown as {
  dream: (input: Record<string, unknown>) => Promise<Result>;
  correct: (input: Record<string, unknown>) => Promise<{ reply: unknown; verdict: { ok: boolean; output: string } }>;
};

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const NOW = new Date("2026-11-08T12:00:00Z");
const CONTEXT = { identity: {}, repoRoot: "C:/work/cuisko" };
const FILE = (title: string, summary: string, fact = "A fact. (source: 2026-11-02)") =>
  `---\nsummary: ${summary}\nstatus: stable\nlast_verified: 2026-11-08\n---\n\n# ${title}\n\n## Facts\n\n- ${fact}\n`;

const makeCopy = (memories: Record<string, string> = { "api.md": FILE("API", "About the API."), "old.md": FILE("Old", "Old stuff.") }) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "memory-dream-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, "copy", "memories"), { recursive: true });
  const copy = path.join(dir, "copy");
  writeFileSync(path.join(copy, "README.md"), "# Rules\n");
  writeFileSync(path.join(copy, "_template.md"), "# Template\n");
  writeFileSync(path.join(copy, "index.md"), "stale\n");
  writeFileSync(
    path.join(copy, "usage.json"),
    JSON.stringify({
      version: 1,
      files: Object.fromEntries(
        Object.keys(memories).map((name) => {
          const entry = { created: "2026-09-01", reads: 4, lastRead: "2026-11-01T00:00:00.000Z" };
          // old.md is the file the plans delete as unused: enough sessions ran without reading it.
          return [`memories/${name}`, name === "old.md" ? { ...entry, sessionsSinceRead: UNUSED_AFTER_SESSIONS } : entry];
        }),
      ),
    }),
  );
  for (const [name, text] of Object.entries(memories)) writeFileSync(path.join(copy, "memories", name), text);
  return { dir, copy, inputsDir: path.join(dir, "inputs") };
};

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

const OK_CHECK = () => ({ ok: true, output: "" });
const base = (copy: string, inputsDir: string, over: Record<string, unknown> = {}) => ({
  copy,
  inputsDir,
  context: CONTEXT,
  check: OK_CHECK,
  diff: () => "the diff",
  now: NOW,
  today: "2026-11-08",
  ...over,
});

describe("dream: the whole chain", () => {
  const lineA = line("sA");
  const lineB = line("sB", { role: "assistant", text: "Mail jean@example.com about it." });

  const happy = () => {
    const { copy, inputsDir } = makeCopy();
    const s = stub({
      extractor: (call) => ({
        status: "ok",
        candidates: call.name === "extractor-sA" ? [candidate("sA-01", "sA", lineA.uuid)] : [candidate("sB-01", "sB", lineB.uuid)],
      }),
      planner: {
        status: "ok",
        files: [
          { path: "memories/api.md", action: "update", candidates: ["sA-01"] },
          { path: "memories/upload.md", action: "create", candidates: ["sB-01"] },
          { path: "memories/old.md", action: "delete", candidates: [], reason: "Never read." },
        ],
        docsIssues: [{ doc: "docs/ARCHITECTURE.md", issue: "Stale." }],
      },
      writer: (call) => {
        const file = call.writable[0] as string;
        const title = path.basename(file, ".md");
        writeFileSync(file, FILE(title, `About ${title}.`));
        const id = call.prompt.includes("sA-01") ? "sA-01" : "sB-01";
        return { status: "ok", path: `memories/${path.basename(file)}`, facts: [{ text: "A fact.", candidates: [id] }], alerts: [{ kind: "flip-flop", message: "went back" }] };
      },
      reviewer: { status: "ok", flags: [{ path: "memories/upload.md", fact: "A fact.", problem: "Unsupported.", evidence: "sB-01", severity: "medium" }] },
    });
    return { copy, inputsDir, ...s };
  };

  it("runs extract, plan, write, check, review in order and returns what the owner sees", async () => {
    const { copy, inputsDir, run, calls } = happy();

    const result = await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    expect(calls.map((call) => call.agent)).toEqual(["dream-extractor", "dream-extractor", "dream-planner", "dream-writer", "dream-writer", "dream-reviewer"]);
    expect(result.candidates.map((c) => c.id)).toEqual(["sA-01", "sB-01"]);
    expect(result.flags).toHaveLength(1);
    expect(result.alerts).toEqual([{ kind: "flip-flop", message: "went back" }, { kind: "flip-flop", message: "went back" }]);
    expect(result.writerReplies).toHaveLength(2);
  });

  it("gives each writer one file to write, and a delete is done by the script", async () => {
    const { copy, inputsDir, run, calls } = happy();

    await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    const writers = calls.filter((call) => call.agent === "dream-writer");
    expect(writers.map((call) => call.writable)).toEqual([[path.join(copy, "memories", "api.md")], [path.join(copy, "memories", "upload.md")]]);
    expect(existsSync(path.join(copy, "memories", "old.md"))).toBe(false);
    expect(calls.every((call) => !call.prompt.includes("memories/old.md") || call.agent === "dream-planner" || call.agent === "dream-reviewer")).toBe(true);
  });

  it("refreshes usage.json and the index after the writers: new file in grace, deleted file gone", async () => {
    const { copy, inputsDir, run } = happy();

    await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    const usage = JSON.parse(readFileSync(path.join(copy, "usage.json"), "utf8")) as { files: Record<string, { created: string; reads: number }> };
    expect(Object.keys(usage.files)).toEqual(["memories/api.md", "memories/upload.md"]);
    expect(usage.files["memories/upload.md"]).toMatchObject({ created: "2026-11-08", reads: 0 });
    expect(usage.files["memories/api.md"]?.reads).toBe(4);
    const index = readFileSync(path.join(copy, "index.md"), "utf8");
    expect(index).toContain("- [upload](memories/upload.md): About upload.");
    expect(index).not.toContain("old.md");
  });

  it("masks personal data in every prompt a model reads", async () => {
    const { copy, inputsDir, run, calls } = happy();

    await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    for (const call of calls) expect(call.prompt).not.toContain("jean@example.com");
    expect(calls.find((call) => call.name === "extractor-sB")?.prompt).toContain("[email masked]");
  });

  it("hands the planner the usage of each file, and the reviewer the diff, the plan and the writers' replies", async () => {
    const { copy, inputsDir, run, calls } = happy();

    await dream({ ...base(copy, inputsDir), lines: [lineA, lineB], run });

    expect(calls.find((call) => call.agent === "dream-planner")?.prompt).toContain('"reads": 4');
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
    expect(result.plan.files).toEqual([]);
  });
});

describe("dream: what it refuses", () => {
  const lineA = line("sA");
  const cands = (...list: ReturnType<typeof candidate>[]) => () => ({ status: "ok", candidates: list });

  const failing = async (replies: Parameters<typeof stub>[0], over: Record<string, unknown> = {}) => {
    const { copy, inputsDir } = makeCopy();
    const s = stub(replies);
    const error = await dream({ ...base(copy, inputsDir, over), lines: [lineA], run: s.run }).then(
      () => undefined,
      (caught: Error) => caught,
    );
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

  it("refuses a plan that cites a candidate nobody extracted, before any writer runs", async () => {
    const { error, calls } = await failing({
      extractor: cands(candidate("sA-01", "sA", lineA.uuid)),
      planner: { status: "ok", files: [{ path: "memories/api.md", action: "update", candidates: ["ghost"] }], docsIssues: [] },
    });

    expect(error?.message).toContain("the plan cannot be used");
    expect(error?.message).toContain("ghost");
    expect(calls.some((call) => call.agent === "dream-writer")).toBe(false);
  });

  const planFor = (path: string) => ({ status: "ok", files: [{ path, action: "update", candidates: ["sA-01"] }], docsIssues: [] });
  const withWriter = (writer: (call: Call) => unknown) => ({ extractor: cands(candidate("sA-01", "sA", lineA.uuid)), planner: planFor("memories/api.md"), writer });

  it("refuses a writer that answers for another file or writes nothing", async () => {
    const wrongFile = await failing(withWriter(() => ({ status: "ok", path: "memories/other.md", facts: [{ text: "f", candidates: ["sA-01"] }], alerts: [] })));
    const nothing = await failing(
      withWriter((call) => {
        rmSync(call.writable[0] as string);
        return { status: "ok", path: "memories/api.md", facts: [{ text: "f", candidates: ["sA-01"] }], alerts: [] };
      }),
    );

    expect(wrongFile.error?.message).toContain("answered for memories/other.md");
    expect(nothing.error?.message).toContain("wrote nothing");
  });

  it("refuses a writer that changed a file outside its plan", async () => {
    const { error, copy } = await failing(
      withWriter((call) => {
        writeFileSync(call.writable[0] as string, FILE("API", "About the API."));
        writeFileSync(path.join(path.dirname(call.writable[0] as string), "old.md"), "tampered");
        writeFileSync(path.join(path.dirname(call.writable[0] as string), "..", "README.md"), "tampered");
        return { status: "ok", path: "memories/api.md", facts: [{ text: "f", candidates: ["sA-01"] }], alerts: [] };
      }),
    );

    expect(error?.message).toContain("changed files outside the plan");
    expect(error?.message).toContain("memories/old.md");
    expect(error?.message).toContain("README.md");
    expect(readFileSync(path.join(copy, "memories", "old.md"), "utf8")).toBe("tampered");
  });

  it("stops on a failed mechanical check, with its output, before the reviewer", async () => {
    const good = withWriter((call) => {
      writeFileSync(call.writable[0] as string, FILE("API", "About the API."));
      return { status: "ok", path: "memories/api.md", facts: [{ text: "f", candidates: ["sA-01"] }], alerts: [] };
    });

    const { error, calls } = await failing(good, { check: () => ({ ok: false, output: "❌ C20\n   memories/api.md\n      fact without a source date\n" }) });

    expect(error?.message).toContain("the mechanical checks failed");
    expect(error?.message).toContain("fact without a source date");
    expect(calls.some((call) => call.agent === "dream-reviewer")).toBe(false);
  });
});

describe("dream: the reviewer's fixes", () => {
  const lineA = line("sA");
  type Verdict = { ok: boolean; output: string };
  const flag = (over: Record<string, unknown> = {}) => ({ path: "memories/api.md", fact: "A fact.", problem: "Unsupported.", evidence: "sA-01", severity: "medium", ...over });

  /**
   * One file written, then `review(call, copy)` as the reviewer; `verdicts` are the checks' answers,
   * in order; `planned` is the one plan entry, by default an update of api.md.
   */
  const reviewing = async (review: (call: Call, copy: string) => unknown, verdicts: Verdict[] = [], planned = { path: "memories/api.md", action: "update" }) => {
    const { copy, inputsDir } = makeCopy();
    const s = stub({
      extractor: () => ({ status: "ok", candidates: [candidate("sA-01", "sA", lineA.uuid)] }),
      planner: { status: "ok", files: [{ ...planned, candidates: ["sA-01"] }], docsIssues: [] },
      writer: (call) => {
        writeFileSync(call.writable[0] as string, FILE("API", "About the API."));
        return { status: "ok", path: planned.path, facts: [{ text: "A fact.", candidates: ["sA-01"] }], alerts: [] };
      },
      review: (call) => review(call, copy),
    });
    let checks = 0;
    const check = () => verdicts[checks++] ?? OK_CHECK();
    const outcome = await dream({ ...base(copy, inputsDir, { check }), lines: [lineA], run: s.run }).then(
      (result) => ({ result, error: undefined }),
      (caught: Error) => ({ result: undefined, error: caught }),
    );
    return { ...outcome, calls: s.calls, copy, checks: () => checks };
  };

  it("lets the reviewer edit memories/ of the copy only, then refreshes the index and runs the checks again", async () => {
    const { result, calls, copy, checks } = await reviewing((_call, dir) => {
      writeFileSync(path.join(dir, "memories", "api.md"), FILE("API", "The API, as a hypothesis.", "Hypothesis: a fact. (source: 2026-11-02)"));
      return { status: "ok", flags: [flag({ fix: "rewrote the fact as a hypothesis" })] };
    });

    const reviewer = calls.find((call) => call.agent === "dream-reviewer");
    expect(reviewer?.writable).toEqual([path.join(copy, "memories", "**")]);
    expect(reviewer?.prompt).toContain(path.join(copy, "memories"));
    expect(checks()).toBe(2);
    expect(readFileSync(path.join(copy, "index.md"), "utf8")).toContain("- [API](memories/api.md): The API, as a hypothesis.");
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
        writeFileSync(path.join(dir, "memories", "api.md"), FILE("API", "About the API.", "A fact without a date."));
        return { status: "ok", flags: [flag({ fix: "reworded" })] };
      },
      [OK_CHECK(), { ok: false, output: "❌ C20\n   memories/api.md\n      fact without a source date\n" }],
    );

    expect(error?.message).toContain("the mechanical checks failed after the reviewer's fixes");
    expect(error?.message).toContain("fact without a source date");
  });

  it("stops when the reviewer changed a file outside memories/", async () => {
    const { error } = await reviewing((_call, dir) => {
      writeFileSync(path.join(dir, "index.md"), "rewritten\n");
      return { status: "ok", flags: [] };
    });

    expect(error?.message).toContain("the reviewer changed files it must not touch");
    expect(error?.message).toContain("index.md");
  });

  it("drops a file this dream created when the reviewer names it, and takes it out of the index", async () => {
    const { result, copy, checks } = await reviewing(
      () => ({ status: "ok", flags: [flag({ path: "memories/new.md", fix: "dropped the file" })], drop: ["memories/new.md"] }),
      [],
      { path: "memories/new.md", action: "create" },
    );

    expect(existsSync(path.join(copy, "memories", "new.md"))).toBe(false);
    expect(readFileSync(path.join(copy, "index.md"), "utf8")).not.toContain("memories/new.md");
    expect(checks()).toBe(2);
    expect(result?.alerts).toEqual([]);
  });

  it("keeps a file the dream did not create when the reviewer asks to drop it, and tells the owner", async () => {
    const { result, copy } = await reviewing(() => ({ status: "ok", flags: [], drop: ["memories/api.md", "memories/old.md"] }));

    expect(existsSync(path.join(copy, "memories", "api.md"))).toBe(true);
    expect(existsSync(path.join(copy, "memories", "old.md"))).toBe(true);
    expect(result?.alerts).toEqual([
      { kind: "reviewer", message: "the reviewer wants to drop memories/api.md, which this dream did not create; it is kept" },
      { kind: "reviewer", message: "the reviewer wants to drop memories/old.md, which this dream did not create; it is kept" },
    ]);
  });

  it("alerts the owner when the reviewer's account and the copy disagree", async () => {
    const { result } = await reviewing((_call, dir) => {
      writeFileSync(path.join(dir, "memories", "api.md"), FILE("API", "About the API.", "Another fact. (source: 2026-11-02)"));
      return { status: "ok", flags: [flag(), flag({ path: "memories/old.md", fix: "removed a bullet" })] };
    });

    expect(result?.alerts).toEqual([
      { kind: "reviewer", message: "the reviewer changed memories/api.md without a fixed flag saying why" },
      { kind: "reviewer", message: "the reviewer says it fixed memories/old.md, but the file did not change" },
    ]);
  });
});

describe("correct", () => {
  const setup = () => {
    const { copy } = makeCopy();
    return copy;
  };
  const input = (copy: string, run: Run, over: Record<string, unknown> = {}) => ({
    instruction: "The limit is 10 MB, not 5.",
    copy,
    run,
    check: OK_CHECK,
    diff: () => "the current diff",
    passages: "### sA-01\n...",
    now: NOW,
    today: "2026-11-08",
    name: "correction-1",
    ...over,
  });

  it("gives the writer the instruction, the diff and the passages, and the right to edit memories/ only", async () => {
    const copy = setup();
    const s = stub({ writer: () => ({ status: "ok", changed: ["memories/api.md"], alerts: [] }) });

    const { verdict } = await correct(input(copy, s.run));

    expect(verdict.ok).toBe(true);
    expect(s.calls[0]).toMatchObject({ agent: "dream-writer", name: "correction-1", writable: [path.join(copy, "memories", "**")] });
    expect(s.calls[0]?.prompt).toContain("The limit is 10 MB, not 5.");
    expect(s.calls[0]?.prompt).toContain("the current diff");
    expect(s.calls[0]?.prompt).toContain("### sA-01");
  });

  it("refreshes the index after a correction that creates and deletes files", async () => {
    const copy = setup();
    const s = stub({
      writer: () => {
        writeFileSync(path.join(copy, "memories", "limits.md"), FILE("Limits", "Upload limits."));
        rmSync(path.join(copy, "memories", "old.md"));
        return { status: "ok", changed: ["memories/limits.md", "memories/old.md"], alerts: [] };
      },
    });

    await correct(input(copy, s.run));

    const index = readFileSync(path.join(copy, "index.md"), "utf8");
    expect(index).toContain("memories/limits.md");
    expect(index).not.toContain("old.md");
  });

  it("returns a failed verdict instead of throwing, so the owner can correct again", async () => {
    const copy = setup();
    const s = stub({ writer: () => ({ status: "ok", changed: [], alerts: [] }) });

    const { verdict } = await correct(input(copy, s.run, { check: () => ({ ok: false, output: "dead link" }) }));

    expect(verdict).toEqual({ ok: false, output: "dead link" });
  });

  it("refuses a correction that touched the index, usage.json or the owner's files", async () => {
    const copy = setup();
    const s = stub({
      writer: () => {
        writeFileSync(path.join(copy, "README.md"), "tampered");
        return { status: "ok", changed: [], alerts: [] };
      },
    });

    await expect(correct(input(copy, s.run))).rejects.toThrow("the correction changed files it must not touch");
  });
});
