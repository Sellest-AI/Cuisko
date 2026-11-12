/**
 * usage/ (spec §4.4, §10.8): how often session agents read each memory topic. Versioned, so shared
 * between machines, and never encrypted: it holds only topic names, counts and dates, and the
 * topic names are folder names, public already.
 *
 * No file is shared by two dreams. Each dream writes a file of its own, `usage/<UTC date>-<id>.json`,
 * holding only what it saw: the session starts it read, and the topics read in them. A monthly
 * Action folds the files of each closed month into `usage/<YYYY-MM>.json` (`foldPlan`). Every
 * value the index needs is computed from all files by `totals`, with rules that give the same
 * result before and after a fold.
 *
 * A read is a tool call by a session agent naming a topic: its built file, one of its facts, its
 * folder, or the file it was before facts (`memories/<topic>.md`). Read, Grep, a `cat` in Bash, a
 * `Get-Content` in PowerShell, context-mode's ctx_execute_file. Every such call counts once per
 * topic it names. Only `user` and `assistant` lines reach this module (transcripts.mjs drops the
 * api-request-blob copies), so a call is never counted twice. Dream sessions run under
 * `<root>/.tmp/` and are dropped, like the selection drops them.
 *
 * What escapes the count, knowingly: a grep over the whole memory, and an agent acting on the
 * index line alone without opening the topic.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { randomId } from "./factNames.mjs";
import { isRepoCwd } from "./transcripts.mjs";

export const USAGE_DIR = "usage";

/** A dream's file: the UTC date it ran, and a random id. */
const DREAM_FILE = /^(\d{4}-\d{2})-\d{2}-([a-z0-9]{4})\.json$/;
/** A folded month. */
const MONTH_FILE = /^(\d{4}-\d{2})\.json$/;

/** Each reading tool, and the inputs that name what it reads. */
const READ_INPUTS = {
  Read: ["file_path"],
  Grep: ["path", "glob"],
  Bash: ["command"],
  PowerShell: ["command"],
  "mcp__plugin_context-mode_context-mode__ctx_execute_file": ["path"],
};

const usageSchema = z.strictObject({
  version: z.literal(2),
  sessions: z.array(z.iso.datetime({ offset: true })),
  reads: z.record(
    z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    z.strictObject({ count: z.int().positive(), last: z.iso.datetime({ offset: true }) }),
  ),
});

/** The month (`YYYY-MM`) a usage file belongs to, or null when the name is neither shape. */
const _monthOf = (name) => DREAM_FILE.exec(name)?.[1] ?? MONTH_FILE.exec(name)?.[1] ?? null;

const _parse = (name, text) => {
  if (_monthOf(name) === null) return { usage: null, error: `${name}: not "<YYYY-MM-DD>-<id>.json" nor "<YYYY-MM>.json"` };
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { usage: null, error: `${name}: not JSON (${error.message})` };
  }
  const parsed = usageSchema.safeParse(json);
  if (parsed.success) return { usage: parsed.data, error: null };
  return { usage: null, error: `${name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}` };
};

/**
 * Every entry of `<dir>/usage/`, sorted by name, with its `text`. A malformed one (a folder
 * included) comes back with `usage: null` and its `error`: C20 makes it a finding, the
 * session-start hook skips it and says so, `totals` ignores it. A missing folder is an empty one.
 */
export const readUsageFiles = (dir) => {
  const folder = path.join(dir, USAGE_DIR);
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((entry) => {
      if (!entry.isFile()) return { name: entry.name, text: "", usage: null, error: `${entry.name}: not a file` };
      const text = readFileSync(path.join(folder, entry.name), "utf8");
      return { name: entry.name, text, ..._parse(entry.name, text) };
    });
};

const _sortedKeys = (record) => Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));

/**
 * A usage file's text: sessions sorted and distinct, topics sorted, two-space indent. The same usage always gives the same bytes.
 * @public read by its tests through `import * as`, which knip cannot follow.
 */
export const formatUsage = (usage) => {
  const valid = usageSchema.parse(usage);
  const sessions = [...new Set(valid.sessions)].sort();
  return `${JSON.stringify({ version: 2, sessions, reads: _sortedKeys(valid.reads) }, null, 2)}\n`;
};

/**
 * A dream's usage file: its name (`<today>-<id>.json`, the id not in `taken`) and its text.
 * `today` is `YYYY-MM-DD`, UTC. `taken` holds the names already in `usage/`.
 */
export const newUsageFile = (usage, { today, taken }) => {
  for (;;) {
    const name = `${today}-${randomId()}.json`;
    if (!taken.has(name)) return { name, text: formatUsage(usage) };
  }
};

/**
 * What every usage file says, together, per topic of `topics` (topic → `{ created }`, the date of
 * its oldest fact). A topic no file names gets no reads; a topic not in `topics` (since deleted) is
 * ignored. Sessions are counted distinct, so a fold, which merges them, never changes a total.
 *
 *   reads              the sum of the topic's counts
 *   lastRead           the latest `last`, or null
 *   sessionsSinceRead  the distinct session starts after the last read, or after `created` when
 *                      the topic was never read
 */
export const totals = (usages, topics) => {
  const sessions = [...new Set(usages.flatMap((usage) => usage.sessions))].map((start) => Date.parse(start));
  const result = new Map();
  for (const [topic, { created }] of topics) {
    let reads = 0;
    let lastRead = null;
    for (const usage of usages) {
      const entry = Object.hasOwn(usage.reads, topic) ? usage.reads[topic] : undefined;
      if (entry === undefined) continue;
      reads += entry.count;
      if (lastRead === null || Date.parse(entry.last) > Date.parse(lastRead)) lastRead = entry.last;
    }
    const after = Date.parse(lastRead ?? created);
    result.set(topic, { reads, lastRead, sessionsSinceRead: sessions.filter((start) => start > after).length });
  }
  return result;
};

/** One usage made of several: sessions merged, counts summed, the latest `last` kept. Pure. */
const _merge = (usages) => {
  const reads = {};
  for (const usage of usages) {
    for (const [topic, { count, last }] of Object.entries(usage.reads)) {
      const entry = reads[topic];
      reads[topic] =
        entry === undefined ? { count, last } : { count: entry.count + count, last: Date.parse(last) > Date.parse(entry.last) ? last : entry.last };
    }
  }
  return { version: 2, sessions: [...new Set(usages.flatMap((usage) => usage.sessions))].sort(), reads: _sortedKeys(reads) };
};

/**
 * The months before `today`'s (`YYYY-MM-DD`) that still have a dream file to fold, oldest first.
 * @public read by its test through `import * as`, which knip cannot follow.
 */
export const closedMonths = (names, today) => {
  const current = today.slice(0, 7);
  return [...new Set(names.map((name) => DREAM_FILE.exec(name)?.[1]).filter((month) => month !== undefined && month < current))].sort();
};

/**
 * The fold of every closed month (spec: one file per month, by the monthly Action): for each, the
 * month file to write (its dream files and the month file already there, merged) and the dream
 * files to remove. Deterministic: the same files give the same bytes, whatever their order. A
 * malformed file is left where it is and named in `skipped`. Pure.
 */
export const foldPlan = (files, today) => {
  const write = [];
  const remove = [];
  const skipped = [];
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const month of closedMonths(sorted.map(({ name }) => name), today)) {
    const inMonth = sorted.filter(({ name }) => _monthOf(name) === month);
    const valid = inMonth.filter(({ usage }) => usage !== null);
    skipped.push(...inMonth.filter(({ usage }) => usage === null).map(({ name }) => name));
    write.push({ name: `${month}.json`, text: formatUsage(_merge(valid.map(({ usage }) => usage))) });
    remove.push(...valid.map(({ name }) => name).filter((name) => DREAM_FILE.test(name)));
  }
  return { write, remove, skipped };
};

/** The text a call reads from: its naming inputs, slashes forward, lowercase. Empty for any other tool. */
const _target = ({ name, input }) =>
  (READ_INPUTS[name] ?? [])
    .map((key) => input?.[key])
    .filter((value) => typeof value === "string")
    .join(" ")
    .replace(/\\+/g, "/")
    .toLowerCase();

const _BEFORE = /[\s/"'`=]/;
const _AFTER_FOLDER = /[\s/"'`]/;

/** True when `text` holds `needle` at a path boundary; `closed` needles end the path themselves. */
const _holds = (text, needle, closed) => {
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    if (at !== 0 && !_BEFORE.test(text[at - 1])) continue;
    const next = text[at + needle.length];
    if (closed || next === undefined || _AFTER_FOLDER.test(next)) return true;
  }
  return false;
};

/**
 * True when `text` names `topic`: its built file, one of its facts or its folder, or its file
 * before facts. `memories/git-hook` never matches `memories/git-hook-scripts/…`.
 */
const _namesTopic = (text, topic) =>
  _holds(text, `.built/${topic}.md`, true) || _holds(text, `memories/${topic}.md`, true) || _holds(text, `memories/${topic}`, false);

/**
 * Reads of each topic by session agents, between `since` (excluded) and `until` (included):
 * topic → `{ count, last }`. A topic nobody read is absent from the map.
 */
export const countReads = ({ lines, repoRoot, topics, since, until }) => {
  const from = Date.parse(since);
  const to = Date.parse(until);
  const counts = new Map();
  for (const line of lines) {
    if (line.role !== "assistant" || !isRepoCwd(line.cwd, repoRoot)) continue;
    const at = Date.parse(line.timestamp);
    if (at <= from || at > to) continue;
    for (const call of line.toolCalls) {
      const target = _target(call);
      if (target === "") continue;
      for (const topic of topics) {
        if (!_namesTopic(target, topic)) continue;
        const count = counts.get(topic);
        const last = new Date(at).toISOString();
        counts.set(topic, count === undefined ? { count: 1, last } : { count: count.count + 1, last: at > Date.parse(count.last) ? last : count.last });
      }
    }
  }
  return counts;
};

/**
 * When each session of this repo that started between `since` (excluded) and `until` (included)
 * started, as ISO times, oldest first. A session starts at its first line. Staleness is counted in
 * sessions, not days: a repo nobody works on for months ages none of its memories.
 */
export const sessionStarts = ({ lines, repoRoot, since, until }) => {
  const from = Date.parse(since);
  const to = Date.parse(until);
  const first = new Map();
  for (const line of lines) {
    if (!isRepoCwd(line.cwd, repoRoot)) continue;
    const at = Date.parse(line.timestamp);
    if (!first.has(line.sessionId) || at < first.get(line.sessionId)) first.set(line.sessionId, at);
  }
  return [...first.values()]
    .filter((at) => at > from && at <= to)
    .sort((a, b) => a - b)
    .map((at) => new Date(at).toISOString());
};

/** A dream's usage: the sessions it read and the reads counted in them. `counts` from countReads. */
export const dreamUsage = (counts, starts) => ({
  version: 2,
  sessions: [...starts],
  reads: Object.fromEntries([...counts.entries()].map(([topic, { count, last }]) => [topic, { count, last }])),
});
