/**
 * memory:update end to end, on a throwaway git repo with fake transcripts, the models replaced by
 * hand-written replies and C20 run for real. What is pinned is what must never go wrong with
 * money and memory involved: a choice that writes nothing writes nothing, a commit holds the memory
 * and only the memory, the stamps move only when the owner decided, and a refused commit loses no
 * dream (spec §9, §14 row 8).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as indexModule from "../_lib/memoryIndex.mjs";
import * as stampsModule from "../_lib/stamps.mjs";
import * as updateModule from "../update.mjs";

type Call = { agent: string; name: string; prompt: string; writable: string[] };
type Io = {
  out: (text: string) => void;
  err: (text: string) => void;
  ask: (question: string) => Promise<string>;
  edit: (files: string[]) => Promise<void> | void;
  onInterrupt: (callback: () => void) => () => void;
};
type Deps = { run?: (call: Call) => Promise<unknown>; check?: (options?: { memoryDir?: string; full?: boolean }) => { ok: boolean; output: string }; hasClaude?: () => boolean; now?: () => Date };
type Stamps = {
  initializedAt: string;
  readsCountedUntil?: string;
  lastRun?: { at: string; status: string; choice: string | null; commit: string | null };
  sessions: Record<string, { transcript: string; branches: Record<string, { reviewedUntil: string | null; outcome?: string }> }>;
};
const { runUpdate } = updateModule as unknown as { runUpdate: (input: { argv: string[]; cwd?: string; io: Io; deps?: Deps }) => Promise<number> };
const { renderIndex } = indexModule as unknown as {
  renderIndex: (input: { files: { path: string; title: string; summary: string }[]; usage: unknown; now: Date }) => string;
};
const { acquireDreamLock } = stampsModule as unknown as { acquireDreamLock: (dir: string) => () => void };

// The pre-commit hook runs verify with GIT_* set for the real repo; the throwaway repos must not see them.
for (const name of Object.keys(process.env)) if (/^GIT_/i.test(name)) delete process.env[name];

const NOW = new Date("2026-11-08T12:00:00Z");
const dirs: string[] = [];
const savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
afterAll(() => {
  if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
beforeAll(() => {
  process.env.CLAUDE_CONFIG_DIR = mkdtempSync(path.join(os.tmpdir(), "memory-update-claude-"));
  dirs.push(process.env.CLAUDE_CONFIG_DIR);
});

const FILE = (title: string, summary: string, fact: string) =>
  `---\nsummary: ${summary}\nstatus: stable\nlast_verified: 2026-11-08\n---\n\n# ${title}\n\n## Facts\n\n- ${fact}\n`;
const API_OLD = FILE("API", "About the API.", "Old fact. (source: 2026-10-01)");
const API_NEW = FILE("API", "About the API.", "Convex needs millisecond timestamps. (source: 2026-11-02)");

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** A repo on `dev` with one memory file and one finished session that read it. */
/** `sessions`: the sessionsSinceRead of each file that has one, by file name. */
const makeRepo = (memories: Record<string, string> = { "api.md": API_OLD }, sessions: Record<string, number> = {}) => {
  const base = mkdtempSync(path.join(os.tmpdir(), "memory-update-"));
  dirs.push(base);
  execFileSync("git", ["init", "-q", "-b", "dev", base]);
  const root = git(base, "rev-parse", "--show-toplevel");
  for (const [key, value] of [["user.name", "Test Owner"], ["user.email", "owner@example.test"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]] as const) git(root, "config", key, value);
  const memory = path.join(root, ".claude", "memory");
  mkdirSync(path.join(memory, "memories"), { recursive: true });
  writeFileSync(path.join(memory, "README.md"), "# Rules\n");
  writeFileSync(path.join(memory, "_template.md"), "# Template\n");
  const usage = { version: 1, files: Object.fromEntries(Object.keys(memories).map((name) => [`memories/${name}`, { created: "2026-09-01", reads: 0, lastRead: null, ...(name in sessions ? { sessionsSinceRead: sessions[name] } : {}) }])) };
  writeFileSync(path.join(memory, "usage.json"), `${JSON.stringify(usage, null, 2)}\n`);
  for (const [name, text] of Object.entries(memories)) writeFileSync(path.join(memory, "memories", name), text);
  const files = Object.entries(memories).map(([name, text]) => ({ path: `memories/${name}`, title: /^# (.+)$/m.exec(text)?.[1] ?? "", summary: /^summary: (.+)$/m.exec(text)?.[1] ?? "" }));
  writeFileSync(path.join(memory, "index.md"), renderIndex({ files, usage, now: NOW }));
  git(root, "add", "-A");
  execFileSync("git", ["commit", "-q", "-m", "feat: base"], { cwd: root, env: { ...process.env, GIT_COMMITTER_DATE: "2026-11-05T00:00:00Z", GIT_AUTHOR_DATE: "2026-11-05T00:00:00Z" } });

  const stampsFile = path.join(root, ".git", "dream-stamps.json");
  writeFileSync(stampsFile, JSON.stringify({ version: 1, initializedAt: "2026-10-01T00:00:00.000Z", sessions: {} }));

  const project = path.join(process.env.CLAUDE_CONFIG_DIR as string, "projects", root.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(project, { recursive: true });
  const message = (n: number, role: "user" | "assistant", content: unknown) =>
    JSON.stringify({ type: role, uuid: `u-${n}`, timestamp: `2026-11-02T10:0${n}:00.000Z`, cwd: root, sessionId: "s1", gitBranch: "dev", message: { role, content } });
  const transcript = path.join(project, "s1.jsonl");
  writeFileSync(
    transcript,
    [
      message(1, "user", "Convex needs millisecond timestamps, remember that."),
      message(2, "assistant", [{ type: "text", text: "Memory: Convex needs ms timestamps." }, { type: "tool_use", name: "Read", input: { file_path: `${root}/.claude/memory/memories/api.md` } }]),
    ].join("\n"),
  );
  return { root, memory, stampsFile, transcript };
};
type Repo = ReturnType<typeof makeRepo>;

const stampsOf = (repo: Repo) => JSON.parse(readFileSync(repo.stampsFile, "utf8")) as Stamps;
const memoryFile = (repo: Repo, name: string) => readFileSync(path.join(repo.memory, name), "utf8");
const dreamDirs = (repo: Repo) => {
  const tmp = path.join(repo.root, ".tmp", "memory");
  return existsSync(tmp) ? readdirSync(tmp).filter((name) => name.startsWith("dream-")) : [];
};
const headFiles = (repo: Repo) => git(repo.root, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean);

/** The terminal: answers in order, everything printed kept. */
const makeIo = (answers: string[] = [], onEdit: (files: string[]) => void = () => {}) => {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const io: Io & { interrupt?: () => void } = {
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    ask: async (question) => {
      asked.push(question);
      const answer = answers.shift();
      if (answer === undefined) throw new Error(`unexpected prompt: ${question}`);
      return answer;
    },
    edit: (files) => onEdit(files),
    onInterrupt: (callback) => {
      io.interrupt = callback;
      return () => {};
    },
  };
  return { io, out, err, asked, text: () => out.join("\n"), errors: () => err.join("\n") };
};

/** Replies by agent. `plan` is what the planner returns; the writer writes `API_NEW` unless told. */
const makeModels = (over: { plan?: unknown; writer?: (call: Call) => unknown; review?: () => unknown; throwAt?: string } = {}) => {
  const calls: Call[] = [];
  const run = async (call: Call): Promise<unknown> => {
    calls.push(call);
    if (over.throwAt === call.agent) throw new Error(`${call.agent} fell over`);
    if (call.agent === "dream-extractor") {
      return { status: "ok", candidates: [{ id: "s1-01", fact: "Convex needs ms timestamps.", kind: "pitfall", source: { sessionId: "s1", line: "u-2", timestamp: "2026-11-02T10:02:00.000Z", branch: "dev" }, signaled: true }] };
    }
    if (call.agent === "dream-planner") {
      return over.plan ?? { status: "ok", files: [{ path: "memories/api.md", action: "update", candidates: ["s1-01"] }], docsIssues: [] };
    }
    if (call.agent === "dream-writer" && call.name.startsWith("correction")) {
      return over.writer?.(call) ?? { status: "ok", changed: [], alerts: [] };
    }
    if (call.agent === "dream-writer") {
      if (over.writer !== undefined) return over.writer(call);
      writeFileSync(call.writable[0] as string, API_NEW);
      return { status: "ok", path: "memories/api.md", facts: [{ text: "Convex needs ms timestamps.", candidates: ["s1-01"] }], alerts: [] };
    }
    return over.review?.() ?? { status: "ok", flags: [] };
  };
  return { run, calls, agents: () => calls.map((call) => call.agent) };
};

const update = (repo: Repo, io: Io, deps: Deps, argv: string[] = []) =>
  runUpdate({ argv, cwd: repo.root, io, deps: { hasClaude: () => true, now: () => NOW, ...deps } });

describe("U1: the refusals", () => {
  it("refuses a detached HEAD", async () => {
    const repo = makeRepo();
    git(repo.root, "checkout", "-q", "--detach");
    const t = makeIo();

    expect(await update(repo, t.io, makeModels())).toBe(1);
    expect(t.errors()).toContain("HEAD is detached");
  });

  it("refuses uncommitted changes in the memory, and points at --reindex", async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo.memory, "memories", "hand-written.md"), FILE("Mine", "Mine.", "A fact. (source: 2026-11-01)"));
    const t = makeIo();
    const models = makeModels();

    expect(await update(repo, t.io, models)).toBe(1);
    expect(t.errors()).toContain("uncommitted changes");
    expect(t.errors()).toContain("--reindex");
    expect(models.calls).toEqual([]);
  });

  it("refuses an encrypted memory, naming the setup command", async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo.memory, "index.md"), "U2FsdGVkX1+ciphertext");
    git(repo.root, "commit", "-qam", "chore: encrypted stand-in");
    const t = makeIo();

    expect(await update(repo, t.io, makeModels())).toBe(1);
    expect(t.errors()).toContain("pnpm memory:setup");
  });

  it("refuses missing stamps, and unusable stamps, with the setup or reset command", async () => {
    const repo = makeRepo();
    rmSync(repo.stampsFile);
    const missing = makeIo();
    expect(await update(repo, missing.io, makeModels())).toBe(1);
    expect(missing.errors()).toContain("pnpm memory:setup");

    writeFileSync(repo.stampsFile, "{not json");
    const invalid = makeIo();
    expect(await update(repo, invalid.io, makeModels())).toBe(1);
    expect(invalid.errors()).toContain("--reset-stamps");
  });

  it("refuses when the claude command is missing", async () => {
    const repo = makeRepo();
    const t = makeIo();

    expect(await update(repo, t.io, { ...makeModels(), hasClaude: () => false })).toBe(1);
    expect(t.errors()).toContain("claude command is not available");
  });

  it("refuses an unknown argument and --dry-run with --reindex", async () => {
    const repo = makeRepo();

    expect(await update(repo, makeIo().io, makeModels(), ["--wat"])).toBe(1);
    const both = makeIo();
    expect(await update(repo, both.io, makeModels(), ["--dry-run", "--reindex"])).toBe(1);
    expect(both.errors()).toContain("cannot go together");
  });

  it("refuses while another dream holds the lock, and frees the lock when it ends", async () => {
    const repo = makeRepo();
    const release = acquireDreamLock(path.join(repo.root, ".git"));
    const blocked = makeIo();

    expect(await update(repo, blocked.io, makeModels())).toBe(1);
    expect(blocked.errors()).toContain("a dream is already running");
    release();
    const free = makeIo(["a"]);
    expect(await update(repo, free.io, makeModels())).toBe(0);
    expect(existsSync(path.join(repo.root, ".git", "dream.lock"))).toBe(false);
  });

  it("says there is nothing to read, and changes nothing, when no session is unread", async () => {
    const repo = makeRepo();
    rmSync(repo.transcript);
    const t = makeIo();
    const models = makeModels();

    expect(await update(repo, t.io, models)).toBe(0);
    expect(t.text()).toContain("Nothing to read");
    expect(models.calls).toEqual([]);
    expect(stampsOf(repo).lastRun).toBeUndefined();
  });
});

describe("U2: the pull", () => {
  /** `repo` with a bare upstream, and the upstream's memory file rewritten by someone else. */
  const withDivergedUpstream = (repo: Repo, upstreamEdit: (clone: string) => void, localText: string) => {
    const remote = mkdtempSync(path.join(os.tmpdir(), "memory-update-remote-"));
    const other = mkdtempSync(path.join(os.tmpdir(), "memory-update-other-"));
    dirs.push(remote, other);
    execFileSync("git", ["init", "-q", "--bare", "-b", "dev", remote]);
    git(repo.root, "remote", "add", "origin", remote);
    git(repo.root, "config", "pull.rebase", "false");
    git(repo.root, "push", "-q", "-u", "origin", "dev");
    git(other, "clone", "-q", remote, "clone");
    const clone = path.join(other, "clone");
    for (const [key, value] of [["user.name", "Other"], ["user.email", "other@example.test"], ["commit.gpgsign", "false"]] as const) git(clone, "config", key, value);
    upstreamEdit(clone);
    git(clone, "add", "-A");
    git(clone, "commit", "-q", "-m", "chore: change from the other machine");
    git(clone, "push", "-q", "origin", "dev");
    writeFileSync(path.join(repo.memory, "memories", "api.md"), localText);
    git(repo.root, "commit", "-q", "-am", "chore: local memory edit");
  };

  it("stops before dreaming on a conflict in the memory, naming the way out, and writes nothing", async () => {
    const repo = makeRepo();
    withDivergedUpstream(
      repo,
      (clone) => writeFileSync(path.join(clone, ".claude", "memory", "memories", "api.md"), API_OLD.replace("Old fact", "Upstream fact")),
      API_OLD.replace("Old fact", "Local fact"),
    );
    const t = makeIo();
    const models = makeModels();

    expect(await update(repo, t.io, models)).toBe(1);

    expect(t.errors()).toContain("Resolve it (and any conflict in .claude/memory)");
    expect(models.calls).toHaveLength(0);
    expect(stampsOf(repo).sessions).toEqual({});
    expect(stampsOf(repo).lastRun).toBeUndefined();
    expect(existsSync(path.join(repo.root, ".git", "dream.lock"))).toBe(false);
  });

  it("dreams on the memory the pull brought, when it merges cleanly", async () => {
    const repo = makeRepo();
    withDivergedUpstream(repo, (clone) => writeFileSync(path.join(clone, "elsewhere.txt"), "x"), API_NEW);
    const t = makeIo(["a"]);
    const models = makeModels();

    await update(repo, t.io, models);

    expect(models.agents()[0]).toBe("dream-extractor");
  });
});

describe("the choices", () => {
  it("[o] commits the memory and only the memory, with the trailer, and keeps other staged work staged", async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo.root, "other.txt"), "unrelated\n");
    git(repo.root, "add", "other.txt");
    const t = makeIo(["o"]);

    expect(await update(repo, t.io, makeModels())).toBe(0);

    expect(headFiles(repo).sort()).toEqual([".claude/memory/memories/api.md", ".claude/memory/usage.json"]); // one memory file: the index text did not change
    expect(git(repo.root, "diff", "--cached", "--name-only")).toBe("other.txt");
    const message = git(repo.root, "log", "-1", "--format=%B");
    expect(message).toMatch(/^chore\(memory\): update after 1 session\n\n- modifies memories\/api\.md\n\nMemory-Update: yes$/);
    expect(message).not.toMatch(/Co-Authored-By/i);
    expect(memoryFile(repo, "memories/api.md")).toBe(API_NEW);
    expect(t.text()).toContain("You can run: git push");
  });

  it("[o] writes the stamps: the pair reviewed, the reads counted, the commit recorded, the dream folder gone", async () => {
    const repo = makeRepo();

    await update(repo, makeIo(["o"]).io, makeModels());

    const stamps = stampsOf(repo);
    expect(stamps.sessions.s1?.branches.dev).toEqual({ reviewedUntil: "2026-11-02T10:02:00.000Z", outcome: "accepted" });
    expect(stamps.readsCountedUntil).toBe(NOW.toISOString());
    expect(stamps.lastRun).toEqual({ at: NOW.toISOString(), status: "ok", choice: "accepted", commit: git(repo.root, "rev-parse", "HEAD") });
    expect(dreamDirs(repo)).toEqual([]);
    const usage = JSON.parse(memoryFile(repo, "usage.json")) as { files: Record<string, { reads: number }> };
    expect(usage.files["memories/api.md"]?.reads).toBe(1);
  });

  it("[o] records in usage.json the sessions started since each file's last read", async () => {
    const repo = makeRepo({ "api.md": API_OLD, "idle.md": FILE("Idle", "Idle.", "Never read. (source: 2026-09-01)") });

    await update(repo, makeIo(["o"]).io, makeModels());

    const usage = JSON.parse(memoryFile(repo, "usage.json")) as { files: Record<string, { sessionsSinceRead?: number }> };
    expect(usage.files["memories/api.md"]?.sessionsSinceRead).toBe(0); // read by the one session
    expect(usage.files["memories/idle.md"]?.sessionsSinceRead).toBe(1);
  });

  it("[o] mirrors a deletion and a new file into the repo's memory", async () => {
    const repo = makeRepo({ "api.md": API_OLD, "old.md": FILE("Old", "Old.", "Gone soon. (source: 2026-09-01)") }, { "old.md": 60 });
    const models = makeModels({
      plan: {
        status: "ok",
        files: [{ path: "memories/old.md", action: "delete", candidates: [], reason: "Never read." }, { path: "memories/upload.md", action: "create", candidates: ["s1-01"] }],
        docsIssues: [],
      },
      writer: (call) => {
        writeFileSync(call.writable[0] as string, FILE("Upload", "Upload limits.", "Ten MB. (source: 2026-11-02)"));
        return { status: "ok", path: "memories/upload.md", facts: [{ text: "Ten MB.", candidates: ["s1-01"] }], alerts: [] };
      },
    });

    await update(repo, makeIo(["o"]).io, models);

    expect(existsSync(path.join(repo.memory, "memories", "old.md"))).toBe(false);
    expect(existsSync(path.join(repo.memory, "memories", "upload.md"))).toBe(true);
    expect(git(repo.root, "log", "-1", "--format=%B")).toMatch(/- creates memories\/upload\.md\n- deletes memories\/old\.md/);
    expect(memoryFile(repo, "index.md")).toContain("memories/upload.md");
    expect(memoryFile(repo, "index.md")).not.toContain("old.md");
  });

  it("[a] writes nothing: memory, stamps and history stay as they were, the sessions stay unread", async () => {
    const repo = makeRepo();
    const before = { head: git(repo.root, "rev-parse", "HEAD"), stamps: readFileSync(repo.stampsFile, "utf8"), index: memoryFile(repo, "index.md") };

    expect(await update(repo, makeIo(["a"]).io, makeModels())).toBe(0);

    expect(git(repo.root, "rev-parse", "HEAD")).toBe(before.head);
    expect(readFileSync(repo.stampsFile, "utf8")).toBe(before.stamps);
    expect(memoryFile(repo, "index.md")).toBe(before.index);
    expect(memoryFile(repo, "memories/api.md")).toBe(API_OLD);
    expect(git(repo.root, "status", "--porcelain", "--", ".claude/memory")).toBe("");
    expect(dreamDirs(repo)).toEqual([]);
  });

  it("[i] writes the stamps and no commit, and leaves the memory alone", async () => {
    const repo = makeRepo();
    const head = git(repo.root, "rev-parse", "HEAD");

    expect(await update(repo, makeIo(["i"]).io, makeModels())).toBe(0);

    expect(git(repo.root, "rev-parse", "HEAD")).toBe(head);
    expect(memoryFile(repo, "memories/api.md")).toBe(API_OLD);
    const stamps = stampsOf(repo);
    expect(stamps.sessions.s1?.branches.dev?.outcome).toBe("ignored");
    expect(stamps.readsCountedUntil).toBeUndefined();
    expect(stamps.lastRun).toMatchObject({ status: "ok", choice: "ignored", commit: null });
  });

  it("nochange: the memory files are untouched, the stamps say nochange, the reads are not counted", async () => {
    const repo = makeRepo();
    const models = makeModels({ plan: { status: "ok", files: [], docsIssues: [] } });
    const head = git(repo.root, "rev-parse", "HEAD");
    const t = makeIo();

    expect(await update(repo, t.io, models)).toBe(0);

    expect(git(repo.root, "rev-parse", "HEAD")).toBe(head);
    expect(git(repo.root, "status", "--porcelain", "--", ".claude/memory")).toBe("");
    expect(stampsOf(repo).sessions.s1?.branches.dev?.outcome).toBe("nochange");
    expect(stampsOf(repo).readsCountedUntil).toBeUndefined();
    expect(t.text()).toContain("No change needed");
    expect(t.asked).toEqual([]);
  });

  it("nochange still shows what the planner left out, and the docs it thinks are wrong", async () => {
    const plan = { status: "ok", files: [], dropped: [{ candidate: "s1-01", reason: "AGENTS.md already says it." }], docsIssues: [{ doc: "docs/ARCHITECTURE.md", issue: "Stale." }] };
    const t = makeIo();

    expect(await update(makeRepo(), t.io, makeModels({ plan }))).toBe(0);

    expect(t.text()).toContain("Left out by the planner\n  s1-01: Convex needs ms timestamps. — AGENTS.md already says it.");
    expect(t.text()).toContain("Docs that look wrong\n  docs/ARCHITECTURE.md: Stale.");
    expect(t.text()).toContain("No change needed");
  });

  it("[m] applies the owner's instruction, runs the checks again, and records the dream as edited", async () => {
    const repo = makeRepo();
    const models = makeModels({
      writer: (call) => {
        if (call.name.startsWith("correction")) {
          writeFileSync(path.join(path.dirname(call.writable[0] as string).replace(/\*\*$/, ""), "api.md"), API_NEW.replace("millisecond", "ms"));
          return { status: "ok", changed: ["memories/api.md"], alerts: [{ kind: "other", message: "Reworded." }] };
        }
        writeFileSync(call.writable[0] as string, API_NEW);
        return { status: "ok", path: "memories/api.md", facts: [{ text: "f", candidates: ["s1-01"] }], alerts: [] };
      },
    });
    const t = makeIo(["m", "say ms, not millisecond", "o"]);

    expect(await update(repo, t.io, models)).toBe(0);

    const correction = models.calls.find((call) => call.name === "correction-1");
    expect(correction?.prompt).toContain("say ms, not millisecond");
    expect(correction?.writable[0]).toMatch(/memories[\\/]\*\*$/);
    expect(memoryFile(repo, "memories/api.md")).toContain("Convex needs ms timestamps");
    expect(stampsOf(repo).sessions.s1?.branches.dev?.outcome).toBe("edited");
    expect(models.agents().filter((agent) => agent === "dream-reviewer")).toHaveLength(1);
  });

  it("ends the report with the summary, after the diff, and a correction's note replaces the reviewer's", async () => {
    const repo = makeRepo();
    const models = makeModels({
      review: () => ({ status: "ok", flags: [], notes: [{ path: "memories/api.md", note: "Says Convex wants milliseconds." }] }),
      writer: (call) => {
        if (call.name.startsWith("correction")) {
          writeFileSync(path.join(path.dirname(call.writable[0] as string).replace(/\*\*$/, ""), "api.md"), API_NEW.replace("millisecond", "ms"));
          return { status: "ok", changed: ["memories/api.md"], alerts: [], notes: [{ path: "memories/api.md", note: "Now says ms." }] };
        }
        writeFileSync(call.writable[0] as string, API_NEW);
        return { status: "ok", path: "memories/api.md", facts: [{ text: "f", candidates: ["s1-01"] }], alerts: [] };
      },
    });
    const t = makeIo(["m", "say ms, not millisecond", "o"]);

    expect(await update(repo, t.io, models)).toBe(0);

    const summaries = t.out.flatMap((text, at) => (text.startsWith("Summary:") ? [at] : []));
    expect(summaries).toHaveLength(2);
    expect(t.out.slice(0, summaries[0]).some((text) => text.includes("diff --git"))).toBe(true);
    expect(t.out[summaries[0] as number]).toContain("~ memories/api.md");
    expect(t.out[summaries[0] as number]).toContain("Says Convex wants milliseconds.");
    expect(t.out[summaries[1] as number]).toContain("Now says ms.");
    expect(t.out[summaries[1] as number]).not.toContain("Says Convex wants milliseconds.");
  });

  it("[m] with :e opens the files of the copy, and the checks run on what the owner saved", async () => {
    const repo = makeRepo();
    let opened: string[] = [];
    const t = makeIo(["m", ":e", "o"], (files) => {
      opened = files;
      const api = files.find((file) => file.endsWith("api.md")) as string;
      writeFileSync(api, API_NEW.replace("millisecond", "ms"));
    });

    expect(await update(repo, t.io, makeModels())).toBe(0);

    expect(opened.every((file) => file.includes(`${path.sep}.tmp${path.sep}memory${path.sep}dream-`))).toBe(true);
    expect(memoryFile(repo, "memories/api.md")).toContain("ms timestamps");
    expect(memoryFile(repo, "index.md")).toContain("memories/api.md");
  });

  it("[m] shows the failed checks and asks again, without a second review", async () => {
    const repo = makeRepo();
    let attempt = 0;
    const t = makeIo(["m", ":e", "fix it", "o"], (files) => {
      attempt += 1;
      const api = files.find((file) => file.endsWith("api.md")) as string;
      writeFileSync(api, API_NEW.replace(" (source: 2026-11-02)", ""));
    });
    const models = makeModels({
      writer: (call) => {
        if (call.name.startsWith("correction")) {
          writeFileSync(path.join(path.dirname(call.writable[0] as string).replace(/\*\*$/, ""), "api.md"), API_NEW);
          return { status: "ok", changed: ["memories/api.md"], alerts: [] };
        }
        writeFileSync(call.writable[0] as string, API_NEW);
        return { status: "ok", path: "memories/api.md", facts: [{ text: "f", candidates: ["s1-01"] }], alerts: [] };
      },
    });

    expect(await update(repo, t.io, models)).toBe(0);

    expect(attempt).toBe(1);
    expect(t.text()).toContain("The checks failed");
    expect(t.text()).toContain("fact without a source date");
    expect(memoryFile(repo, "memories/api.md")).toContain("(source: 2026-11-02)");
  });
});

describe("--dry-run", () => {
  it("shows the diff, then writes nothing: no stamps, no lastRun, no commit, memory untouched; keeps the logs", async () => {
    const repo = makeRepo();
    const before = { head: git(repo.root, "rev-parse", "HEAD"), stamps: readFileSync(repo.stampsFile, "utf8") };
    const t = makeIo();

    expect(await update(repo, t.io, makeModels(), ["--dry-run"])).toBe(0);

    expect(t.asked).toEqual([]);
    expect(t.text()).toContain("+- Convex needs millisecond timestamps.");
    expect(t.text()).toContain("Dry run: nothing was written");
    expect(readFileSync(repo.stampsFile, "utf8")).toBe(before.stamps);
    expect(git(repo.root, "rev-parse", "HEAD")).toBe(before.head);
    expect(memoryFile(repo, "memories/api.md")).toBe(API_OLD);
    expect(dreamDirs(repo)).toHaveLength(1);
  });
});

describe("failures", () => {
  it("keeps the dream folder, writes lastRun failed and nothing else, and leaves the memory alone", async () => {
    const repo = makeRepo();
    const t = makeIo();

    expect(await update(repo, t.io, makeModels({ throwAt: "dream-planner" }))).toBe(1);

    expect(t.errors()).toContain("dream-planner fell over");
    expect(t.errors()).toContain(dreamDirs(repo)[0] as string);
    expect(dreamDirs(repo)).toHaveLength(1);
    const stamps = stampsOf(repo);
    expect(stamps.lastRun).toEqual({ at: NOW.toISOString(), status: "failed", choice: null, commit: null });
    expect(stamps.sessions).toEqual({});
    expect(git(repo.root, "status", "--porcelain", "--", ".claude/memory")).toBe("");
    expect(existsSync(path.join(repo.root, ".git", "dream.lock"))).toBe(false);
  });

  it("an interrupt marks the run failed, frees the lock and keeps the dream folder", async () => {
    const repo = makeRepo();
    const t = makeIo();
    const models = makeModels();
    const interrupting = async (call: Call) => {
      if (call.agent === "dream-planner") {
        t.io.interrupt?.();
        throw new Error("interrupted");
      }
      return models.run(call);
    };

    await update(repo, t.io, { run: interrupting });

    expect(stampsOf(repo).lastRun?.status).toBe("failed");
    expect(dreamDirs(repo)).toHaveLength(1);
    expect(existsSync(path.join(repo.root, ".git", "dream.lock"))).toBe(false);
  });

  it("purges the folder an earlier failure left, when the next dream starts", async () => {
    const repo = makeRepo();
    await update(repo, makeIo().io, makeModels({ throwAt: "dream-planner" }));
    const first = dreamDirs(repo)[0];

    await update(repo, makeIo(["a"]).io, makeModels(), []);

    expect(dreamDirs(repo)).not.toContain(first);
  });
});

describe("the pending commit", () => {
  /**
   * A hook directory whose pre-commit refuses: the owner's `pnpm verify` failing. The mode matters
   * on Linux CI: git silently skips a hook that is not executable, and the commit then succeeds.
   */
  const refuseCommits = (repo: Repo) => {
    const hooks = path.join(repo.root, ".hooks");
    mkdirSync(hooks, { recursive: true });
    writeFileSync(path.join(hooks, "pre-commit"), "#!/bin/sh\necho 'verify failed (test)' >&2\nexit 1\n", { mode: 0o755 });
    git(repo.root, "config", "core.hooksPath", hooks);
    return () => git(repo.root, "config", "--unset", "core.hooksPath");
  };

  it("a refused commit keeps the dream and its pending.json, restores the memory, writes no stamps", async () => {
    const repo = makeRepo();
    refuseCommits(repo);
    const t = makeIo(["o"]);

    expect(await update(repo, t.io, makeModels())).toBe(1);

    expect(t.errors()).toContain("The commit was refused");
    expect(existsSync(path.join(repo.root, ".tmp", "memory", dreamDirs(repo)[0] as string, "pending.json"))).toBe(true);
    expect(git(repo.root, "status", "--porcelain", "--", ".claude/memory")).toBe("");
    expect(memoryFile(repo, "memories/api.md")).toBe(API_OLD);
    expect(stampsOf(repo).sessions).toEqual({});
  });

  it("the next run finishes the commit from the dream's copy without calling a model, even with the memory restaged", async () => {
    const repo = makeRepo();
    const allow = refuseCommits(repo);
    await update(repo, makeIo(["o"]).io, makeModels());
    allow();
    const models = makeModels();
    const t = makeIo();

    expect(await update(repo, t.io, models)).toBe(0);

    expect(models.calls).toEqual([]);
    expect(t.asked).toEqual([]);
    expect(headFiles(repo)).toContain(".claude/memory/memories/api.md");
    expect(memoryFile(repo, "memories/api.md")).toBe(API_NEW);
    expect(stampsOf(repo).sessions.s1?.branches.dev?.outcome).toBe("accepted");
    expect(stampsOf(repo).readsCountedUntil).toBe(NOW.toISOString());
    expect(dreamDirs(repo)).toEqual([]);
  });

  it("refuses on another branch, naming the branch", async () => {
    const repo = makeRepo();
    refuseCommits(repo);
    await update(repo, makeIo(["o"]).io, makeModels());
    git(repo.root, "checkout", "-q", "-b", "feat/other");
    const t = makeIo();

    expect(await update(repo, t.io, makeModels())).toBe(1);
    expect(t.errors()).toContain("pending on branch dev");
  });

  it("refuses when the memory changed at HEAD since the dream started, and mirrors nothing", async () => {
    const repo = makeRepo();
    const allow = refuseCommits(repo);
    await update(repo, makeIo(["o"]).io, makeModels());
    allow();
    writeFileSync(path.join(repo.memory, "memories", "pulled.md"), FILE("Pulled", "Pulled.", "From another machine. (source: 2026-11-06)"));
    git(repo.root, "add", ".claude/memory");
    execFileSync("git", ["commit", "-q", "-m", "chore(memory): from elsewhere"], { cwd: repo.root, env: { ...process.env, MEMORY_UPDATE: "1" } });
    const t = makeIo();
    const models = makeModels();

    expect(await update(repo, t.io, models)).toBe(1);

    expect(t.errors()).toContain("The memory changed since this dream started");
    expect(models.calls).toEqual([]);
    expect(memoryFile(repo, "memories/api.md")).toBe(API_OLD);
  });

  it("refuses --dry-run and --reindex while one is pending", async () => {
    const repo = makeRepo();
    refuseCommits(repo);
    await update(repo, makeIo(["o"]).io, makeModels());

    expect(await update(repo, makeIo().io, makeModels(), ["--dry-run"])).toBe(1);
    const reindex = makeIo();
    expect(await update(repo, reindex.io, makeModels(), ["--reindex"])).toBe(1);
    expect(reindex.errors()).toContain("pending");
  });
});

describe("--reindex", () => {
  const handWritten = FILE("Hand written", "Written by the owner.", "A fact. (source: 2026-11-07)");

  it("adds the file to usage.json and index.md, and commits nothing, calls no model, writes no stamps", async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo.memory, "memories", "mine.md"), handWritten);
    const head = git(repo.root, "rev-parse", "HEAD");
    const stamps = readFileSync(repo.stampsFile, "utf8");
    const models = makeModels();
    const t = makeIo();

    expect(await update(repo, t.io, models, ["--reindex"])).toBe(0);

    expect(models.calls).toEqual([]);
    expect(git(repo.root, "rev-parse", "HEAD")).toBe(head);
    expect(readFileSync(repo.stampsFile, "utf8")).toBe(stamps);
    expect(memoryFile(repo, "index.md")).toContain("- [Hand written](memories/mine.md): Written by the owner.");
    expect((JSON.parse(memoryFile(repo, "usage.json")) as { files: object }).files).toHaveProperty(["memories/mine.md"]);
    expect(t.text()).toContain("MEMORY_UPDATE=1 git commit");
  });

  it("is refused while a dream holds the lock", async () => {
    const repo = makeRepo();
    const release = acquireDreamLock(path.join(repo.root, ".git"));
    const t = makeIo();

    expect(await update(repo, t.io, makeModels(), ["--reindex"])).toBe(1);
    expect(t.errors()).toContain("a dream is already running");
    release();
  });

  it("is refused for a file with no summary, naming it, and writes nothing", async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo.memory, "memories", "bare.md"), "# Bare\n\nNo header.\n");
    const index = memoryFile(repo, "index.md");
    const t = makeIo();

    expect(await update(repo, t.io, makeModels(), ["--reindex"])).toBe(1);

    expect(t.errors()).toContain("memories/bare.md");
    expect(memoryFile(repo, "index.md")).toBe(index);
  });

  it("fails when the result does not pass the checks", async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo.memory, "memories", "mine.md"), handWritten.replace(" (source: 2026-11-07)", ""));
    const t = makeIo();

    expect(await update(repo, t.io, makeModels(), ["--reindex"])).toBe(1);
    expect(t.errors()).toContain("fact without a source date");
  });
});

describe("what the models are given", () => {
  it("never receives the raw transcript's personal data, and the planner sees the counted reads", async () => {
    const repo = makeRepo();
    writeFileSync(
      repo.transcript,
      readFileSync(repo.transcript, "utf8").replace("remember that.", "remember that. Mail owner@example.test or Test Owner."),
    );
    const models = makeModels();

    await update(repo, makeIo(["a"]).io, models);

    for (const call of models.calls) {
      expect(call.prompt).not.toContain("owner@example.test");
      expect(call.prompt).not.toContain("Test Owner");
    }
    expect(models.calls.find((call) => call.agent === "dream-extractor")?.prompt).toContain("[owner]");
    expect(models.calls.find((call) => call.agent === "dream-planner")?.prompt).toContain('"reads": 1');
  });
});
