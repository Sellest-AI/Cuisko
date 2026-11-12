/**
 * issue:create — creates the issue of a draft, as the owner. Run by the `issues@sellest` mod's
 * Create issue button, or by the owner in a terminal; a deny rule refuses it from a session.
 *
 *   pnpm issue:create .tmp/issues/eggs-counted-twice.md
 *   pnpm issue:create --discard .tmp/issues/eggs-counted-twice.md    (deletes it, nothing created)
 *
 * 1. refuse a file outside `<checkout>/.tmp/issues/`, or one that is gone (already created or
 *    discarded: a second click creates nothing).
 * 2. parse the draft against `.github/labels.json` (see _lib/issueDraft.mjs).
 * 3. `gh api user` with the bot's env removed: refuse when it answers nothing or the bot's login.
 * 4. `gh issue create` with the draft's title, labels and body (on stdin); print the URL.
 * 5. delete the draft.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { gitIn } from "../memory/_lib/git.mjs";
import { BOT_LOGIN, DraftError, issueArgs, ownerEnv, parseDraft } from "./_lib/issueDraft.mjs";

const _defaultGh = (args, { cwd, input }) => {
  const result = spawnSync("gh", args, { cwd, input, encoding: "utf8", env: ownerEnv(process.env), stdio: ["pipe", "pipe", "pipe"] });
  if (result.error) return { status: 1, stdout: "", stderr: result.error.message };
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

/** Step 1: the draft's absolute path, or a refusal. */
const _draftPath = (top, file) => {
  if (file === undefined || file === "") throw new DraftError("issue:create takes the draft: pnpm issue:create .tmp/issues/<slug>.md");
  const drafts = path.join(top, ".tmp", "issues");
  const absolute = path.resolve(top, file);
  if (path.dirname(absolute) !== drafts || !absolute.endsWith(".md")) {
    throw new DraftError(`issue:create creates only a draft in .tmp/issues/, and ${file} is not one.`);
  }
  if (!existsSync(absolute)) throw new DraftError(`No draft at ${file}: it was already created or discarded.`);
  return absolute;
};

/** Step 3: the owner's login, or a refusal. */
const _ownerLogin = (gh, top) => {
  const user = gh(["api", "user", "--jq", ".login"], { cwd: top });
  const login = user.status === 0 ? user.stdout.trim() : "";
  if (login === "") throw new DraftError(`gh is not logged in as the owner, so nothing was created. Run gh auth login in a terminal.${user.stderr.trim() === "" ? "" : `\n${user.stderr.trim()}`}`);
  if (login === BOT_LOGIN) throw new DraftError(`gh answers as ${BOT_LOGIN}, not as the owner, so nothing was created. Run gh auth login in a terminal.`);
  return login;
};

/** Deletes the draft `file`, checked as createIssue checks it: the mod's Discard button. */
export const discardDraft = ({ file, cwd = process.cwd() }) => {
  rmSync(_draftPath(gitIn(cwd, "rev-parse", "--show-toplevel"), file));
};

/**
 * Creates the issue of the draft `file` (relative to the checkout `cwd` is in) and deletes the
 * draft. `gh(args, { cwd, input })` runs gh as the owner and returns `{ status, stdout, stderr }`:
 * a parameter, so a test needs no GitHub. Returns the issue's URL.
 */
export const createIssue = ({ file, cwd = process.cwd(), gh = _defaultGh }) => {
  const top = gitIn(cwd, "rev-parse", "--show-toplevel");
  const draftFile = _draftPath(top, file);
  const labels = JSON.parse(readFileSync(path.join(top, ".github", "labels.json"), "utf8"));
  const draft = parseDraft(readFileSync(draftFile, "utf8"), { labels });

  _ownerLogin(gh, top);
  const created = gh(issueArgs(draft), { cwd: top, input: draft.body });
  if (created.status !== 0) throw new DraftError(`gh issue create failed, so the draft is kept: ${created.stderr.trim()}`);

  rmSync(draftFile);
  return created.stdout.trim();
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [first, second] = process.argv.slice(2);
    if (first === "--discard") discardDraft({ file: second });
    else console.log(createIssue({ file: first }));
  } catch (error) {
    console.error(error instanceof DraftError ? error.message : `issue:create failed: ${error.message}`);
    process.exitCode = 1;
  }
}
