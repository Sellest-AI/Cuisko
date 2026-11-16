/**
 * The SessionStart memory hook (spec §5.1) is how a session knows the memory exists, and the only
 * thing that builds `.claude/memory/.built/`. Silent when it should speak, and the memory is never
 * used; speaking to a dream agent, and the dream reads an index it was not meant to.
 *
 * The hook takes its root from its own location, so each case copies it and the memory scripts
 * into a throwaway tree, links the repo's node_modules there (the scripts import zod), and runs it
 * with a hook input on stdin as Claude Code sends it.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/memoryIndex.mjs";

const { FIXED_HEADER } = lib as unknown as { FIXED_HEADER: string };

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const COPIED = [".claude/hooks/session-start-memory.mjs", "scripts/memory/_lib"];

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

const FACT = (title: string, body: string) => `---\ntitle: ${title}\nstatus: stable\ncreated: 2026-11-02\nlast_verified: 2026-11-08\n---\n\n${body}\n`;
const ISO = FACT("Convex refuses ISO dates", "Convex refuses an ISO date string in a v.number() field. (source: 2026-11-02)");

/** A tree holding the hook and, unless `facts` is null, `.claude/memory/` with those facts and usage files. */
const makeTree = (facts: Record<string, string> | null, usage: Record<string, string> = {}) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "memory-hook-"));
  created.push(root);
  for (const file of COPIED) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(REPO, file), path.join(root, file), { recursive: true });
  }
  symlinkSync(path.join(REPO, "node_modules"), path.join(root, "node_modules"), "junction");
  if (facts !== null) {
    const memory = path.join(root, ".claude", "memory");
    mkdirSync(path.join(memory, "memories"), { recursive: true });
    for (const [name, text] of Object.entries(facts)) {
      mkdirSync(path.dirname(path.join(memory, "memories", name)), { recursive: true });
      writeFileSync(path.join(memory, "memories", name), text);
    }
    mkdirSync(path.join(memory, "usage"));
    for (const [name, text] of Object.entries(usage)) writeFileSync(path.join(memory, "usage", name), text);
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

const built = (root: string, name: string) => path.join(root, ".claude", "memory", ".built", name);

describe("session-start-memory", () => {
  it("builds the index and the topic files, and prints the index to a session in the repo", () => {
    const root = makeTree({ "convex-api/convex-refuses-iso-dates-k3x9.md": ISO });

    const { status, stdout } = runHook(root, path.join(root, "src"));

    expect(status).toBe(0);
    expect(stdout.startsWith(FIXED_HEADER)).toBe(true);
    expect(stdout).toContain("- [Convex api](.claude/memory/.built/convex-api.md): Convex refuses ISO dates");
    expect(readFileSync(built(root, "index.md"), "utf8")).toBe(stdout);
    expect(readFileSync(built(root, "convex-api.md"), "utf8")).toContain("Convex refuses an ISO date string");
  });

  it("reads fact files written with CRLF line endings", () => {
    const root = makeTree({ "convex-api/convex-refuses-iso-dates-k3x9.md": ISO.replace(/\n/g, "\r\n") });

    expect(runHook(root, root).stdout).toContain("Convex refuses ISO dates");
  });

  it("prints a skipped usage file after the index, and still builds", () => {
    const root = makeTree({ "convex-api/convex-refuses-iso-dates-k3x9.md": ISO }, { "2026-11-12-bad1.json": '{"version":1}' });

    const lines = runHook(root, root).stdout.trimEnd().split("\n");

    expect(lines.at(-1)).toMatch(/^Memory: usage file skipped: 2026-11-12-bad1\.json/);
    expect(existsSync(built(root, "convex-api.md"))).toBe(true);
  });

  it("prints nothing to a dream agent, and builds nothing", () => {
    const root = makeTree({ "convex-api/convex-refuses-iso-dates-k3x9.md": ISO });

    expect(runHook(root, path.join(root, ".tmp", "memory", "dream-20261108-1000"))).toEqual({ status: 0, stdout: "" });
    expect(existsSync(built(root, "index.md"))).toBe(false);
  });

  it("asks for the setup when the fact files are still encrypted, and builds nothing", () => {
    const root = makeTree({ "convex-api/convex-refuses-iso-dates-k3x9.md": "U2FsdGVkX1+abcdefghijklmnopqrstuvwxyz0123456789\n" });

    expect(runHook(root, root).stdout).toBe("The agent memory is encrypted on this clone. Run: pnpm memory:setup\n");
    expect(existsSync(built(root, "index.md"))).toBe(false);
  });

  it("prints nothing when the repo has no memory", () => {
    expect(runHook(makeTree(null), os.tmpdir())).toEqual({ status: 0, stdout: "" });
  });
});
