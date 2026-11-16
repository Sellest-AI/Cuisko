/**
 * The App's token for the checkout `cwd` is in: the one entry point the CLIs share.
 *
 * It finds the checkout's root, the main checkout's root (where `.env.local` and the cache live
 * when `cwd` is a worktree), and the repository from `origin`, then asks `installationToken`.
 */
import { gitIn, mainRoot as findMainRoot } from "../../memory/_lib/git.mjs";
import { AppTokenError, installationToken, repoOf } from "./appToken.mjs";

/** @returns {Promise<{ token: string, expiresAt: Date }>} */
export const botToken = async ({ cwd = process.cwd(), now = new Date(), fetch: fetchImpl = fetch } = {}) => {
  const root = gitIn(cwd, "rev-parse", "--show-toplevel");
  const repo = repoOf(gitIn(cwd, "remote", "get-url", "origin"));
  if (repo === null) throw new AppTokenError("origin is not a GitHub repository");
  return installationToken({ root, mainRoot: findMainRoot(cwd), repo, now, fetch: fetchImpl });
};

/**
 * The SessionStart line when the App cannot act for this checkout, or null when a token comes back.
 * Never throws: a session must start whatever happens here.
 *
 * @returns {Promise<string | null>}
 */
export const identityLine = async ({ cwd, now = new Date(), fetch: fetchImpl = fetch }) => {
  try {
    await botToken({ cwd, now, fetch: fetchImpl });
    return null;
  } catch (error) {
    const reason = String(error?.message ?? error).split("\n")[0];
    return `GitHub App sellest-agent is not available (${reason}): push, comment and open no PR until it is fixed.`;
  }
};
