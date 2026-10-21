/**
 * Writes the version the next build should carry into package.json and app.json, and prints it.
 *
 *   pnpm release            derived from the commits since the last release
 *   pnpm release minor      forced: patch | minor | major
 *
 * Safe to run any number of times, on any branch: it counts from the highest `v*` tag in the repo,
 * not from the files, so a second run, or a run after the bump was committed, gives the same
 * answer (see `releaseVersion`). `pnpm build:dev` runs it before a dev build, so the build made for a
 * native change already carries the version that change will ship in.
 *
 * It commits and tags nothing: the deploy workflow does that around a store build, and a human
 * running it locally decides when to commit. The two files must always carry the same version,
 * which is why neither is ever edited by hand.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { releaseVersion } from "./_lib/nextVersion.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILES = ["package.json", "app.json"];

// stderr is piped rather than inherited, so git's own refusals reach the catches below instead of
// the terminal.
const git = (...args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/**
 * Every release tag the remote knows. A tag missing locally would let this branch reuse a version
 * someone else already released, so an unreachable remote stops the run rather than guessing.
 */
const _fetchTags = () => {
  try {
    git("fetch", "--tags", "--quiet", "origin");
  } catch (error) {
    throw new Error(`Could not fetch the release tags from origin, so the next version is unknown.\n${error.stderr ?? error.message}`);
  }
};

/** The highest `v*` version in the whole repo, or null before the first release. */
const _highestRelease = () => {
  const [tag] = git("tag", "--list", "v*", "--sort=-v:refname").split("\n").filter(Boolean);
  return tag ? tag.slice(1) : null;
};

/** Full messages since the nearest release in this branch's history, or the whole history. */
const _messagesSinceNearestRelease = () => {
  let range = "HEAD";
  try {
    range = `${git("describe", "--tags", "--abbrev=0", "--match", "v*")}..HEAD`;
  } catch (error) {
    // No tag at all ("No names found"), or none in this branch's history ("No tags can describe"):
    // the release reads the whole history.
    if (!/No names found|No tags can describe/.test(String(error.stderr ?? error.message))) throw error;
  }
  return git("log", range, "--format=%B%x00")
    .split("\0")
    .map((message) => message.trim())
    .filter(Boolean);
};

_fetchTags();
const next = releaseVersion({
  files: JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version,
  released: _highestRelease(),
  messages: _messagesSinceNearestRelease(),
  forced: process.argv[2],
});

for (const file of FILES) {
  const full = path.join(ROOT, file);
  const source = readFileSync(full, "utf8");
  // A text replace rather than a JSON round-trip, so the file keeps its formatting and only the
  // one line changes. The first `"version"` key is the app's in both files.
  const updated = source.replace(/"version":\s*"[^"]*"/, `"version": "${next}"`);
  if (!/"version":\s*"[^"]*"/.test(source)) throw new Error(`${file} has no "version" field to bump`);
  writeFileSync(full, updated);
}

process.stdout.write(`${next}\n`);
