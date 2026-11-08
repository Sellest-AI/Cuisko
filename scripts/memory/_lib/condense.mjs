/**
 * A transcript in a form a model can read cheaply (spec §6.4), and the passages a writer is given
 * to check a fact against (spec §10.2, "Extraits").
 *
 * Kept: the owner's words and the agent's replies. Each tool call becomes one line (tool, and the
 * file or command it aimed at); its result is dropped, which is where most of a transcript's bytes
 * are. Dropped too: the `user` lines that are not the owner's words (hook output, command caveats,
 * compaction summaries). Every kept line carries its date, its id and its branch, so a candidate
 * can cite it. A `Memory:` line is marked as a priority.
 *
 * Personal data never reaches a model: every text is shortened (repo root → `<repo>`) and masked
 * (spec §11.1) before it is written down here. The dreamers cannot copy what they never saw.
 */
import { mask, shortenRoot } from "./pii.mjs";

/** A text longer than this is cut: a pasted log is not worth its tokens. */
const MAX_TEXT = 8000;
const MAX_TARGET = 160;
const PRIORITY = ">>> PRIORITY: ";

/**
 * The signal a session agent leaves to say something is worth keeping (spec §5.2). The line is
 * NFC-normalised (ADR 0011), stripped of leading Markdown, then matched. `\s` covers the no-break
 * spaces French typography puts before a colon.
 */
const SIGNAL = /^(Memory|Mémoire)\s*\**\s*:/u;
const _isSignal = (line) => SIGNAL.test(line.normalize("NFC").replace(/^[\s>*_-]+/, ""));

/** What a tool call aimed at, in one short line; its content (an Edit's text, a Write's body) is never kept. */
const _target = (input) => {
  const named = ["file_path", "command", "pattern", "path", "url", "query", "description"].find(
    (key) => typeof input?.[key] === "string" && input[key] !== "",
  );
  if (named === undefined) return Object.keys(input ?? {}).join(", ");
  const base = input[named].replace(/\s+/g, " ");
  const extra = named === "pattern" && typeof input.path === "string" ? ` in ${input.path}` : "";
  return `${base}${extra}`.slice(0, MAX_TARGET);
};

const _clean = (text, { identity, repoRoot }) => mask(shortenRoot(text, repoRoot), identity);

/** The kept entries of the lines, in order: text first, then one entry per tool call of the same line. */
const _entries = (lines, context) =>
  lines.flatMap((line) => {
    if (line.isToolResult || (line.role === "user" && line.isSynthetic)) return [];
    const base = { uuid: line.uuid, timestamp: line.timestamp, branch: line.branch };
    const text = line.text.trim();
    const spoken =
      text === ""
        ? []
        : [{ ...base, role: line.role, text: _clean(text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}… [cut]` : text, context) }];
    const calls = line.toolCalls.map((call) => ({
      ...base,
      role: "tool",
      text: _clean(`${call.name}: ${_target(call.input)}`, context),
    }));
    return [...spoken, ...calls];
  });

const _render = (entry, { cited = false } = {}) => {
  const marked = entry.text
    .split("\n")
    .map((row) => (entry.role !== "tool" && _isSignal(row) ? `${PRIORITY}${row}` : row))
    .join("\n");
  return `${cited ? "=> " : ""}[${entry.timestamp} ${entry.uuid} ${entry.branch}] ${entry.role}: ${marked}`;
};

/**
 * One session's lines as text for the extractor. `signaled` says a `Memory:` line is in it.
 * `lines` are all of one session; `context` is `{ identity, repoRoot }`.
 */
export const condense = (lines, context) => {
  const entries = _entries(lines, context);
  const text = entries.map((entry) => _render(entry)).join("\n");
  return {
    sessionId: lines[0]?.sessionId ?? "",
    text,
    signaled: text.includes(PRIORITY),
  };
};

/**
 * For each candidate, the passage around the line it cites: `contextLines` entries on each side,
 * the cited line marked `=>`. A writer checks the detail of a fact there, so the passage is cut
 * from the same masked entries the extractor read. `candidates` carry `{ id, source }` (spec §10.4).
 */
export const excerpts = ({ lines, candidates, context, contextLines = 3 }) => {
  const bySession = Map.groupBy(lines, (line) => line.sessionId);
  const entriesOf = new Map([...bySession].map(([sessionId, own]) => [sessionId, _entries(own, context)]));
  return candidates
    .map(({ id, source }) => {
      const entries = entriesOf.get(source.sessionId) ?? [];
      const first = entries.findIndex((entry) => entry.uuid === source.line);
      if (first === -1) return `### ${id}\n(the cited line ${source.line} is not in the conversations read)\n`;
      const last = entries.findLastIndex((entry) => entry.uuid === source.line);
      const passage = entries
        .slice(Math.max(0, first - contextLines), last + contextLines + 1)
        .map((entry) => _render(entry, { cited: entry.uuid === source.line }));
      return `### ${id}\n${passage.join("\n")}\n`;
    })
    .join("\n");
};
