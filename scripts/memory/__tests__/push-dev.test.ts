/**
 * push:dev runs the dream, then the push, on a clean `dev` only. Each case uses a throwaway repo
 * and a fake runner, so no dream starts and nothing is pushed.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { pushDev } from "../push-dev.mjs";

type Run = (command: string, args: string[], cwd: string) => number;

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" });

const repoOn = (branch: string) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "push-dev-"));
  created.push(dir);
  git(dir, "init", "-q", "-b", branch);
  writeFileSync(path.join(dir, "a.txt"), "a");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
};

const recorder = (statuses: Record<string, number> = {}) => {
  const calls: string[] = [];
  const run: Run = (command, args) => {
    const line = command === process.execPath ? "memory:update" : [command, ...args].join(" ");
    calls.push(line);
    return statuses[line] ?? 0;
  };
  return { calls, run };
};

describe("pushDev", () => {
  it("runs the dream, then pushes dev, on a clean dev", () => {
    const cwd = repoOn("dev");
    const { calls, run } = recorder();

    pushDev({ cwd, run });

    expect(calls).toEqual(["memory:update", "git push origin dev"]);
  });

  it("refuses on another branch and runs nothing", () => {
    const cwd = repoOn("feat/recipes");
    const { calls, run } = recorder();

    expect(() => pushDev({ cwd, run })).toThrow(/runs on dev, and this is feat\/recipes/);
    expect(calls).toEqual([]);
  });

  it("refuses an uncommitted change and runs nothing", () => {
    const cwd = repoOn("dev");
    writeFileSync(path.join(cwd, "a.txt"), "changed");
    const { calls, run } = recorder();

    expect(() => pushDev({ cwd, run })).toThrow(/uncommitted changes/);
    expect(calls).toEqual([]);
  });

  it("does not push when the dream fails", () => {
    const cwd = repoOn("dev");
    const { calls, run } = recorder({ "memory:update": 1 });

    expect(() => pushDev({ cwd, run })).toThrow(/nothing was pushed/);
    expect(calls).toEqual(["memory:update"]);
  });

  it("reports a push the remote or the pre-push hook refused", () => {
    const cwd = repoOn("dev");
    const { run } = recorder({ "git push origin dev": 1 });

    expect(() => pushDev({ cwd, run })).toThrow(/git push failed/);
  });

  it("refuses a detached HEAD and runs nothing", () => {
    const cwd = repoOn("dev");
    git(cwd, "checkout", "-q", "--detach");
    const { calls, run } = recorder();

    expect(() => pushDev({ cwd, run })).toThrow(/a detached HEAD/);
    expect(calls).toEqual([]);
  });
});
