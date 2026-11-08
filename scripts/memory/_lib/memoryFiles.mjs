/**
 * The files of a memory folder, read for the checks (spec §4.2, P5). One reader for the shapes a
 * memory file has: a YAML header (`summary`, `status`, `last_verified`), a `# Title`, the bullets
 * of `## Facts`, relative links to other memory files, and `docs/` paths in backticks.
 *
 * Nothing here judges. It returns what a file says, and what is malformed in it as `errors`;
 * C20 turns those into findings, and memory:update uses `title` and `summary` for the index.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** What transcrypt writes first in an encrypted file (`openssl enc` salted header, base64). */
const ENCRYPTED_PREFIX = "U2FsdGVkX1";

/** True when `text` is transcrypt ciphertext: the clone has no key, or this is CI. */
export const isEncrypted = (text) => text.startsWith(ENCRYPTED_PREFIX);

const headerSchema = z.strictObject({
  summary: z.string().min(1),
  status: z.enum(["stable", "volatile"]),
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

/**
 * Every file of `<dir>/memories/`: `{ path: "memories/<name>.md", file, text, title, summary,
 * status, lastVerified, body, headerLines, errors }`, sorted by path, and the entries that are not a `.md` file (a folder, a stray
 * file), since `memories/` stays flat. A missing folder is an empty one.
 */
export const readMemoryFiles = (dir) => {
  const folder = path.join(dir, "memories");
  let names;
  try {
    names = readdirSync(folder).sort();
  } catch {
    return { files: [], strays: [] };
  }
  const files = [];
  const strays = [];
  for (const name of names) {
    const file = path.join(folder, name);
    if (!name.endsWith(".md") || !statSync(file).isFile()) {
      strays.push(`memories/${name}`);
      continue;
    }
    const text = readFileSync(file, "utf8");
    const { header, body, errors } = _parseHeader(text);
    const heading = /^# (.+)$/m.exec(body);
    files.push({
      path: `memories/${name}`,
      file,
      text,
      title: heading === null ? null : heading[1].trim(),
      summary: header === null ? null : header.summary,
      status: header === null ? null : header.status,
      lastVerified: header === null ? null : header.last_verified,
      body,
      headerLines: text.slice(0, text.length - body.length).split("\n").length - 1,
      errors: heading === null ? [...errors, "no `# Title` heading"] : errors,
    });
  }
  return { files, strays };
};

/**
 * The bullets of the `## Facts` section, each with its continuation lines joined, and the 1-based
 * line of the file where it starts (`body` follows the header; `offset` is the header's length).
 */
export const factBullets = (body, offset = 0) => {
  const lines = body.split(/\r?\n/);
  const bullets = [];
  let inFacts = false;
  for (const [index, line] of lines.entries()) {
    if (/^## /.test(line)) {
      inFacts = /^## Facts\s*$/.test(line);
      continue;
    }
    if (!inFacts) continue;
    if (line.startsWith("- ")) bullets.push({ text: line.slice(2).trim(), line: index + 1 + offset });
    else if (/^\s+\S/.test(line) && bullets.length > 0) bullets.at(-1).text += ` ${line.trim()}`;
  }
  return bullets;
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
