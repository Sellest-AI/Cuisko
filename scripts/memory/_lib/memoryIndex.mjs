/**
 * The built index (spec §4.3, §10.8): the catalogue of the memory, one line per topic, most useful
 * first, and one file per topic holding its facts joined. Built from the facts and usage/ at every
 * session start (built.mjs) and rendered in memory by the dream to show the ranking change; never
 * committed, never written by an agent. A session sees the index's first 200 lines at start, so the
 * order decides which topics a session knows about without opening anything.
 *
 * Order:
 *   1. grace: a topic created (its oldest fact) less than GRACE_DAYS ago comes first, newest first.
 *      Without it a new topic, with no reads, would sit at the bottom, never shown, so never read
 *   2. the rest by score: reads × 0.5^(days since last read / HALF_LIFE_DAYS); never read is 0
 *   3. a tie goes by topic name, so the same input always gives the same bytes
 *
 * The fixed header is descriptive only: it never tells a session how the memory is written, which
 * would invite it to try.
 */

export const GRACE_DAYS = 30;
export const HALF_LIFE_DAYS = 30;
/** Fact titles shown on a topic's index line, newest first; the rest are counted. */
export const TITLES_PER_LINE = 6;
/** The folder the built files live in, from the repo root. Links name it whole (spec §4.3). */
export const BUILT_DIR = ".claude/memory/.built";

const DAY_MS = 86_400_000;

/** The header every index starts with, up to the list heading. An index with no topic is exactly this. */
export const FIXED_HEADER = `# Cuisko project memory

This file lists what agents have learned about this project that is found neither in the code nor in docs/.
When a topic in the list concerns your task, read the linked file before acting.
The files under .claude/memory/ are updated automatically. Do not edit them.

<!-- end of fixed header -->

## Memories
`;

const _days = (from, now) => (now.getTime() - Date.parse(from)) / DAY_MS;

/** The decayed read count of a topic's totals at `now`. */
export const score = ({ reads, lastRead }, now) => (lastRead === null ? 0 : reads * 0.5 ** (Math.max(0, _days(lastRead, now)) / HALF_LIFE_DAYS));

/** One line of text: a title written over several lines would break the list. */
const _oneLine = (text) => text.replace(/\s+/g, " ").trim();

const _byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** A topic's display title: its folder name, `-` as spaces, the first letter capitalised. */
export const topicTitle = (topic) => {
  const words = topic.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** A fact's title, or its file name when the header is malformed: the index never drops a fact. */
const _titleOf = (fact) => _oneLine(fact.title ?? fact.path.slice(fact.path.lastIndexOf("/") + 1).replace(/\.md$/, ""));

/** The date a fact was learnt: its `(source: …)` date, else its `created`, else empty. */
const _sourceDate = (fact) => /(\d{4}-\d{2}-\d{2})\)$/.exec(fact.fact)?.[1] ?? fact.created ?? "";

/** The date a topic was created: the earliest `created` of its facts, or `today` when none has one. */
export const topicCreated = (facts, today) =>
  facts
    .map(({ created }) => created)
    .filter((created) => created !== null)
    .sort()[0] ?? today;

const _newestFirst = (a, b) => _byText(b.created ?? "", a.created ?? "") || _byText(a.path, b.path);

/**
 * The whole built index. `topics` is topic → its facts (`topicsOf`); `totals` is topic →
 * `{ reads, lastRead }` (usage.mjs `totals`), a topic missing from it never read.
 */
export const renderTopicIndex = (topics, totals, { now }) => {
  const today = now.toISOString().slice(0, 10);
  const ranked = [...topics.entries()]
    .map(([topic, facts]) => {
      const created = topicCreated(facts, today);
      const total = totals.get(topic) ?? { reads: 0, lastRead: null };
      return { topic, facts, created, grace: _days(created, now) < GRACE_DAYS, score: score(total, now) };
    })
    .sort((a, b) => {
      if (a.grace !== b.grace) return a.grace ? -1 : 1;
      const order = a.grace ? _byText(b.created, a.created) : b.score - a.score;
      return order || _byText(a.topic, b.topic);
    });
  if (ranked.length === 0) return FIXED_HEADER;
  const lines = ranked.map(({ topic, facts }) => {
    const newest = [...facts].sort(_newestFirst);
    const titles = newest.slice(0, TITLES_PER_LINE).map(_titleOf);
    const more = newest.length - titles.length;
    const summary = more > 0 ? `${titles.join(" · ")} · … +${more} more` : titles.join(" · ");
    return `- [${topicTitle(topic)}](${BUILT_DIR}/${topic}.md): ${summary}`;
  });
  return `${FIXED_HEADER}\n${lines.join("\n")}\n`;
};

/**
 * A topic's built file: its title, then each fact, oldest learnt first (source date, then file
 * name), under its own title, with the file it lives in, so an agent can cite or open it.
 */
export const renderTopic = (topic, facts) => {
  const sorted = [...facts].sort((a, b) => _byText(_sourceDate(a), _sourceDate(b)) || _byText(a.path, b.path));
  const sections = sorted.map((fact) => {
    const meta = [`\`.claude/memory/${fact.path}\``, fact.status, fact.lastVerified === null ? null : `verified ${fact.lastVerified}`].filter(Boolean);
    return `## ${_titleOf(fact)}\n\n${meta.join(" · ")}\n\n${fact.body.trim()}\n`;
  });
  return `# ${topicTitle(topic)}\n\n${sections.join("\n")}`;
};

/** How many lines of the index a session gets at start (spec §5.1). */
export const SESSION_LINES = 200;

/**
 * The part of the index a session sees at start: all of it up to `maxLines` lines. Past that,
 * the last line shown becomes a pointer to the rest, with the count of topics left out. The
 * best-ranked topics come first, so they are the ones shown.
 */
export const headOfIndex = (text, maxLines = SESSION_LINES) => {
  const lines = text.replace(/\n$/, "").split("\n");
  if (lines.length <= maxLines) return `${lines.join("\n")}\n`;
  const shown = lines.slice(0, maxLines - 1);
  const hidden = lines.slice(maxLines - 1).filter((line) => line.startsWith("- [")).length;
  const noun = hidden === 1 ? "topic, less used, is" : "topics, less used, are";
  return `${[...shown, `… ${hidden} more ${noun} listed in ${BUILT_DIR}/index.md.`].join("\n")}\n`;
};
