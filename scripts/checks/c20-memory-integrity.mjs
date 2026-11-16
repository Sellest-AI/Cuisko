/**
 * C20 — the agent memory is well formed and holds no personal data (spec P5, §11.1).
 *
 * Two modes, because `pnpm verify` runs every check on every commit, and a cited `docs/` path dies
 * when a commit renames that doc, without anyone editing the memory. The rules are in
 * memory/_lib/factChecks.mjs.
 *
 *   stable (default)  each fact well formed · nothing misplaced · every usage file parses ·
 *                     personal data. What `pnpm verify` runs, so every commit gets the scan.
 *   --full            the stable rules, every cited `docs/` path present, README.md and
 *                     _template.md equal to the repo's. What memory:update runs on the dream's copy.
 *
 * The index is not checked: it is not in git, the session-start hook builds it.
 *
 * Arguments, never environment variables: run-all passes none, so verify gets the stable mode on
 * the real memory.
 *   --memory-dir <path>   the folder to check (default .claude/memory); `docs/` still resolves
 *                         against the repo root
 *   --identity <json>     tests only: replaces ownerIdentity(), so a test runs with a fixed one
 *
 * It skips, saying why, when the folder is absent or its fact files are ciphertext: that is CI,
 * and a clone without the key. `usage/` is plaintext and never stops the skip. The owner's
 * identity is read only after that skip.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { checkMemory, factsEncrypted } from "../memory/_lib/factChecks.mjs";
import { ownerIdentity } from "../memory/_lib/pii.mjs";
import { relative, report, ROOT } from "./_lib.mjs";

const NAME = "C20 agent memory integrity";

const _argsOf = (argv) => {
  const args = { full: false, memoryDir: null, identity: null, problems: [] };
  for (let at = 0; at < argv.length; at++) {
    const flag = argv[at];
    if (flag === "--full") args.full = true;
    else if (flag === "--memory-dir" || flag === "--identity") {
      const value = argv[++at];
      if (value === undefined) args.problems.push(`${flag} needs a value`);
      else args[flag === "--memory-dir" ? "memoryDir" : "identity"] = value;
    } else args.problems.push(`unknown argument ${flag}`);
  }
  return args;
};

const args = _argsOf(process.argv.slice(2));
const repoMemory = path.join(ROOT, ".claude", "memory");
const memoryDir = args.memoryDir === null ? repoMemory : path.resolve(ROOT, args.memoryDir);

const finding = ({ file, message, fix, line }) => ({ file: relative(file), line, message, fix });

/** Everything wrong with the arguments, as findings: a check that mis-parses its own flags must not pass. */
const badArguments = args.problems.map((message) => finding({ file: memoryDir, message, fix: "Use --memory-dir <path>, --full or --identity <json>." }));

const _skipReason = () => {
  if (!existsSync(memoryDir)) return "no memory folder here";
  return factsEncrypted(memoryDir) ? "the memory files are encrypted (CI, or a clone without MEMORY_KEY)" : null;
};

const _check = () => {
  const reason = _skipReason();
  if (reason !== null) {
    console.log(`✅ ${NAME} — skipped: ${reason}`);
    return [];
  }
  let identity;
  try {
    identity = args.identity === null ? ownerIdentity(ROOT) : JSON.parse(args.identity);
  } catch (error) {
    return [finding({ file: memoryDir, message: `--identity is not valid JSON (${error.message})`, fix: 'Pass an object such as {"gitName":"…"}.' })];
  }
  return checkMemory(memoryDir, { full: args.full, identity, root: ROOT, repoMemory }).map(finding);
};

report(`${NAME} (${args.full ? "full" : "stable"})`, [...badArguments, ...(badArguments.length === 0 ? _check() : [])]);
