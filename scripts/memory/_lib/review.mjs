/**
 * What the owner sees before choosing (spec §9.1 U7): the diff of the memory files, how the index
 * ranking moved, and every alert the agents raised. The reviewer fixes what it can prove, and the
 * diff already holds its fixes; the owner decides, so this text has to make both what it changed
 * and what it left open hard to miss.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** The path -> position of each memory the index lists, in index order. */
const _positions = (indexText) => {
  const listed = [...indexText.matchAll(/^- \[(.*)\]\((memories\/[^)\s]+)\): /gm)];
  return new Map(listed.map((match, at) => [match[2], { position: at + 1, title: match[1] }]));
};

/** How the order of the index changed, as short lines: a memory that moved, appeared or left. */
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
export const memoryDiff = ({ cwd, from, to }) => {
  // git treats a missing side as an empty file and says nothing: a wrong path would read as "no change".
  for (const side of [from, to]) {
    if (!existsSync(path.resolve(cwd, side))) throw new Error(`could not diff the memory: ${side} does not exist`);
  }
  const run = spawnSync("git", ["diff", "--no-index", "--no-color", "--", from, to], { cwd, encoding: "utf8" });
  if (run.error !== undefined || (run.status !== 0 && run.status !== 1)) {
    throw new Error(`could not diff the memory: ${run.error?.message ?? run.stderr}`);
  }
  return run.stdout;
};

const _section = (title, rows) => (rows.length === 0 ? [] : [`${title}`, ...rows.map((row) => `  ${row}`), ""]);

/**
 * The alerts the owner reads next to the diff: what the reviewer flagged and left open, then what it
 * fixed (each worst first), what the writers raised, the docs the planner thinks are wrong, and the
 * deletions it proposes.
 */
export const formatReport = ({ flags, alerts, docsIssues, deletions }) => {
  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...flags].sort((a, b) => order[a.severity] - order[b.severity]);
  const line = (flag) => `[${flag.severity}] ${flag.path}: ${flag.problem} — "${flag.fact}" (evidence: ${flag.evidence})`;
  return [
    ..._section("Reviewer flags", sorted.filter((flag) => flag.fix === undefined).map(line)),
    ..._section("Fixed by the reviewer", sorted.filter((flag) => flag.fix !== undefined).map((flag) => `${line(flag)} → ${flag.fix}`)),
    ..._section("Writer alerts", alerts.map((alert) => `[${alert.kind}] ${alert.message}`)),
    ..._section("Docs that look wrong", docsIssues.map((issue) => `${issue.doc}: ${issue.issue}`)),
    ..._section("Deletions proposed", deletions.map((entry) => `${entry.path}: ${entry.reason ?? "no reason given"}`)),
  ].join("\n");
};
