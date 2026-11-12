/**
 * gh:bot — `gh` acting as the `sellest-agent` App. The only way a Claude session runs `gh`: a deny
 * rule refuses bare `gh`, which would use the owner's login.
 *
 *   pnpm gh:bot issue comment 12 --body-file .tmp/cause.md
 *
 * It gets an installation token (cached; see _lib/appToken.mjs), then runs `gh <the same
 * arguments>` with `GH_TOKEN` set and `GH_CONFIG_DIR` pointed at an empty folder under
 * `.tmp/github/`, so the owner's `gh` login is never read. gh's exit code is passed on.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { mainRoot } from "../memory/_lib/git.mjs";
import { AppTokenError } from "./_lib/appToken.mjs";
import { botToken } from "./_lib/botToken.mjs";

try {
  const { token } = await botToken();
  const configDir = path.join(mainRoot(), ".tmp", "github", "gh-config");
  mkdirSync(configDir, { recursive: true });

  const env = { ...process.env, GH_TOKEN: token, GH_CONFIG_DIR: configDir };
  delete env.GITHUB_TOKEN; // gh prefers GH_TOKEN, but a stray GITHUB_TOKEN must not be the fallback.
  const result = spawnSync("gh", process.argv.slice(2), { stdio: "inherit", env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof AppTokenError ? `gh:bot: ${error.message}` : `gh:bot failed: ${error.message}`);
  process.exitCode = 1;
}
