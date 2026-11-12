/**
 * The PR file, `.tmp/pr/<branch slug>.md`: what `pr:push` opens or edits the pull request with.
 * The agent writes it; `pr:push` reads it and fills its `## Memory` section.
 *
 *   ---
 *   title: "fix(planning): eggs counted twice on the week plan"
 *   base: dev
 *   ---
 *   Fixes #12
 *
 *   ## Changed
 *   …
 *   ## Memory
 *   (filled by pr:push)
 *
 * `base` is `dev`, or `main` for a hotfix; absent, it is `dev`. Pure: the caller reads the file.
 */

/** A UTF-8 byte-order mark may lead: PowerShell's `Out-File` writes one. */
const HEADER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const BASES = new Set(["dev", "main"]);
const KEYS = new Set(["title", "base"]);
const MEMORY_HEADING = /^## Memory[ \t]*$/m;

/** A PR file the agent must correct: printed as is. */
export class PrFileError extends Error {
  constructor(message) {
    super(message);
    this.name = "PrFileError";
  }
}

/** `"a"` or `'a'` → `a`; anything else as written. */
const _unquote = (value) => (/^(["']).*\1$/.test(value) ? value.slice(1, -1) : value);

/**
 * The title, the base and the body of a PR file. Throws PrFileError when the header is missing or
 * malformed, has no title, names a key other than `title` and `base`, or a base other than `dev`
 * and `main`.
 *
 * @param {string} text
 * @returns {{ title: string, base: "dev" | "main", body: string }}
 */
export const parsePrFile = (text) => {
  const match = HEADER.exec(text);
  if (match === null) throw new PrFileError('The PR file has no header: it starts with "---", then "title: …", then "---".');
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const pair = /^([a-z]+):\s*(.*)$/.exec(line);
    if (pair === null) throw new PrFileError(`A header line of the PR file is not "key: value": ${line}`);
    if (!KEYS.has(pair[1])) throw new PrFileError(`The PR file's header has "${pair[1]}"; it takes only title and base.`);
    fields[pair[1]] = _unquote(pair[2].trim());
  }
  const title = fields.title ?? "";
  if (title === "") throw new PrFileError("The PR file has no title: add \"title: <type>(<scope>): <summary>\" to its header.");
  const base = fields.base === undefined || fields.base === "" ? "dev" : fields.base;
  if (!BASES.has(base)) throw new PrFileError(`The PR file's base is "${base}": a PR goes into dev, or into main for a hotfix.`);
  return { title, base, body: text.slice(match[0].length).replace(/^\s*\n/, "") };
};

/**
 * The body with its `## Memory` section holding `memory`: the section's text is replaced up to
 * the next `## ` heading, or the section is added at the end when the body has none.
 *
 * @param {string} body
 * @param {{ memory: string }} options
 * @returns {string}
 */
export const renderPrBody = (body, { memory }) => {
  const section = `## Memory\n\n${memory.trim()}\n`;
  const heading = MEMORY_HEADING.exec(body);
  if (heading === null) return `${body.trimEnd()}\n\n${section}`;
  const start = heading.index;
  const afterHeading = start + heading[0].length;
  const next = /^## /m.exec(body.slice(afterHeading));
  const rest = next === null ? "" : `\n${body.slice(afterHeading + next.index)}`;
  return `${body.slice(0, start)}${section}${rest}`;
};
