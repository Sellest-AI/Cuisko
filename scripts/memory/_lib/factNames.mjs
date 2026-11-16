/**
 * The file name of a new fact: the slug of its title, then a 4-character random id.
 *
 *   "Stand-in hook needs mode 755"  →  stand-in-hook-needs-mode-755-p2a7.md
 *
 * Only the script names a fact, never a model: models are poor at randomness, and parallel
 * writers cannot see each other's choices. The name is fixed at creation, so a rename never
 * collides with another branch's edit of the same fact. The id only keeps two facts with the same
 * title apart; no rule needs it to be unique on its own.
 */
import { randomInt } from "node:crypto";

import { MAX_SLUG } from "./memoryFiles.mjs";

const ID_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 4;
/** Draws before giving up: with 36^4 ids, reaching this means `taken` is not what the caller thinks. */
const MAX_DRAWS = 1000;

/**
 * The slug of a title: accents removed, lowercase, every run of other characters a single `-`,
 * cut at a word so it stays within MAX_SLUG characters. A title with no letter or digit gives
 * `fact`, so a name always has a slug.
 */
const slugOf = (title) => {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug === "" ? word : `${slug}-${word}`;
    if (next.length > MAX_SLUG) break;
    slug = next;
  }
  // A first word longer than the limit is cut: a slug is never empty because of one long word.
  if (slug === "" && words.length > 0) slug = words[0].slice(0, MAX_SLUG);
  return slug === "" ? "fact" : slug;
};

/** 4 random characters from a-z0-9: the id of a fact's name, and of a dream's usage file. */
export const randomId = () => Array.from({ length: ID_LENGTH }, () => ID_CHARACTERS[randomInt(ID_CHARACTERS.length)]).join("");

/**
 * A new file name for a fact titled `title`, not in `taken` (names of the topic, and every name
 * drawn so far in this dream). The caller adds the result to `taken` before the next call.
 */
export const factName = (title, { taken }) => {
  const slug = slugOf(title);
  for (let draw = 0; draw < MAX_DRAWS; draw++) {
    const name = `${slug}-${randomId()}.md`;
    if (!taken.has(name)) return name;
  }
  throw new Error(`no free name for "${slug}" after ${MAX_DRAWS} draws`);
};
