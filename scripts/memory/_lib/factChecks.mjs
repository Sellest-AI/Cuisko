/**
 * The rules C20 holds the memory to (spec P5), as plain findings, so a test runs each rule on a
 * folder without spawning the check. C20 adds the arguments, the skip and the report.
 *
 *   stable  each fact: header, name rule, one fact with its source date, links resolve · nothing
 *           misplaced under memories/ · every usage file parses · personal data in facts and usage
 *           files. Nothing here moves with the date, so `pnpm verify` runs it on every commit.
 *   full    the stable rules · every cited `docs/` path exists · README.md and _template.md equal
 *           to the repo's. A doc renamed by another commit breaks this, so only the dream runs it.
 *
 * A finding is `{ file, message, fix, line? }`, `file` absolute.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { citedDocs, fileLinks, isEncrypted, readFacts } from "./memoryFiles.mjs";
import { scan } from "./pii.mjs";
import { readUsageFiles, USAGE_DIR } from "./usage.mjs";

/** The two files the owner writes by hand: a dream may not change them. */
const OWNER_FILES = ["README.md", "_template.md"];

const TEMPLATE_FIX = "Follow .claude/memory/_template.md.";

const _read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);

/** True when a fact file of `memoryDir` is ciphertext: CI, or a clone without the key. `usage/` is plaintext and does not count. */
export const factsEncrypted = (memoryDir) => readFacts(memoryDir).facts.some((fact) => isEncrypted(fact.text));

const _factFindings = (fact) => [
  ...fact.errors.map((message) => ({ file: fact.file, message, fix: TEMPLATE_FIX })),
  ...fileLinks(fact.text)
    .filter((target) => !existsSync(path.resolve(path.dirname(fact.file), target)))
    .map((target) => ({ file: fact.file, message: `dead link to ${target}`, fix: "Link to a memory file that exists, or remove the link." })),
];

const _strayFindings = (memoryDir, strays) =>
  strays.map((name) => ({
    file: path.join(memoryDir, name),
    message: "misplaced: memories/ holds only topic folders, and a topic folder only .md facts",
    fix: "Move it into a topic folder as a fact, or remove it.",
  }));

const _usageFindings = (memoryDir, usages) =>
  usages
    .filter((usage) => usage.error !== null)
    .map((usage) => ({
      file: path.join(memoryDir, USAGE_DIR, usage.name),
      message: `usage file does not parse: ${usage.error}`,
      fix: "Restore it from git: only memory:update and the fold write usage/.",
    }));

const _piiFindings = (documents, identity) =>
  documents.flatMap(({ file, text }) =>
    scan(text, identity).map(({ kind, line }) => ({
      file,
      line,
      message: `personal data (${kind}) — shown by line only, never echoed`,
      fix: "Remove it: the memory describes patterns, not people.",
    })),
  );

const _fullFindings = ({ memoryDir, repoMemory, root, facts }) => [
  ...facts.flatMap((fact) =>
    citedDocs(fact.text)
      .filter((cited) => !existsSync(path.join(root, cited)))
      .map((cited) => ({ file: fact.file, message: `cited path ${cited} does not exist`, fix: "Correct the path, or report the doc as stale." })),
  ),
  ...(path.resolve(memoryDir) === path.resolve(repoMemory)
    ? []
    : OWNER_FILES.filter((name) => _read(path.join(memoryDir, name)) !== _read(path.join(repoMemory, name))).map((name) => ({
        file: path.join(memoryDir, name),
        message: `${name} differs from the repo's copy`,
        fix: "Only the owner edits it: restore the repo's copy.",
      }))),
];

/**
 * Every finding on the memory at `memoryDir`. `identity` is the owner's (pii.mjs); `root` the repo
 * root a cited `docs/` path resolves against; `repoMemory` the repo's memory folder, whose owner
 * files a copy must equal. Facts must be plaintext: C20 skips before calling this.
 */
export const checkMemory = (memoryDir, { full, identity, root, repoMemory }) => {
  const { facts, strays } = readFacts(memoryDir);
  const usages = readUsageFiles(memoryDir);
  const usageDocuments = usages.map(({ name, text }) => ({ file: path.join(memoryDir, USAGE_DIR, name), text }));
  return [
    ..._strayFindings(memoryDir, strays),
    ...facts.flatMap(_factFindings),
    ..._usageFindings(memoryDir, usages),
    ..._piiFindings([...facts, ...usageDocuments], identity),
    ...(full ? _fullFindings({ memoryDir, repoMemory, root, facts }) : []),
  ];
};
