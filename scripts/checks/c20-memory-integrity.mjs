/**
 * C20 — the agent memory is well formed and holds no personal data (spec P5, §11.1).
 *
 * Two modes, because `pnpm verify` runs every check on every commit, and two of P5's rules change
 * without anyone editing the memory: the index order moves with today's date, and a cited `docs/`
 * path dies when a commit renames that doc.
 *
 *   stable (default)  header · source dates · links between memory files · usage.json has one entry
 *                     per file · index.md lists exactly the files, in any order · personal data.
 *                     What `pnpm verify` runs, so every commit gets the personal-data scan.
 *   --full            the stable rules, and index.md byte for byte as renderIndex builds it at
 *                     `--now`, every cited `docs/` path present, README.md and _template.md equal
 *                     to the repo's. What memory:update runs on the dream's copy.
 *
 * Arguments, never environment variables: run-all passes none, so verify gets the stable mode on
 * the real memory.
 *   --memory-dir <path>   the folder to check (default .claude/memory); `docs/` still resolves
 *                         against the repo root
 *   --now <iso datetime>  the dream's clock for --full (default: now)
 *   --identity <json>     tests only: replaces ownerIdentity(), so a test runs with a fixed one
 *
 * It skips, saying why, when the folder is absent or its files are ciphertext: that is CI, and a
 * clone without the key. The owner's identity is read only after that skip.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { citedDocs, factBullets, fileLinks, isEncrypted, readMemoryFiles } from "../memory/_lib/memoryFiles.mjs";
import { FIXED_HEADER, renderIndex } from "../memory/_lib/memoryIndex.mjs";
import { ownerIdentity, scan } from "../memory/_lib/pii.mjs";
import { readUsage } from "../memory/_lib/usage.mjs";
import { relative, report, ROOT } from "./_lib.mjs";

const NAME = "C20 agent memory integrity";
const SOURCE_DATE = /\(source: (correction of )?\d{4}-\d{2}-\d{2}\)$/;
/** The two files the owner writes by hand: a dream may not change them. */
const OWNER_FILES = ["README.md", "_template.md"];

const _argsOf = (argv) => {
  const args = { full: false, memoryDir: null, now: null, identity: null, problems: [] };
  for (let at = 0; at < argv.length; at++) {
    const flag = argv[at];
    if (flag === "--full") args.full = true;
    else if (flag === "--memory-dir" || flag === "--now" || flag === "--identity") {
      const value = argv[++at];
      if (value === undefined) args.problems.push(`${flag} needs a value`);
      else args[{ "--memory-dir": "memoryDir", "--now": "now", "--identity": "identity" }[flag]] = value;
    } else args.problems.push(`unknown argument ${flag}`);
  }
  return args;
};

const args = _argsOf(process.argv.slice(2));
const repoMemory = path.join(ROOT, ".claude", "memory");
const memoryDir = args.memoryDir === null ? repoMemory : path.resolve(ROOT, args.memoryDir);

const finding = (file, message, fix, line) => ({ file: relative(file), line, message, fix });

/** Everything wrong with the arguments, as findings: a check that mis-parses its own flags must not pass. */
const badArguments = [
  ...args.problems.map((problem) => finding(memoryDir, problem, "Use --memory-dir <path>, --full, --now <iso> or --identity <json>.")),
  ...(args.now !== null && Number.isNaN(Date.parse(args.now)) ? [finding(memoryDir, "--now is not a date", "Pass an ISO 8601 date and time.")] : []),
];

const _skipReason = () => {
  if (!existsSync(memoryDir)) return "no memory folder here";
  const encrypted = ["index.md", "usage.json"]
    .map((name) => path.join(memoryDir, name))
    .concat(readMemoryFiles(memoryDir).files.map(({ file }) => file))
    .some((file) => existsSync(file) && isEncrypted(readFileSync(file, "utf8")));
  return encrypted ? "the memory files are encrypted (CI, or a clone without MEMORY_KEY)" : null;
};

const _read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);

const _fileFindings = ({ file, body, headerLines, errors, text }) => [
  ...errors.map((message) => finding(file, message, "Follow .claude/memory/_template.md.")),
  ...factBullets(body, headerLines)
    .filter((bullet) => !SOURCE_DATE.test(bullet.text))
    .map((bullet) =>
      finding(file, `fact without a source date: ${bullet.text.slice(0, 60)}`, 'End it with "(source: YYYY-MM-DD)" or "(source: correction of YYYY-MM-DD)".', bullet.line),
    ),
  ...fileLinks(text)
    .filter((target) => !existsSync(path.resolve(path.dirname(file), target)))
    .map((target) => finding(file, `dead link to ${target}`, "Link to a memory file that exists, or remove the link.")),
];

/** Usage must name every memory file once, and nothing else. Returns the usage when it can be read. */
const _usageFindings = (files) => {
  const usageFile = path.join(memoryDir, "usage.json");
  let usage;
  try {
    usage = readUsage(memoryDir);
  } catch (error) {
    return { usage: null, findings: [finding(usageFile, error.message, "Rerun memory:update --reindex.")] };
  }
  const have = new Set(Object.keys(usage.files));
  const want = new Set(files.map(({ path: name }) => name));
  const findings = [
    ...[...want].filter((name) => !have.has(name)).map((name) => finding(usageFile, `no entry for ${name}`, "Rerun memory:update --reindex.")),
    ...[...have].filter((name) => !want.has(name)).map((name) => finding(usageFile, `entry for ${name}, which does not exist`, "Rerun memory:update --reindex.")),
  ];
  return { usage, findings };
};

const _lines = (text) => text.split("\n").filter((line) => line.startsWith("- "));

const _indexFindings = (files, usage, index) => {
  const indexFile = path.join(memoryDir, "index.md");
  if (index === null) return [finding(indexFile, "index.md is missing", "Rerun memory:update --reindex.")];
  const listed = files.filter(({ title, summary }) => title !== null && summary !== null);
  const now = new Date(args.now ?? Date.now());
  const expected = renderIndex({ files: listed, usage: usage ?? { version: 1, files: {} }, now });
  const fix = "index.md is generated: rerun memory:update --reindex.";
  if (!index.startsWith(FIXED_HEADER)) return [finding(indexFile, "the fixed header was changed", fix)];

  const have = _lines(index);
  const want = _lines(expected);
  const missing = want.filter((line) => !have.includes(line));
  const extra = have.filter((line) => !want.includes(line));
  const findings = [
    ...missing.map((line) => finding(indexFile, `missing or changed line: ${line.slice(0, 80)}`, fix)),
    ...extra.map((line) => finding(indexFile, `line for no memory file: ${line.slice(0, 80)}`, fix)),
    ...(missing.length + extra.length === 0 && have.length !== want.length ? [finding(indexFile, "a line is listed twice", fix)] : []),
  ];
  if (args.full && usage !== null && findings.length === 0 && index !== expected) {
    findings.push(finding(indexFile, "index.md differs from what the script generates (order, or text outside the list)", fix));
  }
  return findings;
};

const _piiFindings = (documents, identity) =>
  documents.flatMap(({ file, text }) =>
    scan(text, identity).map(({ kind, line }) =>
      finding(file, `personal data (${kind}) — shown by line only, never echoed`, "Remove it: the memory describes patterns, not people.", line),
    ),
  );

const _fullFindings = (files) => [
  ...files.flatMap(({ file, text }) =>
    citedDocs(text)
      .filter((cited) => !existsSync(path.join(ROOT, cited)))
      .map((cited) => finding(file, `cited path ${cited} does not exist`, "Correct the path, or report the doc as stale.")),
  ),
  ...(path.resolve(memoryDir) === path.resolve(repoMemory)
    ? []
    : OWNER_FILES.filter((name) => _read(path.join(memoryDir, name)) !== _read(path.join(repoMemory, name))).map((name) =>
        finding(path.join(memoryDir, name), `${name} differs from the repo's copy`, "Only the owner edits it: restore the repo's copy."),
      )),
];

const _check = () => {
  const reason = _skipReason();
  if (reason !== null) {
    console.log(`✅ ${NAME} — skipped: ${reason}`);
    return [];
  }
  let identity;
  try {
    identity = args.identity === null ? ownerIdentity(ROOT) : JSON.parse(args.identity);
  } catch {
    return [finding(memoryDir, "--identity is not valid JSON", "Pass an object such as {\"gitName\":\"…\"}.")];
  }
  const { files, strays } = readMemoryFiles(memoryDir);
  const { usage, findings: usageFindings } = _usageFindings(files);
  const indexFile = path.join(memoryDir, "index.md");
  const index = _read(indexFile);
  return [
    ...strays.map((name) => finding(path.join(memoryDir, name), "not a .md file: memories/ is flat", "Remove it.")),
    ...files.flatMap(_fileFindings),
    ...usageFindings,
    ..._indexFindings(files, usage, index),
    ..._piiFindings([...files, ...(index === null ? [] : [{ file: indexFile, text: index }])], identity),
    ...(args.full ? _fullFindings(files) : []),
  ];
};

report(`${NAME} (${args.full ? "full" : "stable"})`, [...badArguments, ...(badArguments.length === 0 ? _check() : [])]);
