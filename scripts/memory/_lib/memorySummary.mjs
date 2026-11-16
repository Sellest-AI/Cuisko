/**
 * The `## Memory` section of a pull request: the facts the PR adds, changes and drops, by topic,
 * named by their titles. `pr:push` fills it, so the owner sees what the memory learns before the
 * PR reaches `dev`, without decrypting the diff.
 *
 * The blobs in git are transcrypt ciphertext. `git cat-file --filters` runs the smudge filter on
 * them, so a title is read in clear wherever the clone has the key: the head's blob for an added or
 * changed fact, the base's for a dropped one. A `usage/` file is not a fact and is left out.
 */
import { factTitle, MEMORIES_PATH, topicOf } from "./memoryFiles.mjs";
import { gitIn } from "./git.mjs";

const KINDS = [
  ["A", "added"],
  ["M", "changed"],
  ["D", "dropped"],
];

/** The title of the fact at `<rev>:<file>`, its file name when the header has none. */
const _titleAt = (top, rev, file) => factTitle(gitIn(top, "cat-file", "--filters", `${rev}:${file}`)) ?? file.slice(file.lastIndexOf("/") + 1);

/**
 * Markdown: a bold line per topic, then one `- added|changed|dropped: <title>` line per fact, for
 * `base...head` (from their merge base, as GitHub shows a PR). "No fact changed." when none did.
 *
 * @param {{ top: string, base: string, head: string }} options
 * @returns {string}
 */
export const memorySummary = ({ top, base, head }) => {
  const changes = gitIn(top, "diff", "--name-status", "--no-renames", `${base}...${head}`, "--", MEMORIES_PATH)
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [status, file] = line.split("\t");
      return { status, file };
    });
  const byTopic = new Map();
  for (const [status, kind] of KINDS) {
    for (const change of changes.filter((entry) => entry.status === status)) {
      const topic = topicOf(change.file) ?? "(no topic)";
      const title = _titleAt(top, status === "D" ? base : head, change.file);
      if (!byTopic.has(topic)) byTopic.set(topic, []);
      byTopic.get(topic).push(`- ${kind}: ${title}`);
    }
  }
  if (byTopic.size === 0) return "No fact changed.";
  return [...byTopic.keys()]
    .sort()
    .map((topic) => `**${topic}**\n${byTopic.get(topic).join("\n")}`)
    .join("\n\n");
};
