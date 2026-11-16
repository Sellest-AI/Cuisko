/**
 * What the `issue` and `memory` checks of a pull request into `dev` decide
 * (.github/workflows/pull-request.yml). Pure: the CLIs check-issue.mjs and check-memory.mjs read
 * GitHub and git, and pass what they read here.
 *
 * - `issue`: the body names at least one issue, and every issue it names is still open.
 * - `memory`: the branch's newest commit is a dream's (`Memory-Update: yes`), and the branch holds
 *   no merge commit, so the memory was updated after the last code change, by `pr:push`.
 */

const DEPENDABOT = "dependabot[bot]";
/** The monthly fold PR: it names no issue, and its commit carries the trailer, so only `issue` skips it. */
const FOLD_BRANCH = "chore/memory-usage-fold";

/**
 * The issues the body closes, in order, each once: GitHub's closing keywords (`Fixes`, `closed`,
 * `RESOLVES`…) followed by `#N`. A bare `#N`, another repository's `owner/repo#N` or a URL is not
 * a link, and neither is anything inside an HTML comment (the template's hints) or in code, where
 * GitHub links nothing: a fenced block or a `code span`.
 *
 * @param {string} body
 * @returns {number[]}
 */
export const linkedIssues = (body) => {
  const visible = body
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/^(```|~~~)[\s\S]*?(?:^\1|$(?![\s\S]))/gm, "")
    .replace(/`[^`\n]*`/g, "");
  const numbers = [...visible.matchAll(/\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi)].map((match) => Number(match[1]));
  return [...new Set(numbers)];
};

/**
 * Whether a check passes without looking: Dependabot's PRs, this repository's `sync/…` branches
 * (§ Flow of the plan: main merged back into dev), and the fold PR for `issue`. The head repository
 * is compared, not only the branch name, so a fork's `sync/…` branch is checked like any other.
 *
 * @param {{ author: string, headRef: string, headRepo: string, baseRepo: string }} pr
 * @param {{ check: "issue" | "memory" }} options
 * @returns {boolean}
 */
export const isSkipped = ({ author, headRef, headRepo, baseRepo }, { check }) => {
  if (author === DEPENDABOT) return true;
  const ours = headRepo === baseRepo;
  if (ours && headRef.startsWith("sync/")) return true;
  return check === "issue" && ours && headRef === FOLD_BRANCH;
};

/**
 * Whether one named issue may be fixed by this PR. Anyone may open it: the owner decides which
 * issue an agent works on, so who wrote it is not this check's question.
 *
 * @param {{ number: number, state: string, pullRequest: boolean } | null} issue
 *   null when GitHub has no issue of that number; `pullRequest` when the number is a PR's
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export const issueVerdict = (issue) => {
  if (issue === null) return { ok: false, reason: "does not exist" };
  if (issue.pullRequest) return { ok: false, reason: "is a pull request, not an issue" };
  if (issue.state !== "open") return { ok: false, reason: `is ${issue.state}` };
  return { ok: true };
};

/**
 * Whether the message ends in a trailer block holding `Memory-Update: yes`. The trailer block is
 * the last paragraph, and never the subject: `chore: Memory-Update: yes` alone is no trailer.
 *
 * @param {string} message the full commit message
 * @returns {boolean}
 */
const _hasMemoryTrailer = (message) => {
  const paragraphs = message.replace(/\r\n/g, "\n").trim().split(/\n\s*\n/);
  if (paragraphs.length < 2) return false;
  return paragraphs.at(-1).split("\n").some((line) => /^Memory-Update:\s*yes\s*$/i.test(line.trim()));
};

/**
 * The workflow's variables, by name, each required: an empty one is the workflow's mistake, and a
 * check that ran on it would pass or fail for the wrong reason.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string[]} names
 * @returns {Record<string, string>}
 */
export const requiredEnv = (env, names) => {
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`the workflow passes no ${missing.join(", ")}`);
  return Object.fromEntries(names.map((name) => [name, env[name]]));
};

/**
 * The PR the workflow describes, from the variables both checks read.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ author: string, headRef: string, headRepo: string, baseRepo: string }}
 */
export const prFromEnv = (env) => {
  const { PR_AUTHOR, HEAD_REF, HEAD_REPO, BASE_REPO } = requiredEnv(env, ["PR_AUTHOR", "HEAD_REF", "HEAD_REPO", "BASE_REPO"]);
  return { author: PR_AUTHOR, headRef: HEAD_REF, headRepo: HEAD_REPO, baseRepo: BASE_REPO };
};

const _short = (sha) => sha.slice(0, 7);

/**
 * Whether the branch's memory was updated after its last code change.
 *
 * @param {{ sha: string, message: string, parents: string[] }[]} commits `base..head`, newest first
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export const memoryVerdict = (commits) => {
  if (commits.length === 0) return { ok: false, reason: "the branch has no commit of its own" };
  const merge = commits.find((commit) => commit.parents.length > 1);
  if (merge !== undefined) {
    return { ok: false, reason: `${_short(merge.sha)} is a merge commit: rebase the branch onto dev with pr:push` };
  }
  const [newest] = commits;
  if (!_hasMemoryTrailer(newest.message)) {
    return { ok: false, reason: `the newest commit, ${_short(newest.sha)}, is not a memory update: run pr:push, which runs the dream last` };
  }
  return { ok: true };
};
