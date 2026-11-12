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

import * as stampsModule from "../_lib/stamps.mjs";
import * as updateModule from "../update.mjs";

type Call = { agent: string; name: string; prompt: string; writable: string[] };
type Io = {
  out: (text: string) => void;
  err: (text: string) => void;
  ask: (question: string) => Promise<string>;
  edit: (files: string[]) => Promise<void> | void;
  onInterrupt: (callback: () => void) => () => void;
  status?: (text: string | null) => void;
};
type Deps = { run?: (call: Call) => Promise<unknown>; check?: (options?: { memoryDir?: string; full?: boolean }) => { ok: boolean; output: string }; hasClaude?: () => boolean; now?: () => Date };
type Stamps = {
  initializedAt: string;
  readsCountedUntil?: string;
  lastRun?: { at: string; status: string; choice: string | null; commit: string | null };
  sessions: Record<string, { transcript: string; branches: Record<string, { reviewedUntil: string | null; outcome?: string }> }>;
};
type Usage = { version: number; sessions: string[]; reads: Record<string, { count: number; last: string }> };
const { runUpdate } = updateModule as unknown as { runUpdate: (input: { argv: string[]; cwd?: string; io: Io; deps?: Deps }) => Promise<number> };
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

/** A fact file: the header, then the one fact. */
const FACT = (title: string, fact: string) => `---\ntitle: ${title}\nstatus: stable\ncreated: 2026-09-01\nlast_verified: 2026-11-08\n---\n\n${fact}\n`;
const API_NAME = "convex-timestamps-a1b2.md";
const API = `memories/api/${API_NAME}`;
const API_OLD = FACT("Convex timestamps", "Old fact. (source: 2026-10-01)");
const API_NEW = FACT("Convex timestamps", "Convex needs millisecond timestamps. (source: 2026-11-02)");
/** The session's first line, and the line that reads the api topic. */
const SESSION_START = "2026-11-02T10:01:00.000Z";
const API_READ = "2026-11-02T10:02:00.000Z";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** The work branch the dream runs on: it refuses `dev` and `main`. The session itself ran on `dev`. */
const BRANCH = "fix/12-eggs";
const NON_INTERACTIVE = "The terminal is non-interactive";

/**
 * A repo on a work branch cut from `dev`, with one fact and one finished session that read its
 * topic. `memories`: fact path -> text; `usage`: usage file name -> contents, already in the repo.
 */
const makeRepo = (memories: Record<string, string> = { [API]: API_OLD }, usage: Record<string, Usage> = {}) => {
  const base = mkdtempSync(path.join(os.tmpdir(), "memory-update-"));
  dirs.push(base);
  execFileSync("git", ["init", "-q", "-b", "dev", base]);
  const root = git(base, "rev-parse", "--show-toplevel");
  for (const [key, value] of [["user.name", "Test Owner"], ["user.email", "owner@example.test"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]] as const) git(root, "config", key, value);
  const memory = path.join(root, ".claude", "memory");
  mkdirSync(memory, { recursive: true });
  writeFileSync(path.join(memory, "README.md"), "# Rules\n");
  writeFileSync(path.join(memory, "_template.md"), "# Template\n");
  for (const [name, text] of Object.entries(memories)) {
    mkdirSync(path.dirname(path.join(memory, name)), { recursive: true });
    writeFileSync(path.join(memory, name), text);
  }
  for (const [name, contents] of Object.entries(usage)) {
    mkdirSync(path.join(memory, "usage"), { recursive: true });
    writeFileSync(path.join(memory, "usage", name), `${JSON.stringify(contents, null, 2)}\n`);
  }
  git(root, "add", "-A");
  execFileSync("git", ["commit", "-q", "-m", "feat: base"], { cwd: root, env: { ...process.env, GIT_COMMITTER_DATE: "2026-11-05T00:00:00Z", GIT_AUTHOR_DATE: "2026-11-05T00:00:00Z" } });
  git(root, "checkout", "-q", "-b", BRANCH);

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
      message(2, "assistant", [{ type: "text", text: "Memory: Convex needs ms timestamps." }, { type: "tool_use", name: "Read", input: { file_path: `${root}/.claude/memory/.built/api.md` } }]),
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
/** The usage file names of a memory folder. */
const usageNames = (memoryDir: string) => (existsSync(path.join(memoryDir, "usage")) ? readdirSync(path.join(memoryDir, "usage")).sort() : []);
const headFiles = (repo: Repo) => git(repo.root, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean);
/** The folder a writer may write: its grant, without the trailing `**`. */
const folderOf = (call: Call) => path.dirname(call.writable[0] as string);

/** The terminal: answers in order, everything printed kept. */
const makeIo = (answers: string[] = [], onEdit: (files: string[]) => void = () => {}) => {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const statuses: (string | null)[] = [];
  const io: Io & { interrupt?: () => void } = {
    status: (text) => void statuses.push(text),
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
  return { io, out, err, asked, statuses, text: () => out.join("\n"), errors: () => err.join("\n") };
};

const PLAN = { status: "ok", topics: [{ topic: "api", action: "update", candidates: ["s1-01"] }], delete: [], deleteTopics: [], dropped: [], docsIssues: [] };
const EMPTY_PLAN = { ...PLAN, topics: [] };

/**
 * Replies by agent. `plan` is what the planner returns; the writer rewrites the api fact as
 * `API_NEW` unless told; `extractor` runs before the extractor's reply.
 */
const makeModels = (over: { plan?: unknown; writer?: (call: Call) => unknown; review?: () => unknown; extractor?: () => void; throwAt?: string } = {}) => {
  const calls: Call[] = [];
  const run = async (call: Call): Promise<unknown> => {
    calls.push(call);
    if (over.throwAt === call.agent) throw new Error(`${call.agent} fell over`);
    if (call.agent === "dream-extractor") {
      over.extractor?.();
      return { status: "ok", candidates: [{ id: "s1-01", fact: "Convex needs ms timestamps.", kind: "pitfall", source: { sessionId: "s1", line: "u-2", timestamp: API_READ, branch: "dev" }, signaled: true }] };
    }
    if (call.agent === "dream-planner") return over.plan ?? PLAN;
    if (call.agent === "dream-writer" && call.name.startsWith("correction")) {
      return over.writer?.(call) ?? { status: "ok", changed: [], alerts: [], drop: [], notes: [] };
    }
    if (call.agent === "dream-writer") {
      if (over.writer !== undefined) return over.writer(call);
      writeFileSync(path.join(folderOf(call), API_NAME), API_NEW);
      return { status: "ok", topic: "api", facts: [{ text: "Convex needs ms timestamps.", candidates: ["s1-01"] }], alerts: [] };
    }
    return over.review?.() ?? { status: "ok", flags: [], drop: [], notes: [] };
  };
  return { run, calls, agents: () => calls.map((call) => call.agent) };
};

/** A writer that writes API_NEW, and a correction that rewrites the api fact as `corrected`. */
const correctingWriter = (corrected: string, reply: object = {}) => (call: Call) => {
  if (call.name.startsWith("correction")) {
    writeFileSync(path.join(folderOf(call), "api", API_NAME), corrected);
    return { status: "ok", changed: [API], alerts: [], drop: [], notes: [], ...reply };
  }
  writeFileSync(path.join(folderOf(call), API_NAME), API_NEW);
  return { status: "ok", topic: "api", facts: [{ text: "f", candidates: ["s1-01"] }], alerts: [] };
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

  it("refuses uncommitted changes in the memory, and calls no model", async () => {
    const repo = makeRepo();
    mkdirSync(path.join(repo.memory, "memories", "mine"), { recursive: true });
    writeFileSync(path.join(repo.memory, "memories", "mine", "a-fact-m1n3.md"), FACT("Mine", "A fact. (source: 2026-11-01)"));
    const t = makeIo();
    const models = makeModels();

    expect(await update(repo, t.io, models)).toBe(1);
    expect(t.errors()).toContain("uncommitted changes");
    expect(models.calls).toEqual([]);
  });

  it("refuses an encrypted fact file, naming the setup command", async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo.memory, API), "U2FsdGVkX1+ciphertext");
    git(repo.root, "commit", "-qam", "chore: encrypted stand-in");
    const t = makeIo();
    const models = makeModels();

    expect(await update(repo, t.io, models)).toBe(1);
    expect(t.errors()).toContain("pnpm memory:setup");
    expect(models.calls).toEqual([]);
  });

  it("refuses a memory with no fact, saying the branch may be older than the memory", async () => {
    const repo = makeRepo();
    git(repo.root, "rm", "-rq", ".claude/memory/memories");
    git(repo.root, "commit", "-qm", "chore: no fact");
    const t = makeIo();
    const models = makeModels();

    expect(await update(repo, t.io, models)).toBe(1);
    expect(t.errors()).toContain("There is no memory here");
    expect(t.errors()).toContain("Merge dev into it");
    expect(models.calls).toEqual([]);
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

  it("refuses an unknown argument, --reindex included, with the usage", async () => {
    const repo = makeRepo();
    const wat = makeIo();
    expect(await update(repo, wat.io, makeModels(), ["--wat"])).toBe(1);
    expect(wat.errors()).toContain("Usage: pnpm memory:update [--dry-run]");

    const reindex = makeIo();
    expect(await update(repo, reindex.io, makeModels(), ["--reindex"])).toBe(1);
    expect(reindex.errors()).toContain("unknown argument --reindex");
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

  it("says there is nothing to read, calls no model and writes no stamps, when no session is unread", async () => {
    const repo = makeRepo();
    rmSync(repo.transcript);
    const t = makeIo();
    const models = makeModels();

    expect(await update(repo, t.io, models)).toBe(0);
    expect(t.text()).toContain("Nothing to read");
    expect(models.calls).toEqual([]);
    expect(stampsOf(repo).lastRun).toBeUndefined();
  });

  it("refuses on dev and on main, interactive or not, and calls no model", async () => {
    const repo = makeRepo();
    const models = makeModels();
    for (const [branch, argv] of [["dev", []], ["dev", ["--auto"]], ["main", []], ["main", ["--auto"]]] as const) {
      git(repo.root, "checkout", "-q", "-B", branch);
      const t = makeIo();

      expect(await update(repo, t.io, models, [...argv])).toBe(1);
      expect(t.errors()).toContain("never on dev or main");
    }
    expect(models.calls).toEqual([]);
  });

  it("refuses --auto with --dry-run", async () => {
    const t = makeIo();

    expect(await update(makeRepo(), t.io, makeModels(), ["--auto", "--dry-run"])).toBe(1);
    expect(t.errors()).toContain("--auto and --dry-run");
  });
});

describe("nothing to read on a work branch", () => {
  const head = (repo: Repo) => git(repo.root, "rev-parse", "HEAD");

  it("commits an empty memory commit with the trailer, so the PR's memory check sees the dream ran", async () => {
    const repo = makeRepo();
    rmSync(repo.transcript);
    const before = { head: head(repo), stamps: readFileSync(repo.stampsFile, "utf8") };

    expect(await update(repo, makeIo().io, makeModels(), ["--auto"])).toBe(0);

    expect(git(repo.root, "rev-parse", "HEAD~1")).toBe(before.head);
    expect(headFiles(repo)).toEqual([]);
    expect(git(repo.root, "log", "-1", "--format=%B")).toBe("chore(memory): no session to read\n\nMemory-Update: yes");
    expect(readFileSync(repo.stampsFile, "utf8")).toBe(before.stamps);
  });

  it("adds no commit when HEAD already carries the trailer: a rerun after dev moved", async () => {
    const repo = makeRepo();
    rmSync(repo.transcript);
    await update(repo, makeIo().io, makeModels());
    const before = head(repo);
    const t = makeIo();

    expect(await update(repo, t.io, makeModels(), ["--auto"])).toBe(0);

    expect(head(repo)).toBe(before);
    expect(t.text()).toContain("Nothing to read");
  });

  it("refuses when something is staged outside the memory, which an empty commit would take in", async () => {
    const repo = makeRepo();
    rmSync(repo.transcript);
    writeFileSync(path.join(repo.root, "other.txt"), "unrelated\n");
    git(repo.root, "add", "other.txt");
    const before = head(repo);
    const t = makeIo();

    expect(await update(repo, t.io, makeModels(), ["--auto"])).toBe(1);

    expect(t.errors()).toContain("staged outside .claude/memory");
    expect(head(repo)).toBe(before);
    expect(git(repo.root, "diff", "--cached", "--name-only")).toBe("other.txt");
  });

  it("commits nothing on --dry-run", async () => {
    const repo = makeRepo();
    rmSync(repo.transcript);
    const before = head(repo);

    expect(await update(repo, makeIo().io, makeModels(), ["--dry-run"])).toBe(0);
    expect(head(repo)).toBe(before);
  });
});

describe("--auto", () => {
  /** An upstream that cannot be fetched: a `git pull` fails, so a run that pulls fails. */
  const withUnreachableUpstream = (repo: Repo) => {
    git(repo.root, "remote", "add", "origin", path.join(repo.root, "no-such-remote"));
    git(repo.root, "update-ref", `refs/remotes/origin/${BRANCH}`, "HEAD");
    git(repo.root, "branch", "-q", `--set-upstream-to=origin/${BRANCH}`);
  };
  const reviewerPrompt = (models: ReturnType<typeof makeModels>) => models.calls.find((call) => call.agent === "dream-reviewer")?.prompt;
  const openFlag = (flagPath: string) => ({ path: flagPath, fact: "A fact.", problem: "Goes back on the owner's correction.", evidence: "git log", severity: "high" });

  it("asks nothing, does not pull, and commits the dream as [o] would", async () => {
    const repo = makeRepo();
    withUnreachableUpstream(repo);
    const pulling = makeIo(["a"]);
    expect(await update(repo, pulling.io, makeModels())).toBe(1);
    expect(pulling.errors()).toContain("git pull failed");
    const t = makeIo();

    expect(await update(repo, t.io, makeModels(), ["--auto"])).toBe(0);

    expect(t.asked).toEqual([]);
    expect(t.text()).not.toContain("git pull");
    expect(memoryFile(repo, API)).toBe(API_NEW);
    expect(headFiles(repo)).toContain(`.claude/memory/${API}`);
    expect(git(repo.root, "log", "-1", "--format=%B")).toMatch(/\n\nMemory-Update: yes$/);
    expect(stampsOf(repo).sessions.s1?.branches.dev?.outcome).toBe("accepted");
  });

  it("puts back a changed fact the reviewer leaves flagged, and names it", async () => {
    const repo = makeRepo();
    const models = makeModels({ review: () => ({ status: "ok", flags: [openFlag(API)], drop: [], notes: [{ path: API, note: "Rewords the timestamps." }] }) });
    const t = makeIo();

    expect(await update(repo, t.io, models, ["--auto"])).toBe(0);

    expect(memoryFile(repo, API)).toBe(API_OLD);
    expect(headFiles(repo)).not.toContain(`.claude/memory/${API}`);
    expect(t.text()).toContain(`Dropped, left flagged by the reviewer\n  ${API}: Goes back on the owner's correction.`);
  });

  it("removes a created fact the reviewer leaves flagged, and names it", async () => {
    const repo = makeRepo();
    let created = "";
    const models = makeModels({
      plan: { ...EMPTY_PLAN, topics: [{ topic: "upload", action: "create", candidates: ["s1-01"] }] },
      writer: (call) => {
        writeFileSync(path.join(folderOf(call), "draft.md"), FACT("Ten MB uploads", "Uploads stop at ten MB. (source: 2026-11-02)"));
        return { status: "ok", topic: "upload", facts: [{ text: "Ten MB.", candidates: ["s1-01"] }], alerts: [] };
      },
      review: () => {
        const folder = path.join(repo.root, ".tmp", "memory", dreamDirs(repo)[0] as string, "memory", "memories", "upload");
        created = `memories/upload/${readdirSync(folder)[0]}`;
        return { status: "ok", flags: [openFlag(created)], drop: [], notes: [] };
      },
    });
    const t = makeIo();

    expect(await update(repo, t.io, models, ["--auto"])).toBe(0);

    expect(existsSync(path.join(repo.memory, "memories", "upload"))).toBe(false);
    expect(t.text()).toContain(`  ${created}: Goes back on the owner's correction.`);
  });

  it("tells the reviewer that what it leaves flagged is dropped; the owner's terminal does not", async () => {
    const auto = makeModels();
    await update(makeRepo(), makeIo().io, auto, ["--auto"]);
    const owner = makeModels();
    await update(makeRepo(), makeIo(["a"]).io, owner);

    expect(reviewerPrompt(auto)).toContain(NON_INTERACTIVE);
    expect(reviewerPrompt(owner)).not.toContain(NON_INTERACTIVE);
  });
});

describe("U2: the pull", () => {
  /** `repo` with a bare upstream, and the upstream's api fact rewritten by someone else. */
  const withDivergedUpstream = (repo: Repo, upstreamEdit: (clone: string) => void, localText: string) => {
    const remote = mkdtempSync(path.join(os.tmpdir(), "memory-update-remote-"));
    const other = mkdtempSync(path.join(os.tmpdir(), "memory-update-other-"));
    dirs.push(remote, other);
    execFileSync("git", ["init", "-q", "--bare", "-b", "dev", remote]);
    git(repo.root, "remote", "add", "origin", remote);
    git(repo.root, "config", "pull.rebase", "false");
    git(repo.root, "push", "-q", "-u", "origin", BRANCH);
    git(other, "clone", "-q", "-b", BRANCH, remote, "clone");
    const clone = path.join(other, "clone");
    for (const [key, value] of [["user.name", "Other"], ["user.email", "other@example.test"], ["commit.gpgsign", "false"]] as const) git(clone, "config", key, value);
    upstreamEdit(clone);
    git(clone, "add", "-A");
    git(clone, "commit", "-q", "-m", "chore: change from the other machine");
    git(clone, "push", "-q", "origin", BRANCH);
    writeFileSync(path.join(repo.memory, API), localText);
    git(repo.root, "commit", "-q", "-am", "chore: local memory edit");
  };

  it("stops before dreaming on a conflict in the memory, naming the way out, and writes nothing", async () => {
    const repo = makeRepo();
    withDivergedUpstream(
      repo,
      (clone) => writeFileSync(path.join(clone, ".claude", "memory", API), API_OLD.replace("Old fact", "Upstream fact")),
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
    withDivergedUpstream(repo, (clone) => writeFileSync(path.join(clone, "elsewhere.txt"), "x"), API_NEW.replace("millisecond", "ms"));
    const t = makeIo(["a"]);
    const models = makeModels();

    await update(repo, t.io, models);

    expect(models.agents()[0]).toBe("dream-extractor");
  });
});

describe("U4: the usage file", () => {
  it("writes one usage file for the dream, with the session start and the topic reads it saw", async () => {
    const repo = makeRepo();

    await update(repo, makeIo(["o"]).io, makeModels());

    const names = usageNames(repo.memory);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^2026-11-08-[a-z0-9]{4}\.json$/);
    expect(JSON.parse(memoryFile(repo, `usage/${names[0]}`))).toEqual({ version: 2, sessions: [SESSION_START], reads: { api: { count: 1, last: API_READ } } });
  });

  it("never deletes a usage file of the repo, even one the dream's copy lost", async () => {
    const older = { version: 2, sessions: ["2026-10-15T09:00:00.000Z"], reads: {} };
    const repo = makeRepo({ [API]: API_OLD }, { "2026-10-15-zzzz.json": older });
    const models = makeModels({
      extractor: () => rmSync(path.join(repo.root, ".tmp", "memory", dreamDirs(repo)[0] as string, "memory", "usage", "2026-10-15-zzzz.json")),
    });

    expect(await update(repo, makeIo(["o"]).io, models)).toBe(0);

    expect(usageNames(repo.memory)).toHaveLength(2);
    expect(JSON.parse(memoryFile(repo, "usage/2026-10-15-zzzz.json"))).toEqual(older);
    expect(git(repo.root, "log", "-1", "--format=%B")).not.toContain("2026-10-15-zzzz");
  });
});

describe("the choices", () => {
  it("[o] commits the memory and only the memory, with the trailer, and keeps other staged work staged", async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo.root, "other.txt"), "unrelated\n");
    git(repo.root, "add", "other.txt");
    const t = makeIo(["o"]);

    expect(await update(repo, t.io, makeModels())).toBe(0);

    const usage = usageNames(repo.memory)[0] as string;
    expect(headFiles(repo).sort()).toEqual([`.claude/memory/${API}`, `.claude/memory/usage/${usage}`]);
    expect(git(repo.root, "diff", "--cached", "--name-only")).toBe("other.txt");
    const message = git(repo.root, "log", "-1", "--format=%B");
    expect(message).toBe(`chore(memory): update after 1 session\n\n- modifies ${API}\n- adds usage/${usage}\n\nMemory-Update: yes`);
    expect(message).not.toMatch(/Co-Authored-By/i);
    expect(memoryFile(repo, API)).toBe(API_NEW);
    expect(t.text()).toContain("Memory updated (1 fact changed");
    expect(t.text()).not.toContain("git push");
  });

  it("[o] writes the stamps: the pair reviewed, the reads counted, the commit recorded, the dream folder gone", async () => {
    const repo = makeRepo();

    await update(repo, makeIo(["o"]).io, makeModels());

    const stamps = stampsOf(repo);
    expect(stamps.sessions.s1?.branches.dev).toEqual({ reviewedUntil: API_READ, outcome: "accepted" });
    expect(stamps.readsCountedUntil).toBe(NOW.toISOString());
    expect(stamps.lastRun).toEqual({ at: NOW.toISOString(), status: "ok", choice: "accepted", commit: git(repo.root, "rev-parse", "HEAD") });
    expect(dreamDirs(repo)).toEqual([]);
  });

  it("[o] mirrors a deleted fact and a new topic into the repo's memory, its new fact named by the script", async () => {
    const gone = "memories/old/gone-soon-0ld1.md";
    const repo = makeRepo({ [API]: API_OLD, [gone]: FACT("Gone soon", "Gone soon. (source: 2026-09-01)") });
    const models = makeModels({
      plan: { ...EMPTY_PLAN, topics: [{ topic: "upload", action: "create", candidates: ["s1-01"] }], delete: [{ fact: gone, reason: "The code it describes is gone.", because: "gone" }] },
      writer: (call) => {
        writeFileSync(path.join(folderOf(call), "draft.md"), FACT("Ten MB uploads", "Uploads stop at ten MB. (source: 2026-11-02)"));
        return { status: "ok", topic: "upload", facts: [{ text: "Ten MB.", candidates: ["s1-01"] }], alerts: [] };
      },
    });
    const t = makeIo(["o"]);

    expect(await update(repo, t.io, models)).toBe(0);

    expect(existsSync(path.join(repo.memory, "memories", "old"))).toBe(false);
    const upload = readdirSync(path.join(repo.memory, "memories", "upload"));
    expect(upload).toHaveLength(1);
    expect(upload[0]).toMatch(/^ten-mb-uploads-[a-z0-9]{4}\.md$/);
    expect(git(repo.root, "log", "-1", "--format=%B")).toContain(`- creates memories/upload/${upload[0]}\n- deletes ${gone}`);
    expect(t.text()).toContain(`Deletions proposed\n  ${gone}: The code it describes is gone.`);
  });

  it("[a] writes nothing: memory, stamps and history stay as they were, the sessions stay unread", async () => {
    const repo = makeRepo();
    const before = { head: git(repo.root, "rev-parse", "HEAD"), stamps: readFileSync(repo.stampsFile, "utf8") };

    expect(await update(repo, makeIo(["a"]).io, makeModels())).toBe(0);

    expect(git(repo.root, "rev-parse", "HEAD")).toBe(before.head);
    expect(readFileSync(repo.stampsFile, "utf8")).toBe(before.stamps);
    expect(memoryFile(repo, API)).toBe(API_OLD);
    expect(usageNames(repo.memory)).toEqual([]);
    expect(git(repo.root, "status", "--porcelain", "--", ".claude/memory")).toBe("");
    expect(dreamDirs(repo)).toEqual([]);
  });

  it("[i] writes the stamps and no commit, and leaves the memory alone", async () => {
    const repo = makeRepo();
    const head = git(repo.root, "rev-parse", "HEAD");

    expect(await update(repo, makeIo(["i"]).io, makeModels())).toBe(0);

    expect(git(repo.root, "rev-parse", "HEAD")).toBe(head);
    expect(memoryFile(repo, API)).toBe(API_OLD);
    expect(usageNames(repo.memory)).toEqual([]);
    const stamps = stampsOf(repo);
    expect(stamps.sessions.s1?.branches.dev?.outcome).toBe("ignored");
    expect(stamps.readsCountedUntil).toBeUndefined();
    expect(stamps.lastRun).toMatchObject({ status: "ok", choice: "ignored", commit: null });
  });

  it("nochange with reads: commits the usage file without asking, and the stamps say nochange with the commit", async () => {
    const repo = makeRepo();
    const t = makeIo();

    expect(await update(repo, t.io, makeModels({ plan: EMPTY_PLAN }))).toBe(0);

    expect(t.asked).toEqual([]);
    const usage = usageNames(repo.memory)[0] as string;
    expect(headFiles(repo)).toEqual([`.claude/memory/usage/${usage}`]);
    expect(git(repo.root, "log", "-1", "--format=%B")).toBe(`chore(memory): usage after 1 session\n\n- adds usage/${usage}\n\nMemory-Update: yes`);
    expect(memoryFile(repo, API)).toBe(API_OLD);
    const stamps = stampsOf(repo);
    expect(stamps.sessions.s1?.branches.dev?.outcome).toBe("nochange");
    expect(stamps.readsCountedUntil).toBe(NOW.toISOString());
    expect(stamps.lastRun).toEqual({ at: NOW.toISOString(), status: "ok", choice: "nochange", commit: git(repo.root, "rev-parse", "HEAD") });
    expect(t.text()).toContain("No fact to change; the reads are committed");
  });

  it("nochange with no session start and no read in the window: no commit, the reads are not counted", async () => {
    const repo = makeRepo();
    // The window opens after the session's lines: they are still unread, but already counted.
    writeFileSync(repo.stampsFile, JSON.stringify({ version: 1, initializedAt: "2026-10-01T00:00:00.000Z", readsCountedUntil: "2026-11-03T00:00:00.000Z", sessions: {} }));
    const head = git(repo.root, "rev-parse", "HEAD");
    const t = makeIo();

    expect(await update(repo, t.io, makeModels({ plan: EMPTY_PLAN }))).toBe(0);

    expect(t.asked).toEqual([]);
    expect(git(repo.root, "rev-parse", "HEAD")).toBe(head);
    expect(git(repo.root, "status", "--porcelain", "--", ".claude/memory")).toBe("");
    const stamps = stampsOf(repo);
    expect(stamps.sessions.s1?.branches.dev?.outcome).toBe("nochange");
    expect(stamps.readsCountedUntil).toBe("2026-11-03T00:00:00.000Z");
    expect(stamps.lastRun).toMatchObject({ choice: "nochange", commit: null });
    expect(t.text()).toContain("No change needed");
  });

  it("nochange still shows what the planner left out, and the docs it thinks are wrong", async () => {
    const plan = { ...EMPTY_PLAN, dropped: [{ candidate: "s1-01", reason: "AGENTS.md already says it." }], docsIssues: [{ doc: "docs/ARCHITECTURE.md", issue: "Stale." }] };
    const t = makeIo();

    expect(await update(makeRepo(), t.io, makeModels({ plan }))).toBe(0);

    expect(t.text()).toContain("Left out by the planner\n  s1-01: Convex needs ms timestamps. — AGENTS.md already says it.");
    expect(t.text()).toContain("Docs that look wrong\n  docs/ARCHITECTURE.md: Stale.");
  });

  it("[m] applies the owner's instruction, runs the checks again, and records the dream as edited", async () => {
    const repo = makeRepo();
    const models = makeModels({ writer: correctingWriter(API_NEW.replace("millisecond", "ms"), { alerts: [{ kind: "other", message: "Reworded." }] }) });
    const t = makeIo(["m", "say ms, not millisecond", "o"]);

    expect(await update(repo, t.io, models)).toBe(0);

    const correction = models.calls.find((call) => call.name === "correction-1");
    expect(correction?.prompt).toContain("say ms, not millisecond");
    expect(correction?.writable[0]).toMatch(/memories[\\/]\*\*$/);
    expect(memoryFile(repo, API)).toContain("Convex needs ms timestamps");
    expect(stampsOf(repo).sessions.s1?.branches.dev?.outcome).toBe("edited");
    expect(models.agents().filter((agent) => agent === "dream-reviewer")).toHaveLength(1);
  });

  it("ends the report with the summary, after the diff, and a correction's note replaces the reviewer's", async () => {
    const repo = makeRepo();
    const models = makeModels({
      review: () => ({ status: "ok", flags: [], drop: [], notes: [{ path: API, note: "Says Convex wants milliseconds." }] }),
      writer: correctingWriter(API_NEW.replace("millisecond", "ms"), { notes: [{ path: API, note: "Now says ms." }] }),
    });
    const t = makeIo(["m", "say ms, not millisecond", "o"]);

    expect(await update(repo, t.io, models)).toBe(0);

    const summaries = t.out.flatMap((text, at) => (text.startsWith("Summary:") ? [at] : []));
    expect(summaries).toHaveLength(2);
    expect(t.out.slice(0, summaries[0]).some((text) => text.includes("diff --git"))).toBe(true);
    expect(t.out[summaries[0] as number]).toContain(`~ ${API}`);
    expect(t.out[summaries[0] as number]).toContain("Says Convex wants milliseconds.");
    expect(t.out[summaries[1] as number]).toContain("Now says ms.");
    expect(t.out[summaries[1] as number]).not.toContain("Says Convex wants milliseconds.");
  });

  it("[m] with :e opens the facts of the copy, and the checks run on what the owner saved", async () => {
    const repo = makeRepo();
    let opened: string[] = [];
    const t = makeIo(["m", ":e", "o"], (files) => {
      opened = files;
      writeFileSync(files.find((file) => file.endsWith(API_NAME)) as string, API_NEW.replace("millisecond", "ms"));
    });

    expect(await update(repo, t.io, makeModels())).toBe(0);

    expect(opened.length).toBeGreaterThan(0);
    expect(opened.every((file) => file.includes(`${path.sep}.tmp${path.sep}memory${path.sep}dream-`))).toBe(true);
    expect(memoryFile(repo, API)).toContain("ms timestamps");
  });

  it("[m] with :e: a fact the owner adds by hand is named by the script before it is committed", async () => {
    const repo = makeRepo();
    const t = makeIo(["m", ":e", "o"], (files) => {
      writeFileSync(path.join(path.dirname(files[0] as string), "my-note.md"), FACT("Ten MB uploads", "Uploads stop at ten MB. (source: correction of 2026-11-08)"));
    });

    expect(await update(repo, t.io, makeModels())).toBe(0);

    const api = readdirSync(path.join(repo.memory, "memories", "api")).sort();
    expect(api).toHaveLength(2);
    expect(api).toContain(API_NAME);
    expect(api.find((name) => name !== API_NAME)).toMatch(/^ten-mb-uploads-[a-z0-9]{4}\.md$/);
  });

  it("[m] shows the failed checks and asks again, without a second review", async () => {
    const repo = makeRepo();
    let attempt = 0;
    const t = makeIo(["m", ":e", "fix it", "o"], (files) => {
      attempt += 1;
      writeFileSync(files.find((file) => file.endsWith(API_NAME)) as string, API_NEW.replace(" (source: 2026-11-02)", ""));
    });
    const models = makeModels({ writer: correctingWriter(API_NEW) });

    expect(await update(repo, t.io, models)).toBe(0);

    expect(attempt).toBe(1);
    expect(t.text()).toContain("The checks failed");
    expect(t.text()).toContain("fact without a source date");
    expect(memoryFile(repo, API)).toContain("(source: 2026-11-02)");
    expect(models.agents().filter((agent) => agent === "dream-reviewer")).toHaveLength(1);
  });
});

describe("--dry-run", () => {
  it("shows the diff, then writes nothing: no stamps, no lastRun, no commit, memory untouched; keeps the logs", async () => {
    const repo = makeRepo();
    const before = { head: git(repo.root, "rev-parse", "HEAD"), stamps: readFileSync(repo.stampsFile, "utf8") };
    const t = makeIo();

    expect(await update(repo, t.io, makeModels(), ["--dry-run"])).toBe(0);

    expect(t.asked).toEqual([]);
    expect(t.text()).toContain("+Convex needs millisecond timestamps. (source: 2026-11-02)");
    expect(t.text()).toContain("Dry run: nothing was written");
    expect(readFileSync(repo.stampsFile, "utf8")).toBe(before.stamps);
    expect(git(repo.root, "rev-parse", "HEAD")).toBe(before.head);
    expect(memoryFile(repo, API)).toBe(API_OLD);
    expect(usageNames(repo.memory)).toEqual([]);
    expect(dreamDirs(repo)).toHaveLength(1);
  });
});

describe("the steps", () => {
  it("shows each agent step on the status line while it runs, then prints it with ✓", async () => {
    const repo = makeRepo();
    const t = makeIo(["a"]);

    expect(await update(repo, t.io, makeModels())).toBe(0);

    expect(t.statuses).toContain("P3  planning from 1 candidate(s)");
    const done = t.out.filter((line) => line.startsWith("✓ P"));
    expect(done.map((line) => line.replace(/ \(\d+s\)$/, ""))).toEqual([
      "✓ P2  extracting from 1 conversation(s)",
      "✓ P3  planning from 1 candidate(s)",
      "✓ P4  writing 1 topic(s), deleting 0 fact(s) and 0 topic(s)",
      "✓ P5  mechanical checks",
      "✓ P6  review",
    ]);
    expect(t.out.indexOf(done.at(-1) as string)).toBeLessThan(t.out.findIndex((line) => line.startsWith("Summary:")));
  });

  it("shows the [m] correction on the status line, and marks the step that failed with ✗", async () => {
    const corrected = makeIo(["m", "say ms, not millisecond", "o"]);
    await update(makeRepo(), corrected.io, makeModels({ writer: correctingWriter(API_NEW.replace("millisecond", "ms")) }));
    expect(corrected.out.some((line) => /^✓ Applying your correction \(\d+s\)$/.test(line))).toBe(true);

    const failed = makeIo();
    await update(makeRepo(), failed.io, makeModels({ throwAt: "dream-planner" }));
    expect(failed.out.some((line) => /^✗ P3 {2}planning from 1 candidate\(s\) \(\d+s\)$/.test(line))).toBe(true);
    expect(failed.statuses.at(-1)).toBeNull();
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
  const installHook = (repo: Repo, lines: string[]) => {
    const hooks = path.join(repo.root, ".hooks");
    mkdirSync(hooks, { recursive: true });
    writeFileSync(path.join(hooks, "pre-commit"), ["#!/bin/sh", ...lines, ""].join("\n"), { mode: 0o755 });
    git(repo.root, "config", "core.hooksPath", hooks);
    return () => git(repo.root, "config", "--unset", "core.hooksPath");
  };
  const refuseCommits = (repo: Repo) => installHook(repo, ["echo 'C3 query and index rules'", "echo 'verify failed (test)' >&2", "exit 1"]);
  const copyUsage = (repo: Repo) => usageNames(path.join(repo.root, ".tmp", "memory", dreamDirs(repo)[0] as string, "memory"));

  it("a refused commit prints the hook's whole output, so the owner sees what failed", async () => {
    const repo = makeRepo();
    refuseCommits(repo);
    const t = makeIo(["o"]);

    expect(await update(repo, t.io, makeModels())).toBe(1);

    expect(t.errors()).toContain("C3 query and index rules");
    expect(t.errors()).toContain("verify failed (test)");
    expect(t.statuses.at(-1)).toBeNull();
  });

  it("an accepted commit shows one progress line and none of the hook's output", async () => {
    const repo = makeRepo();
    installHook(repo, ["echo '. lint$ eslint .'", "echo 'a line of the test run' >&2", "echo '. lint: Done'"]);
    const t = makeIo(["o"]);

    expect(await update(repo, t.io, makeModels())).toBe(0);

    expect(`${t.text()}\n${t.errors()}`).not.toContain("a line of the test run");
    expect(t.statuses).toContain("Verifying · . lint: Done");
    expect(t.statuses.at(-1)).toBeNull();
  });

  it("a refused commit keeps the dream and its pending.json, restores the memory, writes no stamps", async () => {
    const repo = makeRepo();
    refuseCommits(repo);
    const t = makeIo(["o"]);

    expect(await update(repo, t.io, makeModels())).toBe(1);

    expect(t.errors()).toContain("The commit was refused");
    expect(existsSync(path.join(repo.root, ".tmp", "memory", dreamDirs(repo)[0] as string, "pending.json"))).toBe(true);
    expect(git(repo.root, "status", "--porcelain", "--", ".claude/memory")).toBe("");
    expect(memoryFile(repo, API)).toBe(API_OLD);
    expect(usageNames(repo.memory)).toEqual([]);
    expect(stampsOf(repo).sessions).toEqual({});
  });

  it("the next run finishes the commit from the dream's copy without calling a model, with the dream's one usage file", async () => {
    const repo = makeRepo();
    const allow = refuseCommits(repo);
    await update(repo, makeIo(["o"]).io, makeModels());
    const pendingUsage = copyUsage(repo);
    allow();
    const models = makeModels();
    const t = makeIo();

    expect(await update(repo, t.io, models)).toBe(0);

    expect(models.calls).toEqual([]);
    expect(t.asked).toEqual([]);
    expect(pendingUsage).toHaveLength(1);
    expect(usageNames(repo.memory)).toEqual(pendingUsage);
    expect(headFiles(repo).sort()).toEqual([`.claude/memory/${API}`, `.claude/memory/usage/${pendingUsage[0]}`]);
    expect(memoryFile(repo, API)).toBe(API_NEW);
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
    expect(t.errors()).toContain(`pending on branch ${BRANCH}`);
  });

  it("refuses when the memory changed at HEAD since the dream started, and mirrors nothing", async () => {
    const repo = makeRepo();
    const allow = refuseCommits(repo);
    await update(repo, makeIo(["o"]).io, makeModels());
    allow();
    mkdirSync(path.join(repo.memory, "memories", "pulled"), { recursive: true });
    writeFileSync(path.join(repo.memory, "memories", "pulled", "from-another-machine-p1p1.md"), FACT("From another machine", "From another machine. (source: 2026-11-06)"));
    git(repo.root, "add", ".claude/memory");
    execFileSync("git", ["commit", "-q", "-m", "chore(memory): from elsewhere"], { cwd: repo.root, env: { ...process.env, MEMORY_UPDATE: "1" } });
    const t = makeIo();
    const models = makeModels();

    expect(await update(repo, t.io, models)).toBe(1);

    expect(t.errors()).toContain("The memory changed since this dream started");
    expect(models.calls).toEqual([]);
    expect(memoryFile(repo, API)).toBe(API_OLD);
    expect(usageNames(repo.memory)).toEqual([]);
  });

  it("refuses --dry-run while one is pending", async () => {
    const repo = makeRepo();
    refuseCommits(repo);
    await update(repo, makeIo(["o"]).io, makeModels());
    const t = makeIo();

    expect(await update(repo, t.io, makeModels(), ["--dry-run"])).toBe(1);
    expect(t.errors()).toContain("pending");
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
