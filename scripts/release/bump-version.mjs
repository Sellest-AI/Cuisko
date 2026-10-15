/**
 * Writes the next version into package.json and app.json, and prints it.
 *
 *   pnpm release            derived from the commits since the last `v*` tag
 *   pnpm release minor      forced: patch | minor | major
 *
 * It commits and tags nothing: the deploy workflow does that around a store build, and a human
 * running it locally decides when to commit. The two files must always carry the same version,
 * which is why neither is ever edited by hand.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { nextVersion } from "./_lib/nextVersion.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILES = ["package.json", "app.json"];

// stderr is piped rather than inherited, so the "No names found" of a first release reaches the
// catch below instead of the terminal.
const git = (...args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Full messages since the last release tag, or since the first commit when there is none. */
const _messagesSinceLastRelease = () => {
  let range = "HEAD";
  try {
    range = `${git("describe", "--tags", "--abbrev=0", "--match", "v*")}..HEAD`;
  } catch (error) {
    // `git describe` exits non-zero when no tag matches: the first release reads the whole history.
    if (!String(error.stderr ?? error.message).includes("No names found")) throw error;
  }
  return git("log", range, "--format=%B%x00")
    .split("\0")
    .map((message) => message.trim())
    .filter(Boolean);
};

const current = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const next = nextVersion(current, _messagesSinceLastRelease(), process.argv[2]);

for (const file of FILES) {
  const full = path.join(ROOT, file);
  const source = readFileSync(full, "utf8");
  // A text replace rather than a JSON round-trip, so the file keeps its formatting and only the
  // one line changes. The first `"version"` key is the app's in both files.
  const updated = source.replace(/"version":\s*"[^"]*"/, `"version": "${next}"`);
  if (updated === source) throw new Error(`${file} has no "version" field to bump`);
  writeFileSync(full, updated);
}

process.stdout.write(`${next}\n`);
