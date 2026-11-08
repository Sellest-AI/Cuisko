/**
 * A dream commit that was refused (spec §9.1 U9; the plan's "pending commit"). The dream cost
 * money and the owner already chose, so a refused commit (the pre-commit's `pnpm verify` failed on
 * unrelated work, say) must not lose it. `pending.json` in the dream folder keeps what the commit
 * and the stamps need; the dream's own copy of the memory is the source of truth, never the git
 * index, which the owner may stash, restore or commit through.
 *
 * The next `memory:update` finds it at U1, checks the branch and that the memory at HEAD is still
 * the one the dream started from (a pull or a hand-written file would make the copy stale), mirrors
 * the copy again and retries U9–U11 only.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const FILE = "pending.json";
const isoDate = z.iso.datetime({ offset: true });
const pair = z.strictObject({ sessionId: z.string(), branch: z.string(), timestamp: isoDate, transcript: z.string() });

const pendingSchema = z.strictObject({
  version: z.literal(1),
  branch: z.string().min(1),
  base: z.string().min(7),
  message: z.string().min(1),
  outcome: z.enum(["accepted", "edited"]),
  readsCountedUntil: isoDate,
  selected: z.array(pair),
  onOpenBranches: z.array(pair),
  changes: z.strictObject({ created: z.array(z.string()), modified: z.array(z.string()), deleted: z.array(z.string()) }),
});

/** The newest line of each (session, branch), as the stamps need them. */
export const pairsOf = (lines) => {
  const newest = new Map();
  for (const line of lines) {
    const key = JSON.stringify([line.sessionId, line.branch]);
    const kept = newest.get(key);
    if (kept === undefined || Date.parse(line.timestamp) > Date.parse(kept.timestamp)) {
      newest.set(key, { sessionId: line.sessionId, branch: line.branch, timestamp: line.timestamp, transcript: line.transcript });
    }
  }
  return [...newest.values()];
};

export const writePending = (dreamDir, pending) => {
  writeFileSync(path.join(dreamDir, FILE), `${JSON.stringify(pendingSchema.parse(pending), null, 2)}\n`);
};

/** Dream folders under `<tmp>/memory/`, newest last. */
export const dreamDirs = (memoryTmp) => {
  if (!existsSync(memoryTmp)) return [];
  return readdirSync(memoryTmp, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("dream-"))
    .map((entry) => path.join(memoryTmp, entry.name))
    .sort();
};

/**
 * The pending commit, if a dream folder holds one: `{ dir, pending }`, or null. An unreadable
 * `pending.json` throws: guessing would either drop a dream or commit the wrong thing.
 */
export const findPending = (memoryTmp) => {
  for (const dir of dreamDirs(memoryTmp)) {
    const file = path.join(dir, FILE);
    if (!existsSync(file)) continue;
    const parsed = pendingSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success) throw new Error(`${file} is invalid (${parsed.error.issues[0]?.message}). Delete ${dir} and run the dream again.`);
    return { dir, pending: parsed.data };
  }
  return null;
};
