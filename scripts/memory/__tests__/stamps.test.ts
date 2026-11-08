/**
 * The stamps say which sessions a dream already read (spec §7). A wrong stamp is silent: moved
 * back, a dream rereads a month of sessions; moved forward, an unread lesson is lost for good. So
 * the file is validated on every read, written atomically, and only `recordReview` moves it.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/stamps.mjs";

/** `stamps.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
type Outcome = "accepted" | "edited" | "ignored" | "nochange";
type Pair = { reviewedUntil: string | null; outcome?: Outcome };
type Stamps = {
  version: 1;
  initializedAt: string;
  readsCountedUntil?: string;
  lastRun?: { at: string; status: "ok" | "failed"; choice: Outcome | null; commit: string | null };
  sessions: Record<string, { transcript: string; branches: Record<string, Pair> }>;
};
type LineRef = { sessionId: string; branch: string; timestamp: string; transcript: string };
type Run = NonNullable<Stamps["lastRun"]>;
const { acquireDreamLock, createStamps, pruneStamps, readStamps, recordReview, stampsPath, writeStamps } =
  lib as unknown as {
    acquireDreamLock: (dir?: string) => () => void;
    createStamps: (now?: Date) => Stamps;
    pruneStamps: (stamps: Stamps, exists?: (file: string) => boolean) => Stamps;
    readStamps: (file?: string) => Stamps;
    recordReview: (
      stamps: Stamps,
      input: { selected: LineRef[]; onOpenBranches?: LineRef[]; outcome: Outcome; run: Run; readsCountedUntil?: string },
    ) => Stamps;
    stampsPath: (cwd?: string) => string;
    writeStamps: (stamps: Stamps, file?: string, options?: { rename?: (from: string, to: string) => void }) => void;
  };

// The pre-commit hook runs verify with GIT_* set for the real repo; the throwaway repos must not see them.
for (const name of Object.keys(process.env)) if (/^GIT_/i.test(name)) delete process.env[name];

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});
const tempDir = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "memory-stamps-"));
  created.push(dir);
  return dir;
};
const tempFile = (content?: string) => {
  const file = path.join(tempDir(), "dream-stamps.json");
  if (content !== undefined) writeFileSync(file, content);
  return file;
};

const INIT = "2026-10-20T09:00:00.000Z";
const RUN: Run = { at: "2026-11-08T01:40:00.000Z", status: "ok", choice: "accepted", commit: "a1b2c3d" };
const line = (sessionId: string, branch: string, timestamp: string): LineRef => ({
  sessionId,
  branch,
  timestamp,
  transcript: `/projects/cuisko/${sessionId}.jsonl`,
});
const base = (): Stamps => ({ version: 1, initializedAt: INIT, sessions: {} });

const errorOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error as Error & { kind?: string };
  }
  throw new Error("expected a throw");
};

describe("reading", () => {
  it("throws `missing` with the setup command when there is no file", () => {
    const error = errorOf(() => readStamps(path.join(tempDir(), "dream-stamps.json")));
    expect(error.kind).toBe("missing");
    expect(error.message).toMatch(/pnpm memory:setup/);
  });

  it("throws `invalid` naming the field and the reset command", () => {
    const file = tempFile(JSON.stringify({ ...base(), initializedAt: "last tuesday" }));
    const error = errorOf(() => readStamps(file));
    expect(error.kind).toBe("invalid");
    expect(error.message).toMatch(/initializedAt/);
    expect(error.message).toMatch(/pnpm memory:setup --reset-stamps/);
  });

  it("throws `invalid` on a truncated file", () => {
    expect(errorOf(() => readStamps(tempFile('{"version":1,"initial'))).kind).toBe("invalid");
  });

  it("refuses a version it does not know", () => {
    expect(errorOf(() => readStamps(tempFile(JSON.stringify({ ...base(), version: 2 })))).kind).toBe("invalid");
  });

  it("migrates a file from before the version field", () => {
    const { version: _, ...unversioned } = base();
    expect(readStamps(tempFile(JSON.stringify(unversioned)))).toEqual(base());
  });

  it("reads back what it wrote", () => {
    const file = tempFile();
    const stamps = recordReview(base(), { selected: [line("s1", "dev", "2026-11-02T18:40:00.000Z")], outcome: "accepted", run: RUN });
    writeStamps(stamps, file);
    expect(readStamps(file)).toEqual(stamps);
  });
});

describe("writing", () => {
  it("refuses invalid stamps and leaves the file as it was", () => {
    const file = tempFile();
    writeStamps(base(), file);
    expect(() => writeStamps({ ...base(), initializedAt: "never" }, file)).toThrow();
    expect(readStamps(file)).toEqual(base());
  });

  it("retries a busy rename, then succeeds", () => {
    const file = tempFile();
    let calls = 0;
    const rename = (from: string, to: string) => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error("busy"), { code: "EPERM" });
      writeFileSync(to, readFileSync(from));
    };
    writeStamps(base(), file, { rename });
    expect(calls).toBe(3);
    expect(readStamps(file)).toEqual(base());
  });

  it("gives up after five busy renames, keeps the old file whole and leaves no temp file", () => {
    const file = tempFile();
    writeStamps(base(), file);
    let calls = 0;
    const rename = () => {
      calls += 1;
      throw Object.assign(new Error("busy"), { code: "EBUSY" });
    };
    const newer = recordReview(base(), { selected: [line("s1", "dev", "2026-11-02T18:40:00.000Z")], outcome: "accepted", run: RUN });
    expect(() => writeStamps(newer, file, { rename })).toThrow("busy");
    expect(calls).toBe(5);
    expect(readStamps(file)).toEqual(base());
    expect(readdirSync(path.dirname(file))).toEqual(["dream-stamps.json"]);
  });
});

describe("recordReview", () => {
  it("moves each pair to its own newest selected line, with the outcome", () => {
    const after = recordReview(base(), {
      selected: [
        line("s1", "feat/a", "2026-11-02T18:40:00.000Z"),
        line("s1", "feat/a", "2026-11-02T10:00:00.000Z"),
        line("s1", "dev", "2026-11-03T08:00:00.000Z"),
      ],
      outcome: "edited",
      run: RUN,
    });
    expect(after.sessions.s1).toEqual({
      transcript: "/projects/cuisko/s1.jsonl",
      branches: {
        "feat/a": { reviewedUntil: "2026-11-02T18:40:00.000Z", outcome: "edited" },
        dev: { reviewedUntil: "2026-11-03T08:00:00.000Z", outcome: "edited" },
      },
    });
    expect(after.lastRun).toEqual(RUN);
  });

  it("never moves a stamp back", () => {
    const first = recordReview(base(), { selected: [line("s1", "dev", "2026-11-05T00:00:00.000Z")], outcome: "accepted", run: RUN });
    const second = recordReview(first, { selected: [line("s1", "dev", "2026-11-04T00:00:00.000Z")], outcome: "ignored", run: RUN });
    expect(second.sessions.s1!.branches.dev!.reviewedUntil).toBe("2026-11-05T00:00:00.000Z");
  });

  it("creates an open-branch pair with null, and never replaces a value with null", () => {
    const first = recordReview(base(), { selected: [line("s1", "feat/b", "2026-11-05T00:00:00.000Z")], outcome: "accepted", run: RUN });
    const second = recordReview(first, {
      selected: [],
      onOpenBranches: [line("s1", "feat/b", "2026-11-06T00:00:00.000Z"), line("s2", "feat/c", "2026-11-06T00:00:00.000Z")],
      outcome: "nochange",
      run: RUN,
    });
    expect(second.sessions.s1!.branches["feat/b"]!.reviewedUntil).toBe("2026-11-05T00:00:00.000Z");
    expect(second.sessions.s2).toEqual({
      transcript: "/projects/cuisko/s2.jsonl",
      branches: { "feat/c": { reviewedUntil: null } },
    });
  });

  it("moves readsCountedUntil only when given", () => {
    const counted = recordReview(base(), { selected: [], outcome: "accepted", run: RUN, readsCountedUntil: "2026-11-08T01:32:00.000Z" });
    expect(counted.readsCountedUntil).toBe("2026-11-08T01:32:00.000Z");
    expect(recordReview(counted, { selected: [], outcome: "ignored", run: RUN }).readsCountedUntil).toBe(
      "2026-11-08T01:32:00.000Z",
    );
  });

  it("does not change the stamps it was given", () => {
    const stamps = base();
    recordReview(stamps, { selected: [line("s1", "dev", "2026-11-05T00:00:00.000Z")], outcome: "accepted", run: RUN });
    expect(stamps).toEqual(base());
  });
});

describe("pruneStamps", () => {
  it("drops a session whose transcript is gone, and keeps a fully read one that still exists", () => {
    const stamps = recordReview(base(), {
      selected: [line("kept", "dev", "2026-11-05T00:00:00.000Z"), line("gone", "dev", "2026-11-05T00:00:00.000Z")],
      outcome: "accepted",
      run: RUN,
    });
    const pruned = pruneStamps(stamps, (file) => file.endsWith("kept.jsonl"));
    expect(Object.keys(pruned.sessions)).toEqual(["kept"]);
  });
});

describe("location and lock", () => {
  const makeRepo = () => {
    const repo = tempDir();
    execFileSync("git", ["init", "-q"], { cwd: repo });
    return repo;
  };

  it("keeps the stamps in the git dir every worktree shares", () => {
    const repo = makeRepo();
    expect(stampsPath(repo)).toBe(path.join(repo, ".git", "dream-stamps.json"));
    const sub = path.join(repo, "src");
    mkdirSync(sub);
    expect(stampsPath(sub)).toBe(path.join(repo, ".git", "dream-stamps.json"));
  });

  it("creates fresh stamps that read back valid", () => {
    const file = tempFile();
    writeStamps(createStamps(new Date(INIT)), file);
    expect(readStamps(file)).toEqual(base());
  });

  it("refuses a second dream while the first holds the lock, and frees it on release", () => {
    const dir = tempDir();
    const release = acquireDreamLock(dir);
    expect(() => acquireDreamLock(dir)).toThrow(`a dream is already running (pid ${process.pid})`);
    release();
    expect(existsSync(path.join(dir, "dream.lock"))).toBe(false);
    acquireDreamLock(dir)();
  });

  it("takes over a lock left by a dead process", () => {
    const dir = tempDir();
    const deadPid = spawnSync(process.execPath, ["-e", ""]).pid!;
    writeFileSync(path.join(dir, "dream.lock"), String(deadPid));
    const release = acquireDreamLock(dir);
    expect(readFileSync(path.join(dir, "dream.lock"), "utf8")).toBe(String(process.pid));
    release();
  });
});
