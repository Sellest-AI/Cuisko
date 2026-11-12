/**
 * One variable from `.env.local`, the file that holds this machine's secrets (`MEMORY_KEY`, the
 * `sellest-agent` App's key). It is never committed, so a worktree under .claude/worktrees/ usually
 * has none: the main checkout's file is read after the checkout's own.
 *
 * Only `node:` builtins are imported: `setup.mjs` runs from `pnpm install`, before anything else is
 * guaranteed to be linked.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** The value of `name` in one dotenv file, or null when the file or the variable is absent or empty. */
const _readOne = (file, name) => {
  if (!existsSync(file)) return null;
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*?)\\s*$`);
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (!match) continue;
    const value = match[1].replace(/^(["'])(.*)\1$/, "$2");
    return value === "" ? null : value;
  }
  return null;
};

/**
 * `name` from `<root>/.env.local`, else from `<mainRoot>/.env.local`; null when neither has it.
 *
 * @param {string} name a variable name, `[A-Z0-9_]` only
 * @param {{ root: string, mainRoot: string }} where the checkout's root, and the main checkout's
 */
export const readLocalEnv = (name, { root, mainRoot }) => {
  if (!/^[A-Z0-9_]+$/.test(name)) throw new Error(`readLocalEnv: not a variable name: ${name}`);
  return _readOne(path.join(root, ".env.local"), name) ?? (mainRoot === root ? null : _readOne(path.join(mainRoot, ".env.local"), name));
};
