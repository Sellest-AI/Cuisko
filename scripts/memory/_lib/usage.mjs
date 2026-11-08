/**
 * usage.json (spec §4.4, §10.8): how often session agents read each memory file. Versioned, so
 * shared between machines, and written only by memory:update. The index is ranked from it.
 *
 * A read is a tool call by a session agent naming a memory file: Read, Grep, a `cat` in Bash, a
 * `Get-Content` in PowerShell, context-mode's ctx_execute_file. Every such call counts once per
 * file it names. Only `user` and `assistant` lines reach this module (transcripts.mjs drops the
 * api-request-blob copies), so a call is never counted twice. Dream sessions run under
 * `<root>/.tmp/` and are dropped, like the selection drops them.
 *
 * What escapes the count, knowingly: a grep over the whole folder, and an agent acting on the
 * index line alone without opening the file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { isRepoCwd } from "./transcripts.mjs";

const USAGE_FILE = "usage.json";

/** Each reading tool, and the inputs that name what it reads. */
const READ_INPUTS = {
  Read: ["file_path"],
  Grep: ["path", "glob"],
  Bash: ["command"],
  PowerShell: ["command"],
  "mcp__plugin_context-mode_context-mode__ctx_execute_file": ["path"],
};

const usageSchema = z.strictObject({
  version: z.literal(1),
  files: z.record(
    z.string().regex(/^memories\/.+\.md$/),
    z.strictObject({
      created: z.iso.date(),
      reads: z.int().nonnegative(),
      lastRead: z.iso.datetime({ offset: true }).nullable(),
    }),
  ),
});

const _validate = (usage, file) => {
  const parsed = usageSchema.safeParse(usage);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  throw new Error(`${file} is invalid: ${problems.join("; ")}`);
};

/** The validated usage of a memory folder. Throws when it is missing or invalid. */
export const readUsage = (dir) => {
  const file = path.join(dir, USAGE_FILE);
  return _validate(JSON.parse(readFileSync(file, "utf8")), file);
};

/** Validates, then writes with sorted keys and two-space indent, so the diff shows only what changed. */
export const writeUsage = (dir, usage) => {
  const file = path.join(dir, USAGE_FILE);
  const valid = _validate(usage, file);
  const files = Object.fromEntries(Object.keys(valid.files).sort().map((key) => [key, valid.files[key]]));
  writeFileSync(file, `${JSON.stringify({ version: valid.version, files }, null, 2)}\n`);
};

/** The text a call reads from: its naming inputs, slashes forward. Empty for any other tool. */
const _target = ({ name, input }) =>
  (READ_INPUTS[name] ?? [])
    .map((key) => input?.[key])
    .filter((value) => typeof value === "string")
    .join(" ")
    .replace(/\\+/g, "/");

/** True when `text` names `file` (`memories/x.md`) as a path, not as the tail of a longer name. */
const _names = (text, file) => {
  const haystack = text.toLowerCase();
  const needle = file.toLowerCase();
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    if (at === 0 || /[\s/"'`=]/.test(haystack[at - 1])) return true;
  }
  return false;
};

/**
 * Reads of each memory file by session agents, between `since` (excluded) and `until` (included).
 * `memoryFiles` are `memories/<name>.md` paths. A file nobody read is absent from the map.
 */
export const countReads = ({ lines, repoRoot, memoryFiles, since, until }) => {
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
      for (const file of memoryFiles) {
        if (!_names(target, file)) continue;
        const count = counts.get(file) ?? { reads: 0, lastRead: null };
        counts.set(file, {
          reads: count.reads + 1,
          lastRead: count.lastRead === null || at > Date.parse(count.lastRead) ? new Date(at).toISOString() : count.lastRead,
        });
      }
    }
  }
  return counts;
};

/** `usage` with the counted reads added. Only the files read change; a path usage does not list is ignored. Pure. */
export const applyReads = (usage, counts) => {
  const files = { ...usage.files };
  for (const [file, { reads, lastRead }] of counts) {
    const entry = files[file];
    if (entry === undefined) continue;
    const newer = entry.lastRead === null || (lastRead !== null && Date.parse(lastRead) > Date.parse(entry.lastRead));
    files[file] = { ...entry, reads: entry.reads + reads, lastRead: newer ? lastRead : entry.lastRead };
  }
  return { ...usage, files };
};

/**
 * `usage` with one entry per memory file: a new file gets `created: today` and no reads, a deleted
 * one loses its entry. `today` is `YYYY-MM-DD`. Pure.
 */
export const syncFiles = (usage, memoryFiles, today) => ({
  ...usage,
  files: Object.fromEntries(
    memoryFiles.map((file) => [
      file,
      Object.hasOwn(usage.files, file) ? usage.files[file] : { created: today, reads: 0, lastRead: null },
    ]),
  ),
});
