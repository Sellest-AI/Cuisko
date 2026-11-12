/**
 * issue:create turns the owner's click into an issue. Wrong, it creates the issue as the bot,
 * creates it twice, loses the draft when GitHub refused it, or creates from a file it was not
 * meant to read.
 *
 * Each case uses a throwaway repo holding the real labels file and a draft; gh is a stub that
 * records its calls.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import * as lib from "../create-issue.mjs";

type GhResult = { status: number; stdout: string; stderr: string };
type Gh = (args: string[], options: { cwd: string; input?: string }) => GhResult;
/** `create-issue.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { createIssue, discardDraft } = lib as unknown as {
  createIssue: (options: { file?: string; cwd: string; gh: Gh }) => string;
  discardDraft: (options: { file: string; cwd: string }) => void;
};

const LABELS = path.join(import.meta.dirname, "..", "..", "..", ".github", "labels.json");
const DRAFT = ".tmp/issues/eggs-counted-twice.md";
const BODY = "### What happened\nThe week plan lists 4 eggs to buy; 2 are owned.\n";
const URL = "https://github.com/Sellest-AI/Cuisko/issues/12";

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

const makeRepo = (draft = `---\ntitle: Eggs counted twice\ntype: bug\nareas: [planning]\n---\n${BODY}`) => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "create-issue-"));
  created.push(repo);
  execFileSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(path.join(repo, ".github"));
  copyFileSync(LABELS, path.join(repo, ".github", "labels.json"));
  mkdirSync(path.join(repo, ".tmp", "issues"), { recursive: true });
  writeFileSync(path.join(repo, DRAFT), draft);
  return repo;
};

/** gh as `login`; `issue create` answers `create`. Every call is recorded. */
const stubGh = ({ login = "franckdsf", create = { status: 0, stdout: `${URL}\n`, stderr: "" } }: { login?: string | null; create?: GhResult } = {}) => {
  const calls: { args: string[]; input?: string }[] = [];
  const gh: Gh = (args, { input }) => {
    calls.push({ args, input });
    if (args[0] === "api") return login === null ? { status: 1, stdout: "", stderr: "You are not logged into any GitHub hosts." } : { status: 0, stdout: `${login}\n`, stderr: "" };
    return create;
  };
  return { gh, calls };
};

describe("issue:create", () => {
  it("creates the issue with the draft's title, labels and body on stdin, then deletes the draft", () => {
    const repo = makeRepo();
    const { gh, calls } = stubGh();
    expect(createIssue({ file: DRAFT, cwd: repo, gh })).toBe(URL);
    const create = calls.find((call) => call.args[0] === "issue");
    expect(create?.args).toEqual(["issue", "create", "--title", "Eggs counted twice", "--body-file", "-", "--label", "bug", "--label", "planning"]);
    expect(create?.input).toBe(BODY);
    expect(existsSync(path.join(repo, DRAFT))).toBe(false);
  });

  it("creates nothing on a second click: the draft is gone", () => {
    const repo = makeRepo();
    createIssue({ file: DRAFT, cwd: repo, gh: stubGh().gh });
    const { gh, calls } = stubGh();
    expect(() => createIssue({ file: DRAFT, cwd: repo, gh })).toThrow(/already created or discarded/);
    expect(calls).toEqual([]);
  });

  it("refuses when gh is not logged in, or answers as the bot, and keeps the draft", () => {
    const repo = makeRepo();
    for (const login of [null, "sellest-agent[bot]"]) {
      const { gh, calls } = stubGh({ login });
      expect(() => createIssue({ file: DRAFT, cwd: repo, gh })).toThrow(/not .*the owner|not logged in as the owner/);
      expect(calls.some((call) => call.args[0] === "issue")).toBe(false);
    }
    expect(existsSync(path.join(repo, DRAFT))).toBe(true);
  });

  it("keeps the draft when gh issue create fails", () => {
    const repo = makeRepo();
    const { gh } = stubGh({ create: { status: 1, stdout: "", stderr: "could not add label: 'planning' not found" } });
    expect(() => createIssue({ file: DRAFT, cwd: repo, gh })).toThrow(/draft is kept: could not add label/);
    expect(existsSync(path.join(repo, DRAFT))).toBe(true);
  });

  it("refuses a draft with no area before asking gh anything", () => {
    const repo = makeRepo(`---\ntitle: Eggs counted twice\ntype: bug\n---\n${BODY}`);
    const { gh, calls } = stubGh();
    expect(() => createIssue({ file: DRAFT, cwd: repo, gh })).toThrow(/no area/);
    expect(calls).toEqual([]);
  });

  it("discards a draft, and only a draft", () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, "notes.md"), BODY);
    expect(() => discardDraft({ file: "notes.md", cwd: repo })).toThrow(/only a draft/);
    expect(existsSync(path.join(repo, "notes.md"))).toBe(true);
    discardDraft({ file: DRAFT, cwd: repo });
    expect(existsSync(path.join(repo, DRAFT))).toBe(false);
  });

  it("refuses a file outside .tmp/issues/, and no file at all", () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, "notes.md"), `---\ntitle: Eggs\ntype: bug\nareas: [planning]\n---\n${BODY}`);
    const { gh, calls } = stubGh();
    expect(() => createIssue({ file: "notes.md", cwd: repo, gh })).toThrow(/only a draft in \.tmp\/issues\//);
    expect(() => createIssue({ file: ".tmp/issues/../../notes.md", cwd: repo, gh })).toThrow(/only a draft/);
    expect(() => createIssue({ cwd: repo, gh })).toThrow(/takes the draft/);
    expect(calls).toEqual([]);
  });
});
