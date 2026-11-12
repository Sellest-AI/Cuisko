/**
 * The issue draft, `.tmp/issues/<slug>.md`: what an agent proposes and the owner creates with the
 * mod's Create issue button (`issue:create`). The agent never creates an issue itself.
 *
 *   ---
 *   title: Eggs counted twice on the week plan
 *   type: bug
 *   areas: [planning, groceries]
 *   ---
 *   <body, in the shape of the matching issue form>
 *
 * `type` is one label of the `type` group of `.github/labels.json`, `areas` one or more of its
 * `area` group: the labels the issue is created with. Pure: the caller reads both files.
 */

/** A UTF-8 byte-order mark may lead: PowerShell's `Out-File` writes one. */
const HEADER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KEYS = new Set(["title", "type", "areas"]);

/** The login `gh api user` answers with the App's token: never the owner. */
export const BOT_LOGIN = "sellest-agent[bot]";

/** A draft the agent must correct, or a refusal the owner reads on the card: printed as is. */
export class DraftError extends Error {
  constructor(message) {
    super(message);
    this.name = "DraftError";
  }
}

/** `"a"` or `'a'` → `a`; anything else as written. */
const _unquote = (value) => (/^(["']).*\1$/.test(value) ? value.slice(1, -1) : value);

/** `[planning, groceries]` or `planning, groceries` → `["planning", "groceries"]`. */
const _list = (value) =>
  value
    .replace(/^\[(.*)\]$/, "$1")
    .split(",")
    .map((item) => _unquote(item.trim()))
    .filter((item) => item !== "");

/** The names of one group of the labels file. */
const _group = (labels, group) => labels.filter((label) => label.group === group).map((label) => label.name);

/**
 * The title, the type, the areas and the body of a draft. Throws DraftError when the header is
 * missing or malformed, names a key other than title, type and areas, has no title, a type that is
 * not one type label, no area, or an area that is not an area label.
 *
 * @param {string} text the draft file
 * @param {{ labels: { group: string, name: string }[] }} options the entries of `.github/labels.json`
 * @returns {{ title: string, type: string, areas: string[], body: string }}
 */
export const parseDraft = (text, { labels }) => {
  const match = HEADER.exec(text);
  if (match === null) throw new DraftError('The draft has no header: it starts with "---", then "title:", "type:" and "areas:", then "---".');
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const pair = /^([a-z]+):\s*(.*)$/.exec(line);
    if (pair === null) throw new DraftError(`A header line of the draft is not "key: value": ${line}`);
    if (!KEYS.has(pair[1])) throw new DraftError(`The draft's header has "${pair[1]}"; it takes only title, type and areas.`);
    fields[pair[1]] = pair[2].trim();
  }

  const title = _unquote(fields.title ?? "");
  if (title === "") throw new DraftError("The draft has no title.");

  const types = _group(labels, "type");
  const type = _unquote(fields.type ?? "");
  if (type === "") throw new DraftError(`The draft has no type: one of ${types.join(", ")}.`);
  if (!types.includes(type)) throw new DraftError(`The draft's type is "${type}": it is one of ${types.join(", ")}.`);

  const known = _group(labels, "area");
  const areas = [...new Set(_list(fields.areas ?? ""))];
  if (areas.length === 0) throw new DraftError(`The draft has no area: one or more of ${known.join(", ")}.`);
  const unknown = areas.filter((area) => !known.includes(area));
  if (unknown.length > 0) throw new DraftError(`The draft's areas ${unknown.map((area) => `"${area}"`).join(", ")} are not labels: use ${known.join(", ")}.`);

  return { title, type, areas, body: text.slice(match[0].length).replace(/^\s*\n/, "") };
};

/**
 * The arguments of `gh` that create the draft's issue. The body goes on stdin (`--body-file -`),
 * so no length limit or quoting of the command line applies to it.
 *
 * @param {{ title: string, type: string, areas: string[] }} draft
 * @returns {string[]}
 */
export const issueArgs = ({ title, type, areas }) => [
  "issue",
  "create",
  "--title",
  title,
  "--body-file",
  "-",
  ...[type, ...areas].flatMap((label) => ["--label", label]),
];

/**
 * The env `gh` runs in as the owner: without the bot's token (`GH_TOKEN`, `GITHUB_TOKEN`), its
 * empty config folder (`GH_CONFIG_DIR`) and the git config a session injects (every
 * `GIT_CONFIG_*`), so `gh` reads the owner's own login.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string | undefined>}
 */
export const ownerEnv = (env) =>
  Object.fromEntries(
    Object.entries(env).filter(([name]) => !["GH_TOKEN", "GITHUB_TOKEN", "GH_CONFIG_DIR"].includes(name) && !name.startsWith("GIT_CONFIG_")),
  );
