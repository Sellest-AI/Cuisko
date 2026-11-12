/**
 * The facts of a memory folder, read for the checks, the dream and the built index (spec §4.2,
 * P5). One fact per file, under a folder per topic:
 *
 *   memories/<topic>/<title slug>-<4-char id>.md
 *
 * A fact file has a YAML header (`title`, `status`, `created`, `last_verified`), then one fact (a
 * paragraph, or one starting `Hypothesis: `) ending with its source date, then an optional
 * `## Links` section. No file is shared by the facts of a topic: two dreams on two branches never
 * write the same file unless they edit the same fact, so GitHub, which merges the encrypted memory
 * as ciphertext, merges them without a conflict.
 *
 * Nothing here judges. It returns what a file says, and what is malformed in it as `errors`; C20
 * turns those into findings.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** The facts' folder, from the repository's root, as git names paths. */
export const MEMORIES_PATH = ".claude/memory/memories/";

/** What transcrypt writes first in an encrypted file (`openssl enc` salted header, base64). */
const ENCRYPTED_PREFIX = "U2FsdGVkX1";

/** True when `text` is transcrypt ciphertext: the clone has no key, or this is CI. */
export const isEncrypted = (text) => text.startsWith(ENCRYPTED_PREFIX);

/** How a fact ends: its source date, or the date of the owner's correction. */
const SOURCE_DATE = /\(source: (correction of )?\d{4}-\d{2}-\d{2}\)$/;

/** The longest title slug of a fact's file name, before `-<id>.md`. */
export const MAX_SLUG = 50;

/** `<slug>-<id>.md`: the slug is lowercase words joined by `-`, the id 4 characters from a-z0-9. */
const FACT_NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*)-([a-z0-9]{4})\.md$/;

/** A topic folder: lowercase words joined by `-`. */
const TOPIC_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `index` would collide with the built index (`.built/index.md`), so no topic may take it. */
const RESERVED_TOPICS = new Set(["index"]);

/** True when `name` is a legal fact file name. */
export const isFactName = (name) => {
  const match = FACT_NAME.exec(name);
  return match !== null && match[1].length <= MAX_SLUG;
};

/** True when `name` is a legal topic folder name. */
export const isTopicName = (name) => TOPIC_NAME.test(name) && !RESERVED_TOPICS.has(name);

const headerSchema = z.strictObject({
  title: z.string().min(1),
  status: z.enum(["stable", "volatile"]),
  created: z.iso.date(),
  last_verified: z.iso.date(),
});

const HEADER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** `key: value` lines of the header. Anything else is a malformed header. */
const _parseHeader = (text) => {
  const match = HEADER.exec(text);
  if (match === null) return { header: null, body: text, errors: ["no YAML header (---) at the top"] };
  const raw = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (pair === null) return { header: null, body: text.slice(match[0].length), errors: [`header line is not "key: value": ${line}`] };
    raw[pair[1]] = pair[2].trim();
  }
  const parsed = headerSchema.safeParse(raw);
  const errors = parsed.success ? [] : parsed.error.issues.map((issue) => `header ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return { header: parsed.success ? parsed.data : null, body: text.slice(match[0].length), errors };
};

/** The `title` of a fact file's header, or null when the header is missing or malformed. */
export const factTitle = (text) => _parseHeader(text).header?.title ?? null;

/** The fact of a body: the text before `## Links` (or any other `## ` heading), lines joined. */
const _factText = (body) => {
  const heading = /^## /m.exec(body);
  const before = heading === null ? body : body.slice(0, heading.index);
  return before
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");
};

const _isFolder = (file) => statSync(file).isDirectory();

/** One fact file, read: what it says and what is malformed in it. */
const _readFact = (dir, topic, name) => {
  const file = path.join(dir, "memories", topic, name);
  const text = readFileSync(file, "utf8");
  const { header, body, errors } = _parseHeader(text);
  const fact = _factText(body);
  const match = FACT_NAME.exec(name);
  const problems = [
    ...(isTopicName(topic) ? [] : [`topic folder "${topic}" is not lowercase words joined by "-", or is reserved`]),
    ...(isFactName(name) ? [] : [`file name is not "<title slug of at most ${MAX_SLUG} characters>-<4 characters a-z0-9>.md"`]),
    ...errors,
    ...(fact === "" ? ["no fact before the first ## heading"] : []),
    ...(fact !== "" && !SOURCE_DATE.test(fact) ? [`fact without a source date: ${fact.slice(0, 60)}`] : []),
  ];
  return {
    path: `memories/${topic}/${name}`,
    file,
    topic,
    id: match === null ? null : match[2],
    title: header?.title ?? null,
    status: header?.status ?? null,
    created: header?.created ?? null,
    lastVerified: header?.last_verified ?? null,
    text,
    body,
    fact,
    errors: problems,
  };
};

/**
 * Every fact of `<dir>/memories/`, sorted by path, and the entries that have no place there
 * (`strays`): a file directly under `memories/`, a folder inside a topic, a file that is not `.md`.
 * A missing folder is an empty one.
 */
export const readFacts = (dir) => {
  const root = path.join(dir, "memories");
  let topics;
  try {
    topics = readdirSync(root).sort();
  } catch {
    return { facts: [], strays: [] };
  }
  const facts = [];
  const strays = [];
  for (const topic of topics) {
    const folder = path.join(root, topic);
    if (!_isFolder(folder)) {
      strays.push(`memories/${topic}`);
      continue;
    }
    for (const name of readdirSync(folder).sort()) {
      if (!name.endsWith(".md") || _isFolder(path.join(folder, name))) strays.push(`memories/${topic}/${name}`);
      else facts.push(_readFact(dir, topic, name));
    }
  }
  return { facts, strays };
};

/** The facts grouped by topic, topics sorted by name. A topic with no fact does not appear. */
export const topicsOf = (facts) => {
  const topics = new Map();
  for (const fact of facts) {
    if (!topics.has(fact.topic)) topics.set(fact.topic, []);
    topics.get(fact.topic).push(fact);
  }
  return new Map([...topics.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
};

/**
 * The topic a path names, or null. Read through the memory folder: a fact
 * (`memories/<t>/<fact>.md`), a topic folder (`memories/<t>` or `memories/<t>/`), a built topic
 * file (`.built/<t>.md`), or a file of the layout before facts (`memories/<t>.md`), whose topic
 * kept its name. The built index (`.built/index.md`) names no topic. Backslashes count as slashes.
 */
export const topicOf = (memoryPath) => {
  const forward = memoryPath.replace(/\\/g, "/");
  const built = /(?:^|\/)\.built\/([^/]+)\.md$/.exec(forward);
  if (built !== null) return isTopicName(built[1]) ? built[1] : null;
  const memory = /(?:^|\/)memories\/([^/]+?)(?:\.md|\/[^/]*)?\/?$/.exec(forward);
  if (memory === null) return null;
  return isTopicName(memory[1]) ? memory[1] : null;
};

/**
 * Targets of the Markdown links in `text` that point at a file: web links and `#anchors` are left
 * out, and so is code (a fenced block, an inline span), where an example link is not a link.
 */
export const fileLinks = (text) =>
  [...text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "").matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)]
    .map((match) => match[1].split("#")[0])
    .filter((target) => target !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(target));

/** The `docs/` paths in backticks, trailing `.`, `,` or `:` removed. A glob is left out: it names no one file. */
export const citedDocs = (text) =>
  [...text.matchAll(/`(docs\/[^`\s]+)`/g)].map((match) => match[1].replace(/[.,:;]+$/, "")).filter((cited) => !cited.includes("*"));
