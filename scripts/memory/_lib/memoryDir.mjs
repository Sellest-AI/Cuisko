/**
 * Moving a memory folder around (spec §9.1 U4, U9). The dream works on a copy; the repo's
 * `.claude/memory` changes only when the owner accepts, and then it is brought in line with the
 * copy.
 *
 * Four kinds of entry, four behaviours:
 *   - `memories/<topic>/<fact>.md`: mirrored both ways, deletions included; a topic folder left
 *     empty is removed
 *   - `usage/<file>.json`: a file the copy has and the repo lacks is added; nothing there is ever
 *     changed or deleted, which only the monthly fold does
 *   - `README.md` and `_template.md`: the owner's, copied into the dream for the agents to read and
 *     for C20 to compare, and never mirrored back
 *   - `.built/`: rebuilt at each session start, never copied
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BUILT_FOLDER } from "./built.mjs";
import { USAGE_DIR } from "./usage.mjs";

const OWNER_FILES = ["README.md", "_template.md"];

const _isFolder = (file) => statSync(file).isDirectory();

/**
 * `memories/…` -> contents, for every file under `dir/memories/`: the facts of each topic folder,
 * and anything misplaced (a file directly under `memories/`), so a change there is seen too.
 */
const _memories = (dir) => {
  const root = path.join(dir, "memories");
  if (!existsSync(root)) return new Map();
  const entries = [];
  for (const topic of readdirSync(root).sort()) {
    const folder = path.join(root, topic);
    if (!_isFolder(folder)) {
      entries.push([`memories/${topic}`, readFileSync(folder, "utf8")]);
      continue;
    }
    for (const name of readdirSync(folder).sort()) {
      if (!_isFolder(path.join(folder, name))) entries.push([`memories/${topic}/${name}`, readFileSync(path.join(folder, name), "utf8")]);
    }
  }
  return new Map(entries);
};

/** `usage/<name>` -> contents. */
const _usage = (dir) => {
  const folder = path.join(dir, USAGE_DIR);
  if (!existsSync(folder)) return new Map();
  return new Map(
    readdirSync(folder)
      .sort()
      .map((name) => [`${USAGE_DIR}/${name}`, readFileSync(path.join(folder, name), "utf8")]),
  );
};

/** A copy of the folder at `to`, without the built folder, with `memories/` and `usage/` even when the source had none. */
export const copyMemory = (from, to) => {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true, filter: (source) => path.relative(from, source).split(path.sep)[0] !== BUILT_FOLDER });
  mkdirSync(path.join(to, "memories"), { recursive: true });
  mkdirSync(path.join(to, USAGE_DIR), { recursive: true });
};

/**
 * What the facts of `to` have that `from` does not (`created`), what differs (`modified`) and
 * what `from` has that `to` lacks (`deleted`). Paths are `memories/<topic>/<name>`, sorted.
 */
export const compareMemories = (from, to) => {
  const before = _memories(from);
  const after = _memories(to);
  return {
    created: [...after.keys()].filter((name) => !before.has(name)),
    modified: [...after.keys()].filter((name) => before.has(name) && before.get(name) !== after.get(name)),
    deleted: [...before.keys()].filter((name) => !after.has(name)),
  };
};

/**
 * Makes `to`'s facts equal to `from`'s, a fact `from` no longer has deleted and a topic folder left
 * empty removed, and adds the usage files `to` lacks. `README.md` and `_template.md` are not
 * touched, and no usage file of `to` is changed or deleted.
 */
export const mirrorMemory = (from, to) => {
  const wanted = _memories(from);
  for (const name of _memories(to).keys()) {
    if (!wanted.has(name)) rmSync(path.join(to, name), { force: true });
  }
  for (const [name, contents] of wanted) {
    mkdirSync(path.dirname(path.join(to, name)), { recursive: true });
    writeFileSync(path.join(to, name), contents);
  }
  const root = path.join(to, "memories");
  if (existsSync(root)) {
    for (const topic of readdirSync(root)) {
      const folder = path.join(root, topic);
      if (_isFolder(folder) && readdirSync(folder).length === 0) rmdirSync(folder);
    }
  }
  const present = _usage(to);
  mkdirSync(path.join(to, USAGE_DIR), { recursive: true });
  for (const [name, contents] of _usage(from)) {
    if (!present.has(name)) writeFileSync(path.join(to, name), contents);
  }
};

/** Every file of the folder but the built ones, the owner's two included, as path -> contents. */
export const snapshotMemory = (dir) =>
  new Map([
    ...OWNER_FILES.filter((name) => existsSync(path.join(dir, name))).map((name) => [name, readFileSync(path.join(dir, name), "utf8")]),
    ..._memories(dir),
    ..._usage(dir),
  ]);

/** The paths whose contents differ between two snapshots, one that exists in only one included. Sorted. */
export const changedPaths = (before, after) =>
  [...new Set([...before.keys(), ...after.keys()])].filter((name) => before.get(name) !== after.get(name)).sort();
