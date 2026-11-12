/**
 * github:labels — makes the repository's labels match `.github/labels.json`.
 *
 *   pnpm github:labels            prints what would change, changes nothing
 *   pnpm github:labels --apply    makes the changes, as the sellest-agent App
 *
 * A removed label leaves every issue and PR that carried it. Run without `--apply` first.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { gitIn } from "../memory/_lib/git.mjs";
import { AppTokenError, repoOf } from "./_lib/appToken.mjs";
import { botToken } from "./_lib/botToken.mjs";
import { labelPlan } from "./_lib/labels.mjs";

const API = "https://api.github.com";

const _github = async (token, method, url, body) => {
  const response = await fetch(`${API}${url}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "cuisko-scripts",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${url}: GitHub answered ${response.status} (${(await response.text()).slice(0, 200)})`);
  return response.status === 204 ? null : response.json();
};

const _line = (sign, label) => `  ${sign} ${label.name.padEnd(18)} #${label.color}  ${label.description}`;

try {
  const apply = process.argv.includes("--apply");
  const root = gitIn(process.cwd(), "rev-parse", "--show-toplevel");
  const repo = repoOf(gitIn(root, "remote", "get-url", "origin"));
  if (repo === null) throw new AppTokenError("origin is not a GitHub repository");

  const wanted = JSON.parse(readFileSync(path.join(root, ".github", "labels.json"), "utf8"));
  const { token } = await botToken({ cwd: root });
  // 100 is GitHub's page maximum; the file declares fewer than half of that. A full page may hide
  // labels on the next one, and a plan built without them would create what exists: stop instead.
  const live = await _github(token, "GET", `/repos/${repo}/labels?per_page=100`);
  if (live.length === 100) throw new Error(`${repo} has 100 labels or more; this script reads one page only`);
  const plan = labelPlan(wanted, live);

  const changes = plan.create.length + plan.update.length + plan.remove.length;
  if (changes === 0) {
    console.log(`Labels of ${repo} already match .github/labels.json.`);
  } else {
    console.log(`Labels of ${repo}: ${apply ? "applying" : "would apply (run with --apply)"}`);
    for (const label of plan.create) console.log(_line("+", label));
    for (const label of plan.update) console.log(_line("~", label));
    for (const label of plan.remove) console.log(_line("-", label));
  }

  if (apply) {
    const at = (name) => `/repos/${repo}/labels/${encodeURIComponent(name)}`;
    for (const { name, color, description } of plan.create) await _github(token, "POST", `/repos/${repo}/labels`, { name, color, description });
    for (const { from, name, color, description } of plan.update) await _github(token, "PATCH", at(from), { new_name: name, color, description });
    for (const { name } of plan.remove) await _github(token, "DELETE", at(name));
    if (changes > 0) console.log(`Done: ${plan.create.length} created, ${plan.update.length} updated, ${plan.remove.length} removed.`);
  }
} catch (error) {
  console.error(`github:labels: ${String(error?.message ?? error)}`);
  process.exitCode = 1;
}
