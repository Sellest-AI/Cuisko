/**
 * The built folder, `.claude/memory/.built/` (spec §4.3): the index and one file per topic,
 * rendered from the facts and usage/. Git-ignored and rebuilt at every session start, so a merge
 * never has to reconcile it and no branch can carry a stale one.
 *
 * Two sessions can start at the same moment. Each file is written to a name of its own, then
 * renamed over the old one: a reader sees the old file or the new one, never half of one, and the
 * last rename wins with the same content. On Windows a rename fails while another process holds the
 * target; the old file is then kept, and the failure comes back as a warning for the hook to print.
 */
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { randomId } from "./factNames.mjs";
import { isEncrypted, readFacts, topicsOf } from "./memoryFiles.mjs";
import { renderTopic, renderTopicIndex, topicCreated } from "./memoryIndex.mjs";
import { readUsageFiles, totals } from "./usage.mjs";

export const BUILT_FOLDER = ".built";
const INDEX = "index.md";

/** How old a temporary file must be before it counts as left by a killed build, not a running one. */
const ORPHAN_AFTER_MS = 60_000;

/** True when `file` is a temporary file a build never renamed: it was killed between write and rename. */
const _isOrphan = (file, now) => {
  if (!file.endsWith(".tmp")) return false;
  try {
    return now.getTime() - statSync(file).mtimeMs > ORPHAN_AFTER_MS;
  } catch {
    return false; // Renamed or removed by the build that wrote it, between readdir and stat.
  }
};

/** Writes `text` to `file` through a temporary name. Returns null, or the reason the old file was kept. */
const _writeAtomic = (file, text) => {
  const temporary = `${file}.${process.pid}-${randomId()}.tmp`;
  try {
    writeFileSync(temporary, text);
    renameSync(temporary, file);
    return null;
  } catch (error) {
    rmSync(temporary, { force: true });
    return `${path.basename(file)}: ${error.message}`;
  }
};

/**
 * The index and the topic files of `memoryDir`, as text, without writing anything. Pure but for
 * the reads. `warnings` names each malformed usage file, which is left out of the totals.
 */
export const renderMemory = (memoryDir, { now }) => _render(memoryDir, readFacts(memoryDir).facts, { now });

const _render = (memoryDir, facts, { now }) => {
  const topics = topicsOf(facts);
  const today = now.toISOString().slice(0, 10);
  const files = readUsageFiles(memoryDir);
  const usages = files.filter(({ usage }) => usage !== null).map(({ usage }) => usage);
  const dates = new Map([...topics.entries()].map(([topic, topicFacts]) => [topic, { created: topicCreated(topicFacts, today) }]));
  return {
    index: renderTopicIndex(topics, totals(usages, dates), { now }),
    topics: new Map([...topics.entries()].map(([topic, topicFacts]) => [topic, renderTopic(topic, topicFacts)])),
    warnings: files.filter(({ error }) => error !== null).map(({ error }) => `usage file skipped: ${error}`),
  };
};

/**
 * Builds `<memoryDir>/.built/`: writes the index and every topic file, then removes the topic files
 * of topics that no longer exist. Writes nothing when the facts are still encrypted (a clone
 * without the key): `encrypted` is then true and `index` null.
 */
export const buildMemory = (memoryDir, { now }) => {
  const { facts } = readFacts(memoryDir);
  if (facts.some(({ text }) => isEncrypted(text))) return { encrypted: true, index: null, topics: 0, warnings: [] };
  const { index, topics, warnings } = _render(memoryDir, facts, { now });
  const folder = path.join(memoryDir, BUILT_FOLDER);
  mkdirSync(folder, { recursive: true });
  const failures = [];
  for (const [topic, text] of topics) {
    const failure = _writeAtomic(path.join(folder, `${topic}.md`), text);
    if (failure !== null) failures.push(failure);
  }
  const indexFailure = _writeAtomic(path.join(folder, INDEX), index);
  if (indexFailure !== null) failures.push(indexFailure);
  for (const name of readdirSync(folder)) {
    const staleTopic = name.endsWith(".md") && name !== INDEX && !topics.has(name.slice(0, -3));
    if (!staleTopic && !_isOrphan(path.join(folder, name), now)) continue;
    try {
      rmSync(path.join(folder, name), { force: true });
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }
  const stale = failures.length === 0 ? [] : [`the built memory may be stale, some files were kept: ${failures.join("; ")}`];
  return { encrypted: false, index, topics: topics.size, warnings: [...warnings, ...stale] };
};
