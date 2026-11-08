/**
 * SessionStart — the head of the agent memory's index (spec §5.1), so a session knows what earlier
 * sessions learned without opening a file. Runs on startup, resume, clear and compact: after
 * /clear or a compaction the context is empty again.
 *
 * Prints, as plain text the session receives:
 *   - the first 200 lines of .claude/memory/index.md; past that, the last line says how many
 *     memories are left out and where they are
 *   - one line asking for `pnpm memory:setup` when the index is still encrypted (a clone where
 *     transcrypt is not set up: the file does not open with the index title)
 *   - nothing for a dream agent (its cwd is under .tmp/memory/: the dream gives it what it needs),
 *     nor when the repo has no memory yet
 *
 * The root is this file's own repo, not the session's cwd: a dream runs from a folder inside it.
 * Never fails the session: an error is one line of context, exit 0.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FIXED_HEADER, headOfIndex } from "../../scripts/memory/_lib/memoryIndex.mjs";
import { isDreamCwd } from "../../scripts/memory/_lib/transcripts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX = path.join(ROOT, ".claude", "memory", "index.md");
const TITLE = FIXED_HEADER.split("\n")[0];

/** The session's cwd, from the hook input on stdin; this process's own when the input is unreadable. */
const _sessionCwd = () => {
  try {
    const cwd = JSON.parse(readFileSync(0, "utf8")).cwd;
    return typeof cwd === "string" && cwd !== "" ? cwd : process.cwd();
  } catch {
    return process.cwd(); // Run by hand, with no input: treated as a normal session.
  }
};

const _context = () => {
  if (isDreamCwd(_sessionCwd(), ROOT) || !existsSync(INDEX)) return "";
  const text = readFileSync(INDEX, "utf8").replace(/\r\n/g, "\n");
  if (text.split("\n")[0] !== TITLE) return "The agent memory is encrypted on this clone. Run: pnpm memory:setup\n";
  return headOfIndex(text);
};

try {
  process.stdout.write(_context());
} catch (error) {
  process.stdout.write(`The agent memory index could not be read: ${error.message}\n`);
}
