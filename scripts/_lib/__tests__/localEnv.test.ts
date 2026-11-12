/**
 * `.env.local` holds this machine's secrets and is never committed, so a worktree usually has none:
 * a key missed there means the memory looks unconfigured or the App looks absent in every worktree.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import * as lib from "../localEnv.mjs";

/** `localEnv.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { readLocalEnv } = lib as unknown as {
  readLocalEnv: (name: string, where: { root: string; mainRoot: string }) => string | null;
};

const dirs: string[] = [];
const dir = (content?: string) => {
  const made = mkdtempSync(path.join(os.tmpdir(), "local-env-"));
  dirs.push(made);
  if (content !== undefined) writeFileSync(path.join(made, ".env.local"), content);
  return made;
};

afterEach(() => {
  for (const made of dirs.splice(0)) rmSync(made, { recursive: true, force: true });
});

describe("readLocalEnv", () => {
  it("reads the variable from the checkout's own file", () => {
    const root = dir("OTHER=1\nMEMORY_KEY=abc123\n");
    expect(readLocalEnv("MEMORY_KEY", { root, mainRoot: root })).toBe("abc123");
  });

  it("falls back to the main checkout's file from a worktree that has none", () => {
    const main = dir("SELLEST_AGENT_APP_ID=42\n");
    expect(readLocalEnv("SELLEST_AGENT_APP_ID", { root: dir(), mainRoot: main })).toBe("42");
  });

  it("prefers the worktree's own value", () => {
    const main = dir("MEMORY_KEY=main\n");
    expect(readLocalEnv("MEMORY_KEY", { root: dir("MEMORY_KEY=worktree\n"), mainRoot: main })).toBe("worktree");
  });

  it("strips quotes, an `export` prefix and spaces around the value", () => {
    const root = dir('export MEMORY_KEY = "quoted value"\r\n');
    expect(readLocalEnv("MEMORY_KEY", { root, mainRoot: root })).toBe("quoted value");
  });

  it("returns null when the variable is absent or empty", () => {
    const root = dir("MEMORY_KEY=\nMEMORY_KEYS=nope\n");
    expect(readLocalEnv("MEMORY_KEY", { root, mainRoot: dir() })).toBeNull();
  });

  it("refuses a name that would act as a pattern", () => {
    const root = dir();
    expect(() => readLocalEnv("MEMORY.*", { root, mainRoot: root })).toThrow(/not a variable name/);
  });
});
