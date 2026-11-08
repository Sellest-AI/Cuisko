---
slice: agent-memory
branch: chore/agent-memory
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# Agent memory

After this lands, every Claude Code session on this repo opens knowing what earlier sessions
learned, and that knowledge is written only by a reviewed, encrypted "dream" run at push time.

**The specification is the owner's document "Architecture mémoire agent" (2026-11-08), kept outside
the repo at C:\Users\Franck\Downloads\Architecture mémoire agent.md.** Section numbers below (§6.2,
U4, P5…) are that document's. This plan does not restate it: it maps it onto this repo, and lists
every place where the repo forced a change (§2). Its §17 "Décisions écartées" stays closed:
nothing below reopens one.

The build runs in this session, on this machine, where the spec is readable. It does not survive
landing: what must outlive it goes into code and one ADR. The docblock of update.mjs describes
U1–U11 and P1–P7 step by step, each `_lib/` module's docblock names the spec section it
implements, and ADR 0021 keeps the rules (§ Landing).

---

## 1. Problem

**What is broken or missing.** Each session starts from zero. What the owner corrected, decided or
discovered lives in Claude Code's per-user auto memory (one folder per project under the user's
home, unreviewed, unversioned, written by the session agent itself) or is lost. Nothing checks a
remembered fact against the code, and nothing reaches a second machine.

**How we would know it worked.**

- A new session's context contains the first 200 lines of the memory index (observable in the
  SessionStart output).
- A push of dev with an unread finished session is refused, with the spec's §8.2 message; after the
  dream run and its commit, the same push passes.
- On GitHub, every file under the encrypted memory paths starts with the transcrypt header; on disk
  it is plain text.
- The session agent cannot write memory: a Write or Edit on index.md, usage.json or memories/ is
  denied (README.md and _template.md stay hand-editable), and a commit touching those three
  outside the dream is refused.
- The deterministic parts (selection, stamps, usage, index, C20, PII scan, hooks) are covered by
  Vitest without calling a model.

**Product fit.** Tooling, not product: no screen, no Convex change, PRODUCT.md's tests do not apply.

**Out of scope.**

- The app, Convex, `env.ts` (spec §3).
- Running a paid dream. Slice 8's end-to-end dry run calls Haiku and Opus: the owner runs it; the
  build hands over the command (owner rule: paid runs are never launched by an agent).
- Migrating the existing auto-memory notes. The owner rewrites them by hand once the system is in
  place (Q2). A Claude session can draft them, but only outside memories/ (the deny rules); the
  owner copies them in, runs the reindex command (§3) and commits with MEMORY_UPDATE=1. No import
  code is built.
- Cloud sessions and claude.ai conversations (spec §16).

---

## 2. Architecture

No tables, no router, no cascade: none. No existing app data is touched. **Existing data** that
does matter is listed at the end of this section.

**Flow** — the spec's §2 diagram, unchanged: SessionStart reads → session signals with a
"Mémoire :" line → pre-push checks → the owner runs the dream → diff and choice → memory commit →
second push.

**Where each spec component lands** (repo conventions decide the paths; the spec's names were
proposals):

| Spec component | Here | Why it moved |
| --- | --- | --- |
| Flat scripts/memory/*.mjs | entry scripts at the top of the scripts/memory folder, pure logic in its `_lib/` subfolder, tests in its `__tests__/` | the shape `scripts/release/` already uses: kebab entries, camelCase `_lib/`, tested logic |
| index.mjs | memoryIndex.mjs | an `index` file reads as a barrel everywhere else in the repo |
| c14-memory-integrity.mjs | c20-memory-integrity.mjs | `c14-household-atoms.mjs` exists; the series ends at C19 |
| `.git/dream-stamps.json` | the same file, located with `git rev-parse --git-common-dir` | a session in a worktree under `.claude/worktrees/` has a `.git` *file*; the common dir is the main `.git/`, so every worktree shares one stamps file |
| A second SessionStart script | yes, a second entry beside `.claude/hooks/session-start.mjs` | the docs allow several entries (they run in parallel); the existing hook's JSON envelope stays as it is |

**What the docs and the real transcripts settled** (the spec's "à vérifier", checked on 2026-11-08
against code.claude.com and against this machine's own transcripts):

| Spec assumption | Verified | Consequence |
| --- | --- | --- |
| `autoMemoryEnabled: false` in project settings | yes, any settings file; env alternative `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` | as specified |
| `permissions.deny` with `Edit(path)` and `Write(path)` | **`Write(path)` rules match nothing**; an `Edit(path)` rule covers Edit, Write, NotebookEdit, MultiEdit. In project settings a leading `/` anchors at the project root, `//` is filesystem-absolute | three rules, on exactly what the dream owns: `Edit(/.claude/memory/index.md)`, `Edit(/.claude/memory/usage.json)`, `Edit(/.claude/memory/memories/**)`. README.md and _template.md stay editable, as the spec's lock already treats them |
| SessionStart on startup, resume, compact; stdout becomes context | yes; matchers are startup, resume, **clear**, compact, fork | matcher `startup\|resume\|clear\|compact`: after /clear the context is empty too (Q4) |
| `claude -p` can run a given agent definition | `--agent <name>` runs `.claude/agents/<name>.md` as the main thread, with its `model` and `tools` | no fallback needed |
| `claude -p` limited to read, `git log`, and writes in one folder | `--permission-mode dontAsk` denies every call that would prompt; `--allowedTools` with `Read(//<repo>/**)`, `Bash(git log *)` (space before `*`), `Edit(//<abs dream dir>/memory/**)`; `--output-format json --json-schema <schema>` | exact flag set is confirmed in slice 7 against the installed CLI |
| `cleanupPeriodDays` readable, 0 disables | default 30, minimum 1; **0 is a validation error**, not "delete all" | setup still refuses 0 and warns below 30 |
| JSONL lines carry `cwd`, `gitBranch`, `timestamp`, `sessionId`, `uuid` | yes, on `user` and `assistant` lines (undocumented, internal format) | parser keyed on those; a missing field skips the line, never crashes |
| Tool results are `user` lines with `tool_result` blocks, not distinguishable | **they are distinguishable**: such lines also carry `toolUseResult` and `sourceToolAssistantUUID` | condensation drops tool results by that marker (spec §6.4's intent, done reliably). No new rule on facts — §17 stays closed |
| Sessions live in one project folder | **each worktree session has its own folder** (83 of the 90 cuisko folders on this machine); the main one is spelled `c--Users-…` with a lowercase drive letter, while `cwd` reads `C:\Users\…` | discovery scans every project folder whose name starts with the encoded repo root, case-insensitively; condition 1 then filters on `cwd`, normalised (backslashes to slashes, case-insensitive on Windows). `cuisko-web` matches the folder prefix and is dropped by the `cwd` test |
| Lines are messages | a transcript also holds `api-request-blob` lines that **repeat message content**, plus attachment, queue-operation, custom-title… | only `user` and `assistant` lines count, for selection and for read counting; otherwise every read is counted twice |
| Session reads come from Read, Bash, Grep | on Windows the agent also reads with the `PowerShell` tool, and through context-mode's `ctx_execute_file` (`path` input) | read counting covers Read, Grep, Bash, PowerShell, `mcp__plugin_context-mode_context-mode__ctx_execute_file` |
| Subagent transcripts | stored under the session folder in a `subagents` folder | not selected and not counted (see Least confident) |
| Desktop sessions write transcripts | yes (this session's own file) | — |
| `git revert` passes the pre-commit lock via `REVERT_HEAD` | tested on git 2.39: a **clean revert does not run pre-commit at all**; a conflicted revert does, with `REVERT_HEAD` present | both pass |
| A merge passes the lock via `MERGE_HEAD` | tested: a **clean merge runs `pre-merge-commit` with no `MERGE_HEAD`** — and this repo's `pre-merge-commit` execs `pre-commit`, so `$0` there is still `pre-commit`. A conflicted merge's commit does see `MERGE_HEAD` | `.githooks/pre-merge-commit` exports `GIT_HOOK_NAME=pre-merge-commit` before its exec, and the lock passes on it; without that, the U2 pull of a memory commit made on another machine is refused. State files are found with `git rev-parse --git-path`, never a literal `.git/…`, so a worktree (whose `.git` is a file) sees them too. `CHERRY_PICK_HEAD` does **not** pass: memory commits belong on dev, and copying one onto a feature branch is refused |

**Other places the repo disagrees with the spec:**

- **commitlint refuses the trailer.** `Memory-Update: yes` is a footer-shaped line, and
  `commitlint.config.js` only lets through the tokens in its `FOOTER_TOKENS` list.
  `memory-update` is added there. The body that lists created, modified and deleted files uses
  lines like "- creates memories/upload.md", never "Created: …" (the same rule).
- **C20 runs in `pnpm verify` and in CI, so it is split in two.** `scripts/checks/run-all.mjs`
  runs every `c<n>-*.mjs` it finds, with no opt-out. Two of P5's rules cannot hold in verify: the
  index order depends on today's date (grace period, decay), and a cited docs/ path breaks when a
  commit renames that doc, while the committer may not edit memory. So:

  | Mode | When | Rules |
  | --- | --- | --- |
  | stable (default) | every `pnpm verify`, hence every commit | PII scan · front matter · source-date format · links between memory files · usage.json has one entry per memory file · index.md lists exactly the memory files, each with its title and summary, **in any order** |
  | full (`--full` argument) | P5 inside memory:update, on the dream's copy | the stable rules · index.md byte-identical to `renderIndex` at the dream's `now` · every cited docs/ path exists · README.md and _template.md unchanged |

  In both modes C20 skips, printing why, when the memory files are encrypted (they start with the
  transcrypt header) or the folder is absent: that is CI. Locally the stable mode is the PII scan
  the spec asks the pre-commit to run (§11.1), since the pre-commit runs verify. A docs/ path that
  died between dreams is caught at the next dream's P5, and the planner sees it as a docsIssue.
- **C20's target.** Checks take their repo root from `CHECK_ROOT`. C20 also takes a
  `--memory-dir <path>` argument (default: the repo's `.claude/memory`), so the dream points it at
  its working copy while `docs/` paths still resolve against the repo. "README and template
  unchanged" compares that folder's copies with the repo's. Arguments, not environment
  variables: `run-all.mjs` passes none, so verify always gets the stable mode on the real memory.
- **Few variables, none persistent.** The design keeps four environment variables, each living
  for one command: MEMORY_KEY (in `.env.local`, a file), MEMORY_SKIP (typed by the owner before a
  push, spec §8.3), MEMORY_UPDATE (set by update.mjs for its own commit: the only channel from the
  script to the hook through `git commit`), GIT_HOOK_NAME (set by one hook for the next). The
  spec's MEMORY_DREAM is dropped: a SessionStart hook receives the session's `cwd` on stdin, and a
  `cwd` under `<repo>/.tmp/memory/` is a dreamer. On Windows that `cwd` reads
  `C:\Users\…\.tmp\memory\dream-<stamp>`, so a bare substring test never matches. The test is
  `isDreamCwd(cwd, root)` in the transcripts module (scripts/memory/_lib/transcripts.mjs), beside the normaliser
  condition 1 already uses (backslashes to slashes, case-insensitive on Windows): it compares the
  normalised `cwd` against the normalised `<root>/.tmp/memory/`, a prefix of the repo root, never
  a substring. The hooks in `.claude/hooks/` import it by relative path: one copy, for the
  transcripts and the hooks.
- **Personal data: masked before any model reads it, refused after (spec §11.1).** The plan
  builds the spec's five layers, and adds one mask the spec's regexes cannot do:

  | Layer | When | What happens |
  | --- | --- | --- |
  | 1. `mask` in condense and excerpts | before a transcript enters any prompt | an email becomes `[email masked]`, a phone `[phone masked]`, a key or token `[secret masked]`, the owner's identity `[owner]` (below). The dreamers never see the raw value, so they cannot copy it |
  | 2. README rule, P2 and P4 | while the agents write | "Never record personal data: names, emails, phones, identifiers, secrets. Describe the pattern, not the person" ("a user hit a CSV export bug", not who) |
  | 3. C20 full, P5 | before the diff is shown | `scan` on the working copy; a hit is an error, and the dream stops there |
  | 4. Reviewer, P6 | before the diff is shown | flags what a regex misses: a name, an address, a customer's recipe quoted as theirs |
  | 5. C20 stable, in `pnpm verify` | every commit, including the `[m]` edits and a hand edit | `scan` on the plaintext working copy, never the git index (encrypted); a hit refuses the commit |

  **The owner's identity mask.** Transcripts carry the owner's identity in every path
  (`C:\Users\<name>\…`) and in git output (author name and email). No regex knows those, so
  `mask` takes them as input: the OS user name, the home directory, and `git config user.name` /
  `user.email`, read at run time and never written anywhere. A home path becomes `~`
  (`C:\Users\<name>\Documents\…\cuisko\src\x.ts` → `~/Documents/…/cuisko/src/x.ts`, and the repo
  root itself becomes `<repo>`), and the name or email alone becomes `[owner]`. Layer 3 and 5 scan
  for the same values, so one that slips past the mask still blocks.
  - *Where each value matches.* The git name and email match as free text (case-insensitive,
    NFC-normalised). The OS user name matches **only in path context**, never as a free word:
    after `Users/` or `home/` in every spelling a transcript holds (`C:\Users\`, `C:\\Users\\` in
    quoted strings, `c:/users/`, `/c/Users/` from Git Bash, `/home/`) and in Claude's project-folder
    form `C--Users-<name>-`. An account called `dev` then never masks "commit on dev".
  - *A missing value is dropped, never fatal.* `ownerIdentity()` never throws: an unset
    `git config` key (exit 1), an empty string or a value under 3 characters is left out, since an
    empty alternative would match everywhere. All four missing → masking falls back to the
    email, phone and secret patterns.
  - *C20 reads it after its skip.* In CI (memory encrypted or absent) C20 exits before reading any
    identity. Its tests pass a fixed one with `--identity <json>` (§3), so they never
    depend on who runs them.

  **What no layer catches:** a name nobody can list ahead (a tester's first name typed in a
  message). Layers 2 and 4 are the net, then the owner's diff. Git keeps whatever is committed,
  even encrypted (spec §11.4), which is why masking happens first, not at commit.
- **`.tmp/`** is added to `.gitignore`, to ESLint's `ignores`, to knip's `ignore`, to Vitest's
  `AUTOMATIC_EXCLUDE`, and to `IGNORED_DIRS` in `scripts/checks/_lib.mjs` — the same places the
  worktrees folder already appears.
- **knip** sees the two package.json scripts as entries, not the scripts the git hooks run. The
  pre-push and pre-commit entry scripts are added to `entry`.
- **The C1–C19 range** appears in `AGENTS.md` (3×), `.githooks/pre-commit`, `docs/ARCHITECTURE.md`,
  `docs/CONVENTIONS.md`, `docs/adr/0008-tests-are-layered.md` (2×) and an `eslint.config.js`
  comment. All become C1–C20 in the slice that adds C20.
- **The Stop hook** (`.claude/hooks/stop-checks.mjs`) lists its checks by hand; C20 is not added
  (memory changes only in the dream, never mid-turn).
- **The memory commit is made directly on dev.** The pre-commit header says nothing is committed on
  dev or main directly, and AGENTS.md assumes branches. The `chore(memory)` commit of U9 is a
  deliberate exception: the dream runs on the branch about to be pushed. ADR 0021 records it, so a
  later review does not flag memory commits on dev.
- **The lock is a guard rail, not a boundary against the agent.** A session agent can type
  `MEMORY_UPDATE=1 git commit` in Bash, as it can type `--no-verify`. The lock catches mistakes,
  not intent; the encryption workflow and the owner's diff are the real gates. To keep the variable
  from becoming a second `--no-verify`, a commit carrying MEMORY_UPDATE=1 is refused if any staged
  path lies outside .claude/memory.
- **No ADR covers** `scripts/**`, `.githooks/**` or `.claude/**`. The decision worth keeping —
  memory is written only by the dream, encrypted, and reviewed — becomes ADR 0021 at landing, with
  its Verify: the pre-commit lock, C20, and the encryption workflow.

**Memory language: English (Q1).** The repo is English, so everything the spec writes in French
inside the memory becomes English. The spec's structure is unchanged; only the words move.

| Spec (French) | Here |
| --- | --- |
| `## Faits`, `## Liens` | `## Facts`, `## Links` |
| `Hypothèse : …` | `Hypothesis: …` |
| `(source : 2026-11-08)`, `(source : correction du 2026-11-08)` | `(source: 2026-11-08)`, `(source: correction of 2026-11-08)` |
| C20's date regex | `\(source: (correction of )?\d{4}-\d{2}-\d{2}\)$` |
| Index fixed header, README.md, _template.md | English |
| The two AGENTS.md lines | "Your memory is in .claude/memory/ and is read-only for you: it is updated after the session, from the conversation. Start by reading index.md." · "If you learn something worth keeping, say it in your reply, on one short line starting with `Memory:`. Never write it to a file." The owner's wording: "in your reply" so "write" never reads as "write a file", and the first line says why |
| The signal `Mémoire :` | `Memory:` — the detector also accepts `Mémoire :`, because the owner talks to the agent in French. It NFC-normalises the line (ADR 0011's rule), strips leading Markdown (`- `, `> `, `**`, `_`), then matches `/^(Memory\|Mémoire)\s*\**\s*:/u`, where `\s` covers the no-break spaces French typography puts before a colon |
| Hook, pre-push and memory:update messages (§8.2, U11…) | English |

**Existing data.**

- **The current auto memory** (about 45 notes in this project's auto-memory folder under the
  user's home) stops being written once `autoMemoryEnabled` is false. The owner rewrites the notes
  worth keeping by hand, after landing (§1 Out of scope). Until then they stay on disk, unread.
- **Transcripts older than setup** are never read (`initializedAt`, spec §7.6).
- **Other clones and worktrees.** A worktree branch made before this lands has no memory folder
  and no hooks change until it merges dev; nothing breaks. 83 of the 90 cuisko transcript folders
  are worktree sessions, so a worktree must see the memory decrypted. transcrypt's filters live in
  the shared git config, so a worktree checkout should smudge to plain text; slice 1 checks it once
  on a real worktree, and §4 says what happens if it does not.

**Cost and limits.** Each dream calls Haiku once per session, Opus twice, and the writer once per
file, at most four at a time (spec §10.2). Nothing is called by verify, the hooks or CI. Model ids
are pinned in each agent definition as full ids, never aliases (the two existing agents use
`opus` and `sonnet`, which drift with each release): `claude-haiku-5-5` extracts,
`claude-opus-5-5` plans and reviews, `claude-sonnet-5-5` writes (Q5) — the writer works from
cited excerpts, and Opus checks it after.

---

## 3. Program design

**Reuses.** `scripts/checks/_lib.mjs` (`ROOT`, `listFiles`, `relative`) for C20;
`scripts/checks/__tests__/_harness.ts` (`makeTree`, `cleanupTrees`) for C20's tests; Zod (already
a dependency). The `git` wrapper in `.claude/hooks/_lib.mjs` is hook-local: the memory scripts get
their own in `_lib/`, since the pre-push needs failures to throw, not to read as empty. No other
transcript, stamp or PII code exists to reuse.

**Files created or changed:**

```
+ .claude/memory/README.md                     rules for the dreamers (spec §4.5), plain
+ .claude/memory/_template.md                  memory file format (spec §4.2), plain
+ .claude/memory/index.md                      fixed header only, encrypted
+ .claude/memory/usage.json                    {"version":1,"files":{}}, encrypted
+ .claude/hooks/session-start-memory.mjs       prints the first 200 lines of the index
+ .claude/agents/dream-extractor.md            model: claude-haiku-5-5 (P2)
+ .claude/agents/dream-planner.md              model: claude-opus-5-5 (P3)
+ .claude/agents/dream-writer.md               model: claude-sonnet-5-5 (P4, [m])
+ .claude/agents/dream-reviewer.md             model: claude-opus-5-5 (P6)
○ .claude/settings.json                        autoMemoryEnabled false, the three Edit denies, second SessionStart
                                               entry with matcher startup|resume|clear|compact
○ .claude/hooks/session-start.mjs · stop-checks.mjs   only if slice 7's check fails: return early when the
                                               hook input's cwd passes isDreamCwd (transcripts.mjs)
+ .githooks/pre-push                           sh → node scripts/memory/pre-push.mjs
○ .githooks/pre-commit                         memory lock before verify; C1–C20 in its header
○ .githooks/pre-merge-commit                   export GIT_HOOK_NAME=pre-merge-commit before the exec
+ scripts/memory/setup.mjs                     memory:setup (spec §13.2)
+ scripts/memory/update.mjs                    memory:update, U1–U11, --dry-run, --reindex, finishes a pending commit
+ scripts/memory/pre-push.mjs                  spec §8.1
+ scripts/memory/pre-commit.mjs                lock: exits 1 with the reason, 0 otherwise
+ scripts/memory/_lib/git.mjs                  git(...args) → string, throws on failure
+ scripts/memory/_lib/transcripts.mjs          discovery, parsing, selection (§6.1–6.3)
+ scripts/memory/_lib/condense.mjs             §6.4
+ scripts/memory/_lib/stamps.mjs               Zod schema, read, atomic write, migrate (§7)
+ scripts/memory/_lib/usage.mjs                Zod schema, read counting (§4.4, §10.8)
+ scripts/memory/_lib/memoryIndex.mjs          score, order, render (§4.3, §10.8)
+ scripts/memory/_lib/pii.mjs                  scan and mask (§11.1)
+ scripts/memory/_lib/runAgent.mjs             one claude -p call, its log, Zod-validated reply
+ scripts/memory/_lib/responses.mjs            Zod schemas of the four replies (§10.4)
+ scripts/memory/__tests__/*.test.ts           one per _lib file, plus pre-push and pre-commit
+ scripts/memory/__tests__/fixtures/*.jsonl    the fake transcripts of spec §14
+ scripts/checks/c20-memory-integrity.mjs      P5
+ scripts/checks/__tests__/c20-memory-integrity.test.ts
○ scripts/checks/__tests__/_harness.ts         runCheck gains an optional `args: string[]`, passed to the
                                               script after its path; existing callers unchanged
+ .github/workflows/memory-encryption.yml      fails on a plaintext memory file
○ .gitattributes                               three crypt patterns (spec §11.2)
○ .gitignore · eslint.config.js · knip.jsonc · vitest.config.mts · scripts/checks/_lib.mjs   .tmp/
○ .env.example                                 MEMORY_KEY= under "Local only"
○ package.json                                 memory:setup, memory:update (node, no tsx); `prepare` gains
                                               `&& node scripts/memory/setup.mjs --auto`
○ commitlint.config.js                         memory-update in FOOTER_TOKENS
○ AGENTS.md                                    the two memory lines (§2 Memory language); C1–C20
○ docs/ARCHITECTURE.md · docs/CONVENTIONS.md · docs/adr/0008-tests-are-layered.md   C1–C20
```

**Signatures** — the seams between the `_lib/` modules, which the entry scripts and the tests
write against. Paths are POSIX, repo-relative, dates ISO-8601 UTC.

```js
// transcripts.mjs
findTranscripts({ projectsDir, repoRoot }) → string[]          // absolute .jsonl paths, subagents excluded
readLines(file) → Line[]                                       // user/assistant lines only
// Line = { uuid, sessionId, timestamp, cwd, branch, role: "user"|"assistant",
//          isToolResult: boolean, text: string, toolCalls: { name, input }[] }
openBranches({ pushedSha, pushedRef }) → Set<string>           // §6.3
referenceDate(pushedSha) → string                              // §6.2 condition 4
select({ lines, repoRoot, openBranches, stamps, referenceDate }) → Line[]   // the four conditions
countSessions(lines) → number                                  // distinct sessionIds (§1)

// condense.mjs
condense(lines) → { sessionId, text: string, signaled: boolean }   // tool calls one line each,
                                                                   // results dropped, PII masked
excerpts(lines, candidateIds, contextLines = 3) → string

// stamps.mjs
stampsPath() → string                                          // <git common dir>/dream-stamps.json
readStamps() → Stamps                                          // throws StampsError (missing | invalid)
writeStamps(stamps) → void                                     // temp file + rename; on EPERM/EBUSY
                                                               // (Windows, another reader) retries 5× over
                                                               // 1 s, then throws and leaves the old file whole
acquireDreamLock() → release()                                 // <git common dir>/dream.lock holding the pid;
                                                               // a lock whose pid is dead is taken over
recordReview(stamps, { selected, openBranches, outcome, run, readsCountedUntil? }) → Stamps   // §7.5, pure
pruneStamps(stamps, exists = fs.existsSync) → Stamps           // §7.7, pure

// usage.mjs
readUsage(dir) → Usage · writeUsage(dir, usage)
countReads({ lines, memoryFiles, since, until }) → Map<path, { reads, lastRead }>   // Read, Grep, Bash, PowerShell, ctx_execute_file
applyReads(usage, counts) → Usage · syncFiles(usage, memoryFiles, today) → Usage    // create / drop entries

// memoryIndex.mjs
GRACE_DAYS = 30 · HALF_LIFE_DAYS = 30 · FIXED_HEADER: string
score(entry, now) → number
renderIndex({ files: { path, title, summary }[], usage, now }) → string             // deterministic

// pii.mjs
ownerIdentity() → { userName?, home?, gitName?, gitEmail? }     // read at run time, never stored;
                                                               // never throws; unset, empty or <3 chars dropped
scan(text, identity) → { kind: "email"|"phone"|"secret"|"owner", match, line }[]
mask(text, identity) → string                                  // [email masked] · [phone masked] ·
                                                               // [secret masked] · [owner] · home → ~

// runAgent.mjs
runAgent({ agent, prompt, schema, cwd, writableDir, logDir }) → Promise<object>    // throws AgentError with the log path

// Entry scripts
pre-push.mjs    stdin as git gives it; MEMORY_SKIP; exit 1 + §8.2 message
pre-commit.mjs  exit 1 when a staged path is under index.md, usage.json or memories/
                and none of: MEMORY_UPDATE=1, MERGE_HEAD, REVERT_HEAD (both via --git-path),
                GIT_HOOK_NAME=pre-merge-commit;
                exit 1 when MEMORY_UPDATE=1 and a staged path lies outside .claude/memory;
                when a pending.json exists, the refusal says "a dream commit is pending: rerun
                memory:update" instead of the generic reason
update.mjs      [--dry-run]   holds acquireDreamLock() from U1 to U11
                [--reindex]   syncs usage.json with memories/ and regenerates index.md: no pull, no
                              dream, no commit, no stamps. For hand-written memory files (Q2)
                              before the owner commits them. Holds acquireDreamLock(), refuses
                              while a pending.json exists, and runs C20's stable rules on its
                              result, naming any file without a title or summary
                pending commit: if U9's commit fails, the dream dir is kept with pending.json
                              (branch, base: the commit the dream started from, selected pairs,
                              outcome, readsCountedUntil, commit message). At retry, U1 refuses if
                              .claude/memory at HEAD differs from .claude/memory at base (a pull,
                              or a hand-written file committed with --reindex, changed it): the
                              copy is stale, and the owner reruns the dream after deleting the
                              pending dream dir, as the message says. The source of truth is the dream dir's own working copy
                              (.tmp/memory/dream-<stamp>/memory), never the git index, which the
                              owner may stash, restore or commit through. The next run sees
                              pending.json at U1, refuses on any branch other than the recorded
                              one, mirrors the copy into .claude/memory again (as U6), skips
                              U2–U8, and retries U9–U11 only
pre-push block message (English, Q1/Q3; <update> is the full memory:update command, which C6
would refuse here before package.json has it):
  💭 3 unread Claude sessions on dev (last dream: 3 days ago, accepted).
     Run:  <update>
  with no lastRun yet (the first push after merge, which Q3 blocks), the parenthesis reads
  "(no dream yet)"; with lastRun failed, "(last dream: 2 hours ago, failed)"
     Then: git push
     (If the dream cannot run: MEMORY_SKIP=1 git push)
setup.mjs       [--reset-stamps]
                [--auto]  run by `prepare`, i.e. by every `pnpm install` (the owner asked: no extra
                          command on a new machine). Idempotent and quiet: a step already done
                          (transcrypt configured, stamps present) is skipped without output. It
                          never fails the install, whatever happens: it exits 0 and prints one
                          line saying what is missing ("memory: add MEMORY_KEY to .env.local, then
                          rerun pnpm install"). It does nothing at all, silently, when CI or
                          EAS_BUILD is set (GitHub Actions and EAS builds run pnpm install too)
                          or outside a git work tree. It never asks a question; --reset-stamps is
                          refused with --auto. "Whatever happens" includes a failed import: an ESM
                          static import fails before any top-level try runs, so setup.mjs imports
                          only node: builtins statically and loads its _lib modules (stamps.mjs and
                          Zod with it) with a dynamic import() inside the try
                without --auto: the same steps, loud, exit 1 on a missing prerequisite; it
                          also checks the claude command, which --auto skips (a machine that only
                          builds the app would get a line on every install)
                learned in slice 1, against transcrypt 2.3.2:
                · the init writes a helper pre-commit into core.hooksPath, our versioned
                  .githooks/: setup points core.hooksPath at <git common dir>/crypt/hooks for that
                  one command (GIT_CONFIG_COUNT), so .githooks/ never gets an untracked file
                · the init refuses a dirty tree; its check guards only the forced re-checkout of
                  the encrypted files, so setup passes --force and refuses by itself when a
                  tracked file under .claude/memory has uncommitted changes
                · on Windows, `bash` on PATH is WSL's: setup uses Git for Windows' bash (three
                  levels above `git --exec-path`) and passes paths as /c/…, which transcrypt's
                  own realpath needs
                · the stamps step (spec §13.2 step 6) lands with stamps.mjs in slice 3, the
                  settings check (step 7) with the settings in slice 2
                settings check (slice 2): .claude/settings.json must hold autoMemoryEnabled false,
                          the three Edit denies and a SessionStart entry with the memory matcher
                          running session-start-memory.mjs. A gap is a missing item: one line naming
                          every gap with --auto, exit 1 by hand. A missing or invalid file is one too
c20             [--memory-dir <path>] (default .claude/memory) [--full]; CHECK_ROOT as every check
                [--identity <json>]  tests only: replaces ownerIdentity(), so the test runs the real
                          entry with a fixed identity; run-all passes none, so verify reads the real one
```

**The dream's `claude -p` call** (one per agent run, built by `runAgent`):

```
cwd   .tmp/memory/dream-<stamp>/          → its transcript is excluded by condition 1
                                          → session-start-memory reads that cwd from its input,
                                            isDreamCwd matches it, and it prints nothing
claude -p --agent <name> --permission-mode dontAsk
  --allowedTools    "Read(//<repo>/**)" "Grep(//<repo>/**)" "Glob(//<repo>/**)" "Bash(git log *)"
                    "Edit(//<repo>/.tmp/memory/dream-<stamp>/memory/**)"
  --disallowedTools "Read(//<repo>/**/.env*)" "Read(//<repo>/.git/**)" "Bash(git log *--output*)"
                    "Grep(//<repo>/**/.env*)" "Grep(//<repo>/.git/**)"
  --output-format json --json-schema <schema of that agent's reply>
```

The `**/` prefix also covers the copies of `.env.local` in worktrees under `.claude/worktrees/`,
which `Read(//<repo>/**)` reaches when the dream runs from the main checkout.
The denies keep the transcrypt password (in `.env.local` and in the git config) and every other
local secret out of the model's context and out of the dream's own transcript. A Read deny also
blocks Edit on the same path. `git log --output=<file>` would write anywhere: it is denied by
pattern. The remaining risk is a secret that sits in a tracked file; the PII scan's secret shapes
and the owner's diff are the net there.

**Slice 7 checks, against the installed CLI, before any agent is wired:**

1. From cwd `.tmp/memory/dream-<stamp>/`, `--agent dream-extractor` finds the repo's
   `.claude/agents/` (project resolution walks up to the git root).
2. The transcript of that call records that cwd, so condition 1 excludes it.
3. Whether the repo's settings and hooks load there; whether `--setting-sources user` plus an
   explicit `--settings` keeps the Stop and SessionStart hooks out without losing `--agent`.
4. The deny rules above refuse a Read of `.env.local`, of a worktree's `.env.local`, and the
   command `git log --output=<file>`, in that call.
5. Each pinned `model:` id resolves: one trivial `claude -p --agent <name>` call per agent,
   before any agent is wired (the owner runs it; it is a paid call, however small).

Fallbacks: if (1) fails, pass the agent file as `--system-prompt` with `--model`. If the
`--output` pattern does not match, the dreamers get no Bash at all: the script runs
`git log -p` on the memory files it names and puts the history in the prompt. If (2) fails,
the reply's `session_id` (JSON output) is recorded in the stamps as a dreamer session and excluded
by id. If (3) cannot keep the hooks out, both hooks return early when their input's `cwd` passes
`isDreamCwd`.

**Tests** — all under the `scripts` Vitest project, no model called.

```
transcripts.test.ts   fixtures of spec §14: merged branch kept · open branch dropped · deleted and
                      renamed branch kept · branch switch judged per line · line after the reference
                      date dropped · cuisko-web cwd dropped · .tmp cwd dropped · Windows cwd with
                      backslashes and another drive-letter case kept · api-request-blob line ignored ·
                      line with a missing field skipped · worktree project folder discovered ·
                      isDreamCwd: `c:\Users\…\cuisko\.tmp\memory\dream-x` with root `C:/Users/…/cuisko`
                      → true · `…\cuisko-web\.tmp\memory\…` → false · `…\cuisko\src\.tmp\memory` → false
stamps.test.ts        missing → StampsError("missing") · invalid → StampsError("invalid") naming the
                      reset command · version 0 migrated · reviewedUntil never moves back · null never
                      replaces a value · open-branch pair created with null · prune drops a missing
                      transcript · write is atomic (no partial file after a thrown write) · a rename
                      failing with EPERM is retried, then throws with the old file whole · a second
                      acquireDreamLock fails while the first holds it · a lock with a dead pid is taken
condense.test.ts      tool result dropped · tool call is one line · signal marked in each form:
                      "Memory:", "Mémoire :", "Mémoire :", "Mémoire :", "**Memory:**",
                      "- Memory:", "> Mémoire :", a decomposed "é" · "memory:" mid-sentence is not ·
                      email masked
usage.test.ts         Read, cat in Bash, Get-Content in PowerShell, Grep, ctx_execute_file each count once ·
                      api-request-blob copy not counted · dreamer session not counted · created/deleted sync
memoryIndex.test.ts   grace first, newest first · decay halves at 30 days · tie broken by title ·
                      same input twice → same bytes
pii.test.ts           email, phone (FR and international), sk-/ghp_/AKIA-style keys found · a date, a
                      version string and a Convex id are not · home in each spelling → `~/…`:
                      `C:\Users\<name>\`, `C:\\Users\\<name>\\`, `c:/users/<name>/`, `/c/Users/<name>/`,
                      and `C--Users-<name>-` masked · git name and email → [owner], case-insensitive,
                      accents NFC-normalised · a masked text scans clean · user name `dev` does not
                      mask "commit on dev" · no git name → no false hit · all-empty identity → no
                      false hit, email/phone/secret still found
pre-push.test.ts      tag and branch deletion ignored · MEMORY_SKIP passes · missing stamps blocks with
                      the setup message · nothing selected passes · one unread session blocks naming the ref ·
                      first push with no lastRun prints "(no dream yet)" · a failed lastRun prints "failed"
pre-commit.test.ts    memory path staged → refused · MEMORY_UPDATE=1 passes · MEMORY_UPDATE=1 with a
                      staged src/ file → refused · MERGE_HEAD passes · REVERT_HEAD passes · README.md
                      staged passes · CHERRY_PICK_HEAD → refused · with a pending.json, the refusal
                      names the pending dream commit · through the real shell chain in a
                      temp repo: a clean merge of a memory commit (pre-merge-commit → pre-commit)
                      passes, and in a worktree a conflicted merge passes
c20-memory-integrity.test.ts   each P5 error on a fixture memory dir (full mode) · stable mode: same
                      memory with now + 60 days still passes · a cited docs/ file removed still
                      passes · index lines reordered still pass, a missing line fails · encrypted
                      memory → skipped, exit 0 · absent folder → skipped · a fixed identity injected:
                      a memory file holding its git name fails stable mode · identity never read
                      when skipped
setup.test.ts         --auto: CI set → no-op, exit 0 · EAS_BUILD set → no-op · no key → one line, exit 0 ·
                      no transcrypt → one line, exit 0 · thrown error → one line, exit 0 · a copy
                      of setup.mjs in a temp dir whose _lib/stamps.mjs throws at import → one
                      line, exit 0 · second run
                      on a set-up repo → no output · existing stamps never overwritten · --auto with
                      --reset-stamps → refused · without --auto, a missing key → exit 1 · settings
                      lacking the memory lines → one line naming each gap, exit 1 by hand · settings
                      file missing or invalid → one line · every case runs on a copy of the repo's
                      real settings, so they are checked too
update.test.ts        U1 refusals · nochange path restores usage.json · [a] writes nothing · [i] writes
                      stamps, no commit · commit limited to .claude/memory with the trailer · --dry-run
                      writes no stamps and no lastRun · failure keeps the dream dir and sets lastRun failed ·
                      a refused U9 commit leaves pending.json and the dream dir, no stamps · the next
                      run finishes U9–U11 from the dream dir's copy without calling an agent, even
                      after the owner unstaged or stashed .claude/memory · a pending.json run on
                      another branch → U1 refuses · memory changed on dev between the failed U9 and
                      the retry (a pulled memory commit) → U1 refuses, nothing mirrored · --reindex adds a hand-written file to usage.json
                      and index.md and commits nothing · --reindex while a dream holds the lock →
                      refused · --reindex with a pending.json → refused · --reindex on a file with
                      no summary → refused, naming the file
                      (pipeline stubbed: runAgent injected)
```

**Decisions I am least confident about.**

1. **C20's stable mode inside verify.** It makes the PII scan run on every commit for free, and
   only the rules that cannot change with the date or with docs/. But a hand edit to a memory
   file that drops its summary still fails verify on any commit until the dream fixes it. That is
   the lock working, but it will surprise.
2. **Subagent transcripts are ignored.** Their findings come back to the parent conversation, which
   is selected; their reads of memory files are not counted. A reviewer subagent that reads memory
   a lot will under-rank it.
3. **The dream's hooks.** Whether `--setting-sources` can drop project hooks while keeping `--agent`
   is the one CLI behaviour the docs did not settle.

---

## 4. What can go wrong

| Case | What the code does | What the owner sees | Pinned by |
| --- | --- | --- | --- |
| transcrypt not installed on a machine | `--auto`: one line, install succeeds; by hand: setup stops | "install transcrypt" with the link | `setup.test.ts` |
| `.env.local` has no MEMORY_KEY | `--auto`: one line, install succeeds; by hand: setup stops | where to put it | `setup.test.ts` |
| `pnpm install` in CI or on an EAS build | `--auto` does nothing, exits 0 | nothing | `setup.test.ts` |
| `pnpm install` on a machine already set up (branch switch, dependency bump) | every step skipped, no output | nothing | `setup.test.ts` |
| `pnpm install` inside a worktree under `.claude/worktrees/` | transcrypt config and stamps live in the shared git dir: already done, skipped | nothing | `setup.test.ts` |
| setup crashes in `--auto` (a bug, an unreadable file) | the error is caught at top level, printed as one line, exit 0 | "memory setup failed: …", then the memory:setup command to run by hand | `setup.test.ts` |
| Clone not decrypted | SessionStart prints the "memory encrypted, run setup" line; C20 skips; update refuses at U1 | that line | `session-start-memory` by hand, `c20…test.ts` |
| Stamps file missing or invalid | pre-push blocks; update refuses | setup command, or the Zod error and the reset command | `pre-push.test.ts`, `stamps.test.ts` |
| A Claude Code update renames a JSONL field | the line is skipped; nothing selected | pushes pass, nothing is dreamed | `transcripts.test.ts` (missing field) |
| Session cwd in another drive-letter case | normalised, kept | — | `transcripts.test.ts` |
| A memory commit arrives through `git pull` (other machine) | clean merge runs pre-merge-commit → pre-commit; the lock lets it through | — | `pre-commit.test.ts` |
| `git revert` of a memory commit | clean: pre-commit does not run; conflicted: REVERT_HEAD passes | — | `pre-commit.test.ts` |
| A session agent edits memory through Bash | the deny rule does not see it; the lock refuses the commit. C20's stable mode fails verify only if the edit breaks a stable rule (a missing summary, a bad source date); a reworded fact passes it | "commit refused: memory is written by memory:update" | `pre-commit.test.ts` |
| `claude` is missing or its native binary is not installed (the case on this machine today) | update refuses at U1 | the fix command | `update.test.ts` |
| One agent call fails, times out or returns invalid JSON | dream stops, memory restored, dream dir kept, lastRun failed | the log file path | `update.test.ts` |
| Ctrl-C during U5–U8 | same restore | the dream dir path | `update.test.ts` |
| Crash between U9 and U10 | commit exists, stamps unchanged; next dream ends nochange | push still blocked once | spec §9.1, by hand |
| Conflict in .claude/memory after U2 | update stops before dreaming | "resolve, commit, rerun" | `update.test.ts` |
| Two pushed refs, one clean | blocks, naming the unread one | ref names | `pre-push.test.ts` |
| Index over 200 lines | last injected line replaced by the "N more" line | — | `memoryIndex.test.ts` (render), hook by hand |
| Pushing before the dream prompts are tuned | pre-push blocks from the first push of dev after merge (Q3) | the 💭 message; a bad first diff is answered with [a] or [m], or MEMORY_SKIP=1 for that push | `pre-push.test.ts` |
| A memory file is saved in plaintext on GitHub (`--no-verify`, transcrypt off) | memory-encryption.yml fails | red CI on that push | the workflow, slice 6 by hand |
| `pnpm verify` runs inside the memory commit (Q6) and fails on unrelated uncommitted work | the commit is refused after the owner chose [o]; the dream dir and pending.json are kept, stamps are not written | the verify error, then "fix it and rerun the memory:update command to finish the commit" | `update.test.ts` |
| A pending commit exists and the owner stashes, unstages or commits around .claude/memory | nothing is lost: the retry mirrors the dream dir's copy back, as U6 | — | `update.test.ts` |
| A pending commit is retried on another branch | U1 refuses: pending.json names the branch | "switch back to dev" | `update.test.ts` |
| Memory changed at HEAD between the failed commit and the retry (a pull from the other machine, a hand-written file) | U1 refuses; the stale copy is never mirrored | "memory changed since this dream: delete the pending dream and rerun" | `update.test.ts` |
| The owner commits other work while a dream commit is pending | the lock refuses only if that commit stages memory; its message names the pending dream | "a dream commit is pending: rerun memory:update" | `pre-commit.test.ts` |
| A worktree checkout gets ciphertext (transcrypt filter not applied there) | SessionStart prints the "memory encrypted" line in that session; C20 skips | no index in worktree sessions | slice 1 check; fix in setup (apply the filter config to worktrees) before slice 2 |
| Two memory:update runs at once (two terminals, two worktrees) | the second fails at U1 on the dream lock | "a dream is already running (pid N)" | `stamps.test.ts` |
| Stamps rename refused on Windows (another process has the file open) | retried 5× over 1 s, then the run fails with the old stamps whole | the error; rerun | `stamps.test.ts` |
| A commit renames a doc a memory cites | stable C20 passes; the next dream's P5 catches the dead path and the planner lists it | a docsIssue in the diff | `c20…test.ts` |
| A dreamer tries to read `.env.local` | denied | — | slice 7 check 4 |

---

## 5. Slices

One commit per slice on `chore/agent-memory`, merged into dev locally at the end, nothing pushed.
Slice 1 cannot start until transcrypt is installed (Blocked): slice 2 commits `index.md`, and a
commit made before the filter is active stores it in plaintext forever.

- [x] 1. Foundations — transcrypt init with the owner's key, `.gitattributes` patterns (merge driver
      tested once with a deliberate conflict, spec §11.2), MEMORY_KEY in `.env.example`, `.tmp/`
      everywhere listed in §2, `setup.mjs` (with `--auto` and its tests; `git.mjs` comes with it,
      one slice early, since setup is its first caller), the memory:setup script
      and the `prepare` hookup in package.json → a
      throwaway memory file shows encrypted in `git show HEAD:…` and plain on disk, in the main
      checkout **and in a worktree under `.claude/worktrees/`**
- [x] 2. Memory folder (README, template, header-only index, empty usage), the two AGENTS.md lines
      (they name the folder and the signal, no command, so C6 has nothing to resolve),
      `.claude/settings.json` (three denies, auto memory off, SessionStart entry pointing at a stub
      that prints nothing yet) → committed with MEMORY_UPDATE=1. The header-only index ends with
      `## Memories`: slice 5's `FIXED_HEADER` and `renderIndex` with no files must give these bytes.
      The deny was probed in a live session: an Edit on index.md is refused, one on README.md passes
- [ ] 3. `git.mjs`, `transcripts.mjs`, `stamps.mjs` (with the dream lock), fixtures and their tests
- [ ] 4. `pii.mjs`, `pre-commit.mjs` + the pre-commit block + the pre-merge-commit export,
      `pre-push.mjs` + `.githooks/pre-push` (blocks from the start, Q3), knip entries for both,
      commitlint footer token
- [ ] 5. `usage.mjs`, `memoryIndex.mjs`, the real `session-start-memory.mjs`
- [ ] 6. C20, its tests, the C1–C20 renumbering, `memory-encryption.yml`
      *(moved before the orchestration: P5 calls C20)*
- [ ] 7. The four CLI checks of §3 first; then `condense.mjs`, `responses.mjs`, `runAgent.mjs`,
      the four `dream-*` agents, `update.mjs` and the memory:update script in package.json, with
      the pipeline stubbed first (spec §14 row 8), then wired; `--dry-run`, `--reindex`, the
      pending commit; [m] and `:e`
- [ ] 8. Remaining spec §14 tests; the owner runs the first real dry-run dream (command handed over)

---

## Open questions

None. **Answered by the owner (2026-11-08)**, each folded into the section it changes:

| Q | Answer | Where |
| --- | --- | --- |
| Q1 language | English | §2 Memory language |
| Q2 auto-memory notes | the owner rewrites them by hand once the system is in place | §1 Out of scope, Existing data, §3 `--reindex` |
| Q3 pre-push | blocks from the first push of dev after merge; its message opens with 💭, not ✋ | §3 block message, §4, slice 4 |
| Q4 matchers | add `clear` | §2 verified table, file list |
| Q5 models | Haiku 5.5 extractor, Opus 5.5 planner and reviewer, Sonnet 5.5 writer | file list, Cost |
| Q6 memory commit | full `pnpm verify`, like any commit | §3 pending commit, §4 |

---

## Review log

```
round 1   REVISE   11 findings: 11 fixed, 0 declined, 0 new questions (Q2, Q4, Q6 reworded)
round 2   REVISE   2 findings: 2 fixed
round 3   READY
          owner answered Q1–Q6
round 4   REVISE   scoped to the answers; 5 findings: 5 fixed
round 5   REVISE   1 finding (stale retry): fixed
round 6   READY
          owner asked: fewer env vars, setup from `prepare`
round 7   REVISE   scoped to those; 2 findings (Windows dreamer cwd, failed import): 2 fixed
round 8   READY
          owner asked: dreamers must never save personal data
round 9   REVISE   scoped to the personal-data layers; 2 findings (missing identity, user-name false hits): 2 fixed
round 10  REVISE   1 finding (no channel for C20's test identity): fixed, --identity + runCheck args
round 11  READY
```

---

## Landing

- [ ] Plan review loop ended READY, and the user agreed the plan
- [ ] `pnpm verify` green
- [ ] `architecture-reviewer` clean, or its findings approved
- [ ] ADR 0021 written (memory written only by the dream, encrypted, reviewed; the memory commit
      on dev as a sanctioned exception; Verify: lock, C20, workflow)
- [ ] update.mjs's docblock describes U1–U11 and P1–P7; each `_lib/` docblock names its spec section
- [ ] **This file deleted** — the slice is not done while it exists
