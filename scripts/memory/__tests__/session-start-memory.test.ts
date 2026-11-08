/**
 * The SessionStart memory hook (spec §5.1) is how a session knows the memory exists. Silent when
 * it should speak, and the memory is never used; speaking to a dream agent, and the dream reads an
 * index it was not meant to.
 *
 * The hook takes its root from its own location, so each case copies it, with the two modules it
 * imports, into a throwaway tree, and runs it with a hook input on stdin as Claude Code sends it.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/memoryIndex.mjs";

const { FIXED_HEADER } = lib as unknown as { FIXED_HEADER: string };

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const COPIED = [
  ".claude/hooks/session-start-memory.mjs",
  "scripts/memory/_lib/memoryIndex.mjs",
  "scripts/memory/_lib/transcripts.mjs",
  "scripts/memory/_lib/git.mjs",
];

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

/** A tree holding the hook and, unless `index` is null, `.claude/memory/index.md`. */
const makeTree = (index: string | null) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "memory-hook-"));
  created.push(root);
  for (const file of COPIED) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(REPO, file), path.join(root, file));
  }
  if (index !== null) {
    mkdirSync(path.join(root, ".claude", "memory"), { recursive: true });
    writeFileSync(path.join(root, ".claude", "memory", "index.md"), index);
  }
  return root;
};

const runHook = (root: string, cwd: string) => {
  const result = spawnSync(process.execPath, [path.join(root, ".claude", "hooks", "session-start-memory.mjs")], {
    input: JSON.stringify({ session_id: "s1", hook_event_name: "SessionStart", source: "startup", cwd }),
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout };
};

const INDEX = `${FIXED_HEADER}\n- [API authentication](memories/api-auth.md): Dates as timestamps.\n`;

describe("session-start-memory", () => {
  it("prints the index to a session in the repo", () => {
    const root = makeTree(INDEX);
    expect(runHook(root, path.join(root, "src"))).toEqual({ status: 0, stdout: INDEX });
  });

  it("prints the index written with CRLF line endings the same", () => {
    const root = makeTree(INDEX.replace(/\n/g, "\r\n"));
    expect(runHook(root, root).stdout).toBe(INDEX);
  });

  it("prints nothing to a dream agent", () => {
    const root = makeTree(INDEX);
    expect(runHook(root, path.join(root, ".tmp", "memory", "dream-20261108-1000"))).toEqual({ status: 0, stdout: "" });
  });

  it("asks for the setup when the index is still encrypted", () => {
    const root = makeTree("U2FsdGVkX1+abcdefghijklmnopqrstuvwxyz0123456789\n");
    expect(runHook(root, root).stdout).toBe("The agent memory is encrypted on this clone. Run: pnpm memory:setup\n");
  });

  it("prints nothing when the repo has no memory", () => {
    expect(runHook(makeTree(null), os.tmpdir())).toEqual({ status: 0, stdout: "" });
  });
});
