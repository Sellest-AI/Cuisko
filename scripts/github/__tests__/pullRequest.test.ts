/**
 * The `issue` and `memory` checks gate every PR into `dev`. A check that passes wrongly lets a
 * change in with no issue or a stale memory; one that fails wrongly blocks Dependabot, the sync PR
 * or the fold PR, which no agent can fix by a commit.
 */
import { describe, expect, it } from "vitest";

import * as lib from "../_lib/pullRequest.mjs";

type Verdict = { ok: true } | { ok: false; reason: string };
type Pr = { author: string; headRef: string; headRepo: string; baseRepo: string };
type Issue = { number: number; state: string; pullRequest: boolean };
type Commit = { sha: string; message: string; parents: string[] };
/** `pullRequest.mjs` is plain JavaScript; the contract is restated here so a drift stops compiling. */
const { linkedIssues, isSkipped, issueVerdict, memoryVerdict, prFromEnv } = lib as unknown as {
  prFromEnv: (env: Record<string, string | undefined>) => Pr;
  linkedIssues: (body: string) => number[];
  isSkipped: (pr: Pr, options: { check: "issue" | "memory" }) => boolean;
  issueVerdict: (issue: Issue | null) => Verdict;
  memoryVerdict: (commits: Commit[]) => Verdict;
};

/** The trailer rule, read through the one caller: a branch whose only commit has `message`. */
const hasMemoryTrailer = (message: string) => memoryVerdict([{ sha: "abc1234", message, parents: ["p"] }]).ok;

const REPO = "Sellest-AI/Cuisko";

describe("linkedIssues", () => {
  it("reads GitHub's closing keywords in any case", () => {
    expect(linkedIssues("Fixes #12")).toEqual([12]);
    expect(linkedIssues("closes #3")).toEqual([3]);
    expect(linkedIssues("RESOLVES #40")).toEqual([40]);
    expect(linkedIssues("Fixed: #7")).toEqual([7]);
  });

  it("reads several issues, each once, in order", () => {
    expect(linkedIssues("Fixes #12\nCloses #9\nAlso fixes #12")).toEqual([12, 9]);
  });

  it("ignores a bare number, another repository's issue and a URL", () => {
    expect(linkedIssues("See #12")).toEqual([]);
    expect(linkedIssues("Fixes other/repo#12")).toEqual([]);
    expect(linkedIssues("Fixes https://github.com/other/repo/issues/12")).toEqual([]);
  });

  it("ignores what an HTML comment holds, and the template's empty `Fixes #`", () => {
    expect(linkedIssues("Fixes #\n\n<!-- e.g. Fixes #12 -->")).toEqual([]);
  });

  it("ignores a keyword quoted in code, where GitHub links nothing", () => {
    expect(linkedIssues("Write `Fixes #12` in the body.")).toEqual([]);
    expect(linkedIssues("```\nFixes #12\n```\nFixes #9")).toEqual([9]);
  });
});

describe("isSkipped", () => {
  const pr = (headRef: string, extra: Partial<Pr> = {}): Pr => ({ author: "sellest-agent[bot]", headRef, headRepo: REPO, baseRepo: REPO, ...extra });

  it("skips Dependabot for both checks", () => {
    const dependabot = pr("dependabot/npm_and_yarn/expo-55.0.1", { author: "dependabot[bot]" });
    expect(isSkipped(dependabot, { check: "issue" })).toBe(true);
    expect(isSkipped(dependabot, { check: "memory" })).toBe(true);
  });

  it("skips this repository's sync/ branch for both checks", () => {
    expect(isSkipped(pr("sync/main-2026-11-12"), { check: "issue" })).toBe(true);
    expect(isSkipped(pr("sync/main-2026-11-12"), { check: "memory" })).toBe(true);
  });

  it("checks a fork's sync/ branch like any other", () => {
    expect(isSkipped(pr("sync/main-2026-11-12", { headRepo: "stranger/Cuisko" }), { check: "issue" })).toBe(false);
    expect(isSkipped(pr("sync/main-2026-11-12", { headRepo: "stranger/Cuisko" }), { check: "memory" })).toBe(false);
  });

  it("checks a PR whose head is main", () => {
    expect(isSkipped(pr("main"), { check: "issue" })).toBe(false);
  });

  it("skips the fold PR for issue only", () => {
    expect(isSkipped(pr("chore/memory-usage-fold"), { check: "issue" })).toBe(true);
    expect(isSkipped(pr("chore/memory-usage-fold"), { check: "memory" })).toBe(false);
  });

  it("checks an ordinary PR", () => {
    expect(isSkipped(pr("fix/12-eggs-counted-twice"), { check: "issue" })).toBe(false);
    expect(isSkipped(pr("fix/12-eggs-counted-twice"), { check: "memory" })).toBe(false);
  });
});

describe("issueVerdict", () => {
  const issue = (extra: Partial<Issue> = {}): Issue => ({ number: 12, state: "open", pullRequest: false, ...extra });

  it("accepts an open issue, whoever opened it", () => {
    expect(issueVerdict(issue())).toEqual({ ok: true });
  });

  it("refuses a closed issue, a missing one and a pull request", () => {
    expect(issueVerdict(issue({ state: "closed" }))).toEqual({ ok: false, reason: "is closed" });
    expect(issueVerdict(null)).toEqual({ ok: false, reason: "does not exist" });
    expect(issueVerdict(issue({ pullRequest: true })).ok).toBe(false);
  });
});

describe("memoryVerdict's trailer rule", () => {
  it("finds the trailer the dream and the fold write", () => {
    expect(hasMemoryTrailer("chore(memory): update after 1 session\n\n- adds usage/x.md\n\nMemory-Update: yes")).toBe(true);
    expect(hasMemoryTrailer("chore(memory): fold the usage of closed months\n\nMemory-Update: yes\n")).toBe(true);
  });

  it("ignores the words in the subject alone", () => {
    expect(hasMemoryTrailer("chore: Memory-Update: yes")).toBe(false);
  });

  it("ignores another trailer, and the words in the body above the last paragraph", () => {
    expect(hasMemoryTrailer("fix(planning): eggs\n\nFixes #12")).toBe(false);
    expect(hasMemoryTrailer("fix(planning): eggs\n\nMemory-Update: yes\n\nFixes #12")).toBe(false);
  });
});

describe("prFromEnv", () => {
  const env = { PR_AUTHOR: "sellest-agent[bot]", HEAD_REF: "fix/12-eggs", HEAD_REPO: REPO, BASE_REPO: REPO };

  it("reads the PR from the workflow's variables", () => {
    expect(prFromEnv(env)).toEqual({ author: "sellest-agent[bot]", headRef: "fix/12-eggs", headRepo: REPO, baseRepo: REPO });
  });

  it("names every variable the workflow left empty", () => {
    expect(() => prFromEnv({ ...env, HEAD_REPO: "", BASE_REPO: undefined })).toThrow("HEAD_REPO, BASE_REPO");
  });
});

describe("memoryVerdict", () => {
  const code = (sha: string): Commit => ({ sha, message: "fix(planning): eggs counted twice\n\nFixes #12", parents: ["p"] });
  const dream = (sha: string): Commit => ({ sha, message: "chore(memory): update after 1 session\n\nMemory-Update: yes", parents: ["p"] });

  it("accepts a branch whose newest commit is the dream's", () => {
    expect(memoryVerdict([dream("d1"), code("c1")])).toEqual({ ok: true });
  });

  it("refuses a code commit after the dream", () => {
    const verdict = memoryVerdict([code("c2abcdef"), dream("d1"), code("c1")]);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toContain("c2abcde");
  });

  it("refuses a merge commit anywhere on the branch", () => {
    const merge = { ...code("m1"), parents: ["a", "b"] };
    expect(memoryVerdict([dream("d1"), merge, code("c1")]).ok).toBe(false);
  });

  it("refuses a branch with no commit", () => {
    expect(memoryVerdict([]).ok).toBe(false);
  });
});
