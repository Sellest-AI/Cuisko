import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const IGNORED_DIRS = new Set(["node_modules", "_generated", ".git", ".history", ".expo", "dist"]);

/** All files under `dir` matching `ext`, recursively. Returns absolute paths. */
export const listFiles = (dir, ext = ".ts") => {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // The directory does not exist yet — not an error, just nothing to check.
  }

  return entries.flatMap((entry) => {
    if (IGNORED_DIRS.has(entry)) return [];
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return listFiles(full, ext);
    return full.endsWith(ext) ? [full] : [];
  });
};

export const relative = (file) => path.relative(ROOT, file).split(path.sep).join("/");

/** Parses a file into a TypeScript AST with parent pointers set. */
export const parse = (file) =>
  ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

export const lineOf = (source, node) =>
  source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

/**
 * Prints findings and exits non-zero if there are any. Every check reports through here so the
 * output shape is identical across C1–C3.
 */
export const report = (checkName, findings) => {
  if (findings.length === 0) {
    console.log(`✅ ${checkName}`);
    return;
  }

  console.error(`\n❌ ${checkName} — ${findings.length} violation(s)\n`);
  for (const { file, line, message, fix } of findings) {
    console.error(`   ${file}${line ? `:${line}` : ""}`);
    console.error(`      ${message}`);
    if (fix) console.error(`      Fix: ${fix}`);
    console.error("");
  }
  process.exit(1);
};

export { ts };
