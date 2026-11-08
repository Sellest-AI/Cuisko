/**
 * index.md (spec §4.3, §10.8): the catalogue of the memory, one line per file, most useful first.
 * Generated whole by memory:update; no agent writes it. A session sees its first 200 lines at
 * start, so the order decides which memories a session knows about without opening anything.
 *
 * Order:
 *   1. grace: a file created less than GRACE_DAYS ago comes first, newest first. Without it a new
 *      file, with no reads, would sit at the bottom, never shown, so never read
 *   2. the rest by score: reads × 0.5^(days since last read / HALF_LIFE_DAYS); never read is 0
 *   3. a tie goes by title, then by path, so the same input always gives the same bytes
 *
 * The fixed header is descriptive only: it never tells a session how the memory is written, which
 * would invite it to try.
 */

export const GRACE_DAYS = 30;
export const HALF_LIFE_DAYS = 30;

const DAY_MS = 86_400_000;

/** The header every index starts with, up to the list heading. A header-only index is exactly this. */
export const FIXED_HEADER = `# Cuisko project memory

This file lists what agents have learned about this project that is found neither in the code nor in docs/.
When a topic in the list concerns your task, read the linked file before acting.
index.md and the files in this folder are updated automatically. Do not edit them.

<!-- end of fixed header -->

## Memories
`;

const _days = (from, now) => (now.getTime() - Date.parse(from)) / DAY_MS;

/** The decayed read count of one usage entry at `now`. */
export const score = (entry, now) =>
  entry.lastRead === null ? 0 : entry.reads * 0.5 ** (Math.max(0, _days(entry.lastRead, now)) / HALF_LIFE_DAYS);

const _inGrace = (entry, now) => _days(entry.created, now) < GRACE_DAYS;

/** One line of text: a title or summary written over several lines would break the list. */
const _oneLine = (text) => text.replace(/\s+/g, " ").trim();

const _byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The whole index.md. `files` are `{ path: "memories/<name>.md", title, summary }`; a file
 * missing from `usage` counts as created today, so it sits in grace.
 */
export const renderIndex = ({ files, usage, now }) => {
  const today = now.toISOString().slice(0, 10);
  const ranked = files
    .map((file) => {
      const entry = Object.hasOwn(usage.files, file.path) ? usage.files[file.path] : { created: today, reads: 0, lastRead: null };
      return { ...file, entry, grace: _inGrace(entry, now), score: score(entry, now) };
    })
    .sort((a, b) => {
      if (a.grace !== b.grace) return a.grace ? -1 : 1;
      const order = a.grace ? _byText(b.entry.created, a.entry.created) : b.score - a.score;
      return order || _byText(a.title, b.title) || _byText(a.path, b.path);
    });
  if (ranked.length === 0) return FIXED_HEADER;
  const lines = ranked.map(({ path, title, summary }) => `- [${_oneLine(title)}](${path}): ${_oneLine(summary)}`);
  return `${FIXED_HEADER}\n${lines.join("\n")}\n`;
};

/** How many lines of the index a session gets at start (spec §5.1). */
export const SESSION_LINES = 200;

/**
 * The part of the index a session sees at start: all of it up to `maxLines` lines. Past that,
 * the last line shown becomes a pointer to the rest, with the count of memories left out. The
 * best-ranked memories come first, so they are the ones shown.
 */
export const headOfIndex = (text, maxLines = SESSION_LINES) => {
  const lines = text.replace(/\n$/, "").split("\n");
  if (lines.length <= maxLines) return `${lines.join("\n")}\n`;
  const shown = lines.slice(0, maxLines - 1);
  const hidden = lines.slice(maxLines - 1).filter((line) => line.startsWith("- [")).length;
  const noun = hidden === 1 ? "memory, less used, is" : "memories, less used, are";
  return `${[...shown, `… ${hidden} more ${noun} listed in .claude/memory/index.md.`].join("\n")}\n`;
};
