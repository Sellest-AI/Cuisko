/**
 * The `memory` check of a PR into dev (.github/workflows/pull-request.yml): the branch's newest
 * commit is a memory update, and the branch holds no merge commit.
 *
 * Reads BASE_SHA, HEAD_SHA, PR_AUTHOR, HEAD_REF, HEAD_REPO and BASE_REPO from the environment, and
 * the history from git: the job checks out with fetch-depth 0.
 */
import { gitIn } from "../memory/_lib/git.mjs";
import { isSkipped, memoryVerdict, prFromEnv, requiredEnv } from "./_lib/pullRequest.mjs";

/** Field and record separators no commit message holds. */
const FIELD = "\x1f";
const RECORD = "\x1e";

/** `base..head`, newest first, as `memoryVerdict` reads it. */
const _commits = (base, head) =>
  gitIn(process.cwd(), "log", `--format=%H${FIELD}%P${FIELD}%B${RECORD}`, `${base}..${head}`)
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, parents, message] = record.split(FIELD);
      return { sha, parents: parents.split(" ").filter(Boolean), message };
    });

try {
  const pr = prFromEnv(process.env);
  if (isSkipped(pr, { check: "memory" })) {
    console.log(`Skipped: ${pr.author} on ${pr.headRef} carries no memory update.`);
  } else {
    const { BASE_SHA, HEAD_SHA } = requiredEnv(process.env, ["BASE_SHA", "HEAD_SHA"]);
    const verdict = memoryVerdict(_commits(BASE_SHA, HEAD_SHA));
    if (verdict.ok) {
      console.log("The memory was updated after the branch's last change.");
    } else {
      console.log(`::error::${verdict.reason}.`);
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.log(`::error::check-memory: ${String(error?.message ?? error)}`);
  process.exitCode = 1;
}
