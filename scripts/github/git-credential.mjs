/**
 * git's credential helper for Claude sessions: answers every github.com request with the
 * `sellest-agent` App's installation token, so a push from a session is the App's, never the
 * owner's.
 *
 * Wired by the `env` block of .claude/settings.json (GIT_CONFIG_*), for sessions only: an empty
 * helper first, which drops the helpers configured before it (Git Credential Manager among them),
 * then this one. The owner's own terminal keeps their credentials.
 *
 *   git credential-<this> get     reads the request on stdin, prints username and password
 *   git credential-<this> store   ignored: the token is cached by appToken itself
 *   git credential-<this> erase   ignored, for the same reason
 *
 * A failure prints its reason on stderr and nothing on stdout: git then reports the push as
 * refused, with that reason above it.
 */
import { readFileSync } from "node:fs";

import { botToken } from "./_lib/botToken.mjs";

/** The `key=value` lines git sends on stdin, as an object. */
const _request = (text) =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );

const operation = process.argv[2];
if (operation === "get") {
  const request = _request(readFileSync(0, "utf8"));
  if (request.host === "github.com") {
    try {
      const { token } = await botToken();
      process.stdout.write(`username=x-access-token\npassword=${token}\n`);
    } catch (error) {
      process.stderr.write(`sellest-agent credential helper: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
