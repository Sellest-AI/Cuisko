/**
 * What the owner sees before choosing (spec §9.1 U7): the diff of the memory files, how the index
 * ranking moved, every alert the agents raised, and last, just above the prompt, a summary of each
 * changed file, since the owner scrolls to the bottom anyway. The reviewer fixes what it can prove, and the
 * diff already holds its fixes; the owner decides, so this text has to make both what it changed
 * and what it left open hard to miss.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** The link -> position of each topic the index lists, in index order. */
const _positions = (indexText) => {
  const listed = [...indexText.matchAll(/^- \[(.*)\]\(([^)\s]+)\): /gm)];
  return new Map(listed.map((match, at) => [match[2], { position: at + 1, title: match[1] }]));
};

/**
 * How the order of the index changed, as short lines: a topic that moved, appeared or left.
 * `before` and `after` are two rendered indexes (memoryIndex.mjs `renderTopicIndex`), never a built
 * file: the dream renders both at its own `now`.
 */
export const rankingChanges = (before, after, limit = 10) => {
  const was = _positions(before);
  const now = _positions(after);
  const lines = [];
  for (const [file, { position, title }] of now) {
    const old = was.get(file);
    if (old === undefined) lines.push(`new      ${position}  ${title}`);
    else if (old.position !== position) lines.push(`moved    ${old.position} → ${position}  ${title}`);
  }
  for (const [file, { position, title }] of was) {
    if (!now.has(file)) lines.push(`removed  ${position}  ${title}`);
  }
  return lines.length > limit ? [...lines.slice(0, limit), `… and ${lines.length - limit} more`] : lines;
};

/**
 * The diff from folder `a` to folder `b` (both `memories/` folders), plain text, run from `cwd` so
 * the paths read relative. `git diff --no-index` also shows files that are new on one side, which a
 * plain `git diff` of tracked files would not. Exit 1 means "they differ", not a failure.
 */
export const memoryDiff = ({ cwd, from, to, color = false }) => {
  // git treats a missing side as an empty file and says nothing: a wrong path would read as "no change".
  for (const side of [from, to]) {
    if (!existsSync(path.resolve(cwd, side))) throw new Error(`could not diff the memory: ${side} does not exist`);
  }
  // Colour only for the owner's terminal: the agents read the same diff in their prompts.
  const run = spawnSync("git", ["diff", "--no-index", color ? "--color=always" : "--no-color", "--", from, to], { cwd, encoding: "utf8" });
  if (run.error !== undefined || (run.status !== 0 && run.status !== 1)) {
    throw new Error(`could not diff the memory: ${run.error?.message ?? run.stderr}`);
  }
  return run.stdout;
};

/** A fact file's title, from its header. */
const _title = (text) => /^title:\s*(.+)$/m.exec(text)?.[1]?.trim();

/**
 * The longest note the summary prints. The agents are told it; a schema `max` would instead throw
 * away a whole dream for one wordy line, so the summary cuts what goes past it.
 */
export const NOTE_LENGTH = 300;

const _cut = (text) => (text.length <= NOTE_LENGTH ? text : `${text.slice(0, NOTE_LENGTH - 1).trimEnd()}…`);

const _plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

const _paint = (color, code, text) => (color ? `\u001b[${code}m${text}\u001b[0m` : text);

/**
 * The last thing the owner reads before choosing: one line per changed fact (a fact is a file),
 * and the reviewer's note, or the correction's note for a fact the owner corrected. A new fact
 * without a note shows its title. `files` holds `{ path, before?, after? }`: no `before` is new,
 * no `after` is deleted.
 */
export const formatSummary = ({ files, notes, flags, color = false }) => {
  const created = files.filter((file) => file.before === undefined);
  const deleted = files.filter((file) => file.after === undefined);
  const open = flags.filter((flag) => flag.fix === undefined).length;
  const fixed = flags.length - open;
  const header = [
    `${created.length} new, ${files.length - created.length - deleted.length} changed, ${deleted.length} deleted`,
    `${_plural(open, "flag")} left for you`,
    `${fixed} fixed by the reviewer`,
  ].join(" · ");
  const rows = files.flatMap((file) => {
    let mark;
    let change;
    if (file.before === undefined) {
      mark = _paint(color, 32, "+");
      change = "new";
    } else if (file.after === undefined) {
      mark = _paint(color, 31, "−");
      change = "deleted";
    } else {
      mark = _paint(color, 33, "~");
      change = "changed";
    }
    const note = notes.get(file.path) ?? (file.before === undefined ? _title(file.after) : undefined);
    return [`  ${mark} ${file.path}  ${change}`, ...(note === undefined ? [] : [`      ${_cut(note)}`])];
  });
  return [_paint(color, 1, `Summary: ${header}`), ...rows, ""].join("\n");
};

const _section = (title, rows) => (rows.length === 0 ? [] : [`${title}`, ...rows.map((row) => `  ${row}`), ""]);

/**
 * The alerts the owner reads next to the diff: what the reviewer flagged and left open, then what it
 * fixed (each worst first), what the writers raised, the docs the planner thinks are wrong, the
 * deletions it proposes, and the candidates it left out, with why.
 */
export const formatReport = ({ flags, alerts, docsIssues, deletions, dropped = [] }) => {
  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...flags].sort((a, b) => order[a.severity] - order[b.severity]);
  const line = (flag) => `[${flag.severity}] ${flag.path}: ${flag.problem} — "${flag.fact}" (evidence: ${flag.evidence})`;
  return [
    ..._section("Reviewer flags", sorted.filter((flag) => flag.fix === undefined).map(line)),
    ..._section("Fixed by the reviewer", sorted.filter((flag) => flag.fix !== undefined).map((flag) => `${line(flag)} → ${flag.fix}`)),
    ..._section("Writer alerts", alerts.map((alert) => `[${alert.kind}] ${alert.message}`)),
    ..._section("Docs that look wrong", docsIssues.map((issue) => `${issue.doc}: ${issue.issue}`)),
    ..._section("Deletions proposed", deletions.map((entry) => `${entry.path}: ${entry.reason ?? "no reason given"}`)),
    ..._section("Left out by the planner", dropped.map((entry) => `${entry.id}: ${entry.fact} — ${entry.reason}`)),
  ].join("\n");
};
