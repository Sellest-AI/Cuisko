/**
 * The `issue` check of a PR into dev (.github/workflows/pull-request.yml): the body names at least
 * one issue with `Fixes #N`, and every issue it names is open and was opened by the owner's side.
 *
 * Reads PR_BODY, PR_AUTHOR, HEAD_REF, HEAD_REPO, BASE_REPO and GH_TOKEN from the environment.
 */
import { GitHubApiError, githubRequest } from "./_lib/githubApi.mjs";
import { isSkipped, issueVerdict, linkedIssues, prFromEnv, requiredEnv } from "./_lib/pullRequest.mjs";

/** The issue as `issueVerdict` reads it, or null when GitHub has none of that number. */
const _issue = async (repo, number, token) => {
  try {
    const issue = await githubRequest(`/repos/${repo}/issues/${number}`, { token, what: `reading #${number}` });
    return { number, state: issue.state, authorAssociation: issue.author_association, pullRequest: issue.pull_request !== undefined };
  } catch (error) {
    if (error instanceof GitHubApiError && (error.status === 404 || error.status === 410)) return null;
    throw error;
  }
};

try {
  const pr = prFromEnv(process.env);
  if (isSkipped(pr, { check: "issue" })) {
    console.log(`Skipped: ${pr.author} on ${pr.headRef} needs no issue.`);
  } else {
    const { GH_TOKEN } = requiredEnv(process.env, ["GH_TOKEN"]);
    const numbers = linkedIssues(process.env.PR_BODY ?? "");
    if (numbers.length === 0) {
      console.log("::error::The PR body names no issue. Add a line `Fixes #N` for the issue it fixes.");
      process.exitCode = 1;
    }
    for (const number of numbers) {
      const verdict = issueVerdict(await _issue(pr.baseRepo, number, GH_TOKEN));
      if (verdict.ok) {
        console.log(`#${number}: open, opened by the project.`);
      } else {
        console.log(`::error::#${number} ${verdict.reason}.`);
        process.exitCode = 1;
      }
    }
  }
} catch (error) {
  console.log(`::error::check-issue: ${String(error?.message ?? error)}`);
  process.exitCode = 1;
}
