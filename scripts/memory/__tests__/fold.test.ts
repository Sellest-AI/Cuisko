/**
 * The monthly fold of usage/. It runs unattended in an Action, so it must give the same bytes
 * whatever order it reads the files in, and it must never change a total the index ranks by.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../_lib/usage.mjs";

const FOLD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fold.mjs");

type Usage = { version: 2; sessions: string[]; reads: Record<string, { count: number; last: string }> };
type File = { name: string; usage: Usage | null; error: string | null };
type Totals = Map<string, { reads: number; lastRead: string | null; sessionsSinceRead: number }>;
const { closedMonths, foldPlan, formatUsage, totals } = lib as unknown as {
  closedMonths: (names: string[], today: string) => string[];
  foldPlan: (files: File[], today: string) => { write: { name: string; text: string }[]; remove: string[]; skipped: string[] };
  formatUsage: (usage: Usage) => string;
  totals: (usages: Usage[], topics: Map<string, { created: string }>) => Totals;
};

const usage = (sessions: string[], reads: Usage["reads"] = {}): Usage => ({ version: 2, sessions, reads });
const file = (name: string, value: Usage): File => ({ name, usage: value, error: null });

const OCT_A = file("2026-10-03-a1b2.json", usage(["2026-10-03T09:00:00.000Z"], { "api-auth": { count: 2, last: "2026-10-03T10:00:00.000Z" } }));
const OCT_B = file(
  "2026-10-20-c3d4.json",
  usage(["2026-10-20T09:00:00.000Z", "2026-10-03T09:00:00.000Z"], { "api-auth": { count: 1, last: "2026-10-20T10:00:00.000Z" }, tests: { count: 1, last: "2026-10-20T11:00:00.000Z" } }),
);
const NOV = file("2026-11-02-e5f6.json", usage(["2026-11-02T09:00:00.000Z"], { tests: { count: 1, last: "2026-11-02T10:00:00.000Z" } }));
const TOPICS = new Map([
  ["api-auth", { created: "2026-09-01" }],
  ["tests", { created: "2026-09-01" }],
]);

/** What the folder holds after a fold plan is applied. */
const _apply = (files: File[], plan: ReturnType<typeof foldPlan>): File[] => [
  ...files.filter(({ name }) => !plan.remove.includes(name) && !plan.write.some((written) => written.name === name)),
  ...plan.write.map(({ name, text }) => file(name, JSON.parse(text) as Usage)),
];

describe("closedMonths", () => {
  it("lists the months before today's that have a dream file, oldest first", () => {
    expect(closedMonths([NOV.name, OCT_B.name, "2026-09.json", OCT_A.name, "2026-08-30-x1y2.json"], "2026-11-14")).toEqual(["2026-08", "2026-10"]);
  });

  it("skips the current month", () => {
    expect(closedMonths([NOV.name], "2026-11-30")).toEqual([]);
  });
});

describe("foldPlan", () => {
  it("folds a closed month into one file and removes its dream files", () => {
    const plan = foldPlan([OCT_A, OCT_B, NOV], "2026-11-14");
    expect(plan.remove).toEqual([OCT_A.name, OCT_B.name]);
    expect(plan.write.map(({ name }) => name)).toEqual(["2026-10.json"]);
    expect(JSON.parse(plan.write[0]?.text ?? "")).toEqual({
      version: 2,
      sessions: ["2026-10-03T09:00:00.000Z", "2026-10-20T09:00:00.000Z"],
      reads: { "api-auth": { count: 3, last: "2026-10-20T10:00:00.000Z" }, tests: { count: 1, last: "2026-10-20T11:00:00.000Z" } },
    });
  });

  it("gives the same bytes whatever order the files come in", () => {
    expect(foldPlan([OCT_B, NOV, OCT_A], "2026-11-14")).toEqual(foldPlan([OCT_A, OCT_B, NOV], "2026-11-14"));
  });

  it("leaves every total unchanged", () => {
    const before = [OCT_A, OCT_B, NOV];
    const after = _apply(before, foldPlan(before, "2026-11-14"));
    const of = (files: File[]) => totals(files.map(({ usage: value }) => value as Usage), TOPICS);
    expect(of(after)).toEqual(of(before));
  });

  it("folds a late file into the month file already there", () => {
    const folded = _apply([OCT_A, OCT_B], foldPlan([OCT_A, OCT_B], "2026-11-14"));
    const late = file("2026-10-31-g7h8.json", usage(["2026-10-31T09:00:00.000Z"], { tests: { count: 2, last: "2026-10-31T10:00:00.000Z" } }));
    const plan = foldPlan([...folded, late], "2026-11-14");
    expect(plan.remove).toEqual([late.name]);
    expect(JSON.parse(plan.write[0]?.text ?? "").reads.tests).toEqual({ count: 3, last: "2026-10-31T10:00:00.000Z" });
    expect(JSON.parse(plan.write[0]?.text ?? "").sessions).toHaveLength(3);
  });

  it("leaves a malformed file in place and names it", () => {
    const broken: File = { name: "2026-10-05-z9z9.json", usage: null, error: "not JSON" };
    const plan = foldPlan([OCT_A, broken], "2026-11-14");
    expect(plan.remove).toEqual([OCT_A.name]);
    expect(plan.skipped).toEqual([broken.name]);
  });

  it("writes the month file in the format formatUsage gives", () => {
    const plan = foldPlan([OCT_A], "2026-11-14");
    expect(plan.write[0]?.text ?? "").toBe(formatUsage(OCT_A.usage as Usage));
  });
});

describe("memory:fold", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  /** A memory folder whose usage/ holds the given files. */
  const memoryWith = (files: Record<string, string>) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "memory-fold-"));
    dirs.push(dir);
    mkdirSync(path.join(dir, "usage"));
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, "usage", name), text);
    return dir;
  };
  const OCTOBER = { [OCT_A.name]: formatUsage(OCT_A.usage as Usage), [OCT_B.name]: formatUsage(OCT_B.usage as Usage), [NOV.name]: formatUsage(NOV.usage as Usage) };
  const fold = (dir: string, ...extra: string[]) => {
    const result = spawnSync(process.execPath, [FOLD, "--memory-dir", dir, "--today", "2026-11-14", ...extra], { encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  it("prints what the fold would change, and writes nothing without --write", () => {
    const dir = memoryWith(OCTOBER);

    const result = fold(dir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("write    usage/2026-10.json");
    expect(result.stdout).toContain(`remove   usage/${OCT_A.name}`);
    expect(result.stdout).toContain("Not written");
    expect(readdirSync(path.join(dir, "usage")).sort()).toEqual(Object.keys(OCTOBER).sort());
  });

  it("with --write, writes the month file the plan gives and removes the folded dream files", () => {
    const dir = memoryWith(OCTOBER);

    expect(fold(dir, "--write").status).toBe(0);

    expect(readdirSync(path.join(dir, "usage")).sort()).toEqual(["2026-10.json", NOV.name]);
    expect(readFileSync(path.join(dir, "usage", "2026-10.json"), "utf8")).toBe(foldPlan([OCT_A, OCT_B, NOV], "2026-11-14").write[0]?.text);
  });

  it("leaves a malformed file where it is and names it, and says when there is nothing to fold", () => {
    const dir = memoryWith({ "2026-10-05-bad1.json": '{"version":1}', [NOV.name]: formatUsage(NOV.usage as Usage) });

    const result = fold(dir, "--write");

    expect(result.stdout).toContain("skipped  usage/2026-10-05-bad1.json");
    expect(readdirSync(path.join(dir, "usage"))).toContain("2026-10-05-bad1.json");
    expect(fold(memoryWith({ [NOV.name]: formatUsage(NOV.usage as Usage) })).stdout).toContain("Nothing to fold");
  });

  it("refuses an unknown argument and a bad --today", () => {
    expect(fold(memoryWith({}), "--push").stderr).toContain("unknown argument --push");
    expect(spawnSync(process.execPath, [FOLD, "--today", "soon"], { encoding: "utf8" }).stderr).toContain("--today is not YYYY-MM-DD");
  });

  it("refuses a --today that has the shape of a date but no such day", () => {
    const result = spawnSync(process.execPath, [FOLD, "--today", "2026-13-01"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--today is not YYYY-MM-DD");
  });
});
