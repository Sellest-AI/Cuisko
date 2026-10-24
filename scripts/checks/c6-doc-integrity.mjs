/**
 * C6 — the documentation still points at things that exist.
 *
 * The predecessor's docs asserted a module with ten exported functions that had never been
 * written, four hooks that did not exist, and a screen convention used zero times. None of it was
 * careless — it was written when it was true, or when it was intended, and nothing ever re-checked
 * it. An agent told to trust those docs writes code against an API that isn't there.
 *
 * This check is the missing re-read. It proves three things:
 *
 *   1. every relative link in a doc resolves (file, and heading anchor where given)
 *   2. every `pnpm <script>` a doc tells you to run exists in package.json
 *   3. every repo path a doc references in backticks exists on disk
 *
 * It cannot prove a doc's prose is true. It can prove the doc is not pointing at a ghost, which is
 * the failure mode that actually occurred.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { relative, report, ROOT } from "./_lib.mjs";

const findings = [];

/**
 * Paths the specification names before they are built.
 *
 * ARCHITECTURE.md is a spec: it defines the shape a layer must take as it lands, so it names
 * `src/lib/convex/api.ts` before that file exists. That is the point — a contract you cannot
 * write until after the code is a contract nothing was built against.
 *
 * The entry is what makes it deliberate rather than accidental, and this list is self-cleaning:
 * once the file lands, C6 fails until the entry is removed. So it can only ever shrink, and a
 * typo'd path is still caught because a typo is not in here.
 */
const PLANNED = new Set([
  "src/global/routes.ts",
  // docs/plans/web-recipe-search.md: built in its slices 5 and 6.
  "src/ui/hooks/useNow.ts",
  "convex/lib/posthog/captureException.ts",
]);

/* ── Which files to check ─────────────────────────────────────────────────────────────── */

const markdownIn = (dir) => {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return markdownIn(full);
    return entry.endsWith(".md") ? [full] : [];
  });
};

const docs = [
  ...markdownIn(path.join(ROOT, "docs")),
  ...[
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "convex/AGENTS.md",
    "src/ui/AGENTS.md",
    "src/modules/AGENTS.md",
  ]
    .map((f) => path.join(ROOT, f))
    .filter(existsSync),
];

const scripts = new Set(
  Object.keys(JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts ?? {}),
);

const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/**
 * GitHub lowercases, strips punctuation, and hyphenates spaces. It does NOT collapse runs, but
 * some renderers do — accept both so a heading with a dash in it is not a false positive.
 */
const anchorsOf = (text) => {
  const out = new Set();
  for (const [, heading] of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const stripped = heading.toLowerCase().replace(/[^\w\s-]/g, "");
    // GitHub hyphenates every space without trimming first, so a heading opening with an emoji
    // slugs with a leading hyphen. Other renderers trim and collapse. Accept all four so a
    // correct anchor is never reported as broken.
    for (const base of [stripped, stripped.trim()]) {
      out.add(base.replace(/\s/g, "-"));
      out.add(base.replace(/\s+/g, "-"));
    }
  }
  return out;
};

/* ── 1 + 2 + 3 ────────────────────────────────────────────────────────────────────────── */

for (const doc of docs) {
  const text = readFileSync(doc, "utf8");
  const file = relative(doc);

  /* 1 — relative links resolve, including their anchors. */
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:)/.test(target)) continue;

    const [rel, anchor] = target.split("#");

    // A bare `#anchor` points within this same file. Renaming a heading breaks these exactly as
    // easily as a cross-file link, and they are easier to forget.
    if (!rel) {
      if (anchor && !anchorsOf(text).has(anchor)) {
        findings.push({
          file,
          line: lineAt(text, match.index),
          message: `Anchor "#${anchor}" does not match any heading in this file.`,
          fix: "The heading was renamed or removed — update the anchor.",
        });
      }
      continue;
    }

    // Escaped underscores are a markdown artefact, not part of the path.
    const resolved = path.resolve(path.dirname(doc), rel.replace(/\\_/g, "_"));
    const at = { file, line: lineAt(text, match.index) };

    if (!existsSync(resolved)) {
      findings.push({
        ...at,
        message: `Link target does not exist: ${target}`,
        fix: "Fix the path, or delete the link if what it described is gone.",
      });
      continue;
    }

    if (anchor && resolved.endsWith(".md")) {
      if (!anchorsOf(readFileSync(resolved, "utf8")).has(anchor)) {
        findings.push({
          ...at,
          message: `Link anchor does not exist: ${target}`,
          fix: "The heading was renamed or removed — update the anchor.",
        });
      }
    }
  }

  // docs/_reference/ is a frozen audit of a DIFFERENT repository. Its paths and its commands
  // belong to that project, so checking them against ours would be meaningless — and "fixing"
  // a finding there would corrupt a historical record. Its internal links are still checked
  // above, because those do point within this repo.
  if (file.startsWith("docs/_reference/")) continue;

  /* 2 — every `pnpm <script>` a doc tells you to run is real. */
  for (const match of text.matchAll(/\bpnpm (?:run )?([a-z][a-z0-9:-]*)\b/g)) {
    const script = match[1];
    if (scripts.has(script)) continue;
    // `pnpm install` / `pnpm test -- <file>` style invocations of pnpm's own commands.
    if (["install", "add", "remove", "dlx", "exec", "why", "outdated"].includes(script)) continue;

    findings.push({
      file,
      line: lineAt(text, match.index),
      message: `Doc tells you to run "pnpm ${script}", which is not a script in package.json.`,
      fix: `Add the script, or correct the doc. Available: ${[...scripts].join(", ")}.`,
    });
  }

  /* 3 — backticked repo paths exist. Only paths that look like real files are considered. */
  for (const match of text.matchAll(/`((?:convex|src|app|scripts|shared|docs)\/[\w./-]+)`/g)) {
    const target = match[1];
    // Globs and directory-shaped references are contracts about where things go, not claims
    // that a file exists today.
    if (target.includes("*") || target.endsWith("/")) continue;
    if (!path.extname(target)) continue;
    if (existsSync(path.join(ROOT, target))) continue;
    if (PLANNED.has(target)) continue;

    findings.push({
      file,
      line: lineAt(text, match.index),
      message: `Doc references \`${target}\`, which does not exist.`,
      fix:
        "Correct the path, or — if the spec names it deliberately before it is built — add it to " +
        "PLANNED in scripts/checks/c6-doc-integrity.mjs.",
    });
  }
}

/* ── 4. PLANNED only ever shrinks ─────────────────────────────────────────────────────── */

for (const planned of PLANNED) {
  if (!existsSync(path.join(ROOT, planned))) continue;

  findings.push({
    file: "scripts/checks/c6-doc-integrity.mjs",
    message: `"${planned}" now exists but is still listed as PLANNED.`,
    fix: "Remove it from PLANNED — it is a real path now, and should be checked like one.",
  });
}

report("C6 documentation points at things that exist", findings);
