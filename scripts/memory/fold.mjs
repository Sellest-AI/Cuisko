/**
 * memory:fold — the monthly fold of the usage files (spec §4.4). Each dream writes a usage file of
 * its own, so `usage/` grows by one file per dream; once a month is closed, its files fold into
 * one `usage/<YYYY-MM>.json`. Totals are the same before and after (usage.mjs `totals`), so the
 * index does not move.
 *
 * By default it only prints what the next fold would change: `usage/` is locked, and the owner
 * never commits a fold by hand. With `--write` it writes the month files and removes the folded
 * dream files: the `memory-usage-fold` Action runs it so, then commits through the lock with
 * MEMORY_UPDATE=1. `usage/` is plaintext, so this runs on a clone without the key.
 *
 * A malformed usage file is left where it is and named: C20 reports it, and the fold never
 * guesses what it said.
 *
 * Arguments:
 *   --write               write the fold (the Action only)
 *   --memory-dir <path>   the folder to fold (default: this repo's .claude/memory)
 *   --today <YYYY-MM-DD>  tests only: the day the fold runs (default: today, UTC)
 */
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { foldPlan, readUsageFiles, USAGE_DIR } from "./_lib/usage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const USAGE = "Usage: pnpm memory:fold [--write] [--memory-dir <path>] [--today <YYYY-MM-DD>]";

/** True when `text` is a day that exists, as YYYY-MM-DD: `2026-13-01` has the shape but no day. */
const _isDay = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text;

const _argsOf = (argv) => {
  const args = { write: false, memoryDir: path.join(ROOT, ".claude", "memory"), today: new Date().toISOString().slice(0, 10), problems: [] };
  for (let at = 0; at < argv.length; at++) {
    const flag = argv[at];
    if (flag === "--write") args.write = true;
    else if (flag === "--memory-dir" || flag === "--today") {
      const value = argv[++at];
      if (value === undefined) args.problems.push(`${flag} needs a value`);
      else if (flag === "--memory-dir") args.memoryDir = path.resolve(value);
      else args.today = value;
    } else args.problems.push(`unknown argument ${flag}`);
  }
  if (!_isDay(args.today)) args.problems.push("--today is not YYYY-MM-DD");
  return args;
};

const _run = (args) => {
  const folder = path.join(args.memoryDir, USAGE_DIR);
  const files = readUsageFiles(args.memoryDir);
  const plan = foldPlan(files, args.today);
  const lines = plan.skipped.map((name) => `skipped  ${USAGE_DIR}/${name}: it does not parse, so it is left for C20 to report`);
  if (plan.write.length === 0) return [...lines, "Nothing to fold: no closed month has a dream file."];
  for (const { name } of plan.write) lines.push(`write    ${USAGE_DIR}/${name}`);
  for (const name of plan.remove) lines.push(`remove   ${USAGE_DIR}/${name}`);
  if (!args.write) return [...lines, "Not written: only the memory-usage-fold Action writes a fold (--write)."];
  for (const { name, text } of plan.write) writeFileSync(path.join(folder, name), text);
  for (const name of plan.remove) rmSync(path.join(folder, name));
  return [...lines, `Folded: ${USAGE_DIR}/ now holds ${readdirSync(folder).length} file(s).`];
};

const args = _argsOf(process.argv.slice(2));
if (args.problems.length > 0) {
  console.error([...args.problems, USAGE].join("\n"));
  process.exit(1);
}
try {
  console.log(_run(args).join("\n"));
} catch (error) {
  console.error(`memory:fold failed: ${error.message}`);
  process.exit(1);
}
