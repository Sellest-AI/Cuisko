/**
 * SessionStart — builds the agent memory and gives the session the head of its index (spec §5.1),
 * so a session knows what earlier sessions learned without opening a file. Runs on startup,
 * resume, clear and compact: after /clear or a compaction the context is empty again.
 *
 * The built memory (`.claude/memory/.built/`: the index and one file per topic) is not in git. It
 * is rebuilt here from the fact files and the usage files, each time, so a pull, a merge or a
 * dream is seen by the next session with nothing to run.
 *
 * Prints, as plain text the session receives:
 *   - the first 200 lines of the built index; past that, the last line says how many topics are
 *     left out and where they are
 *   - one line per warning of the build: a usage file skipped, a built file that could not be
 *     replaced
 *   - one line asking for `pnpm memory:setup` when the fact files are still encrypted (a clone
 *     where transcrypt is not set up); nothing is built then
 *   - nothing for a dream agent (its cwd is under .tmp/memory/: the dream gives it what it needs),
 *     nor when the repo has no memory yet
 *
 * The root is this file's own repo, not the session's cwd: a dream runs from a folder inside it.
 * Never fails the session: an error is one line of context, exit 0.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildMemory } from "../../scripts/memory/_lib/built.mjs";
import { headOfIndex } from "../../scripts/memory/_lib/memoryIndex.mjs";
import { isDreamCwd } from "../../scripts/memory/_lib/transcripts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MEMORY_DIR = path.join(ROOT, ".claude", "memory");

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
  if (isDreamCwd(_sessionCwd(), ROOT) || !existsSync(path.join(MEMORY_DIR, "memories"))) return "";
  const { encrypted, index, warnings } = buildMemory(MEMORY_DIR, { now: new Date() });
  if (encrypted) return "The agent memory is encrypted on this clone. Run: pnpm memory:setup\n";
  return headOfIndex(index) + warnings.map((warning) => `Memory: ${warning}\n`).join("");
};

try {
  process.stdout.write(_context());
} catch (error) {
  process.stdout.write(`The agent memory could not be built: ${error.message}\n`);
}
