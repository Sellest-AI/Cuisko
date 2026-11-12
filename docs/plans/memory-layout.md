---
slice: memory-layout
branch: refactor/memory-layout
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# Memory layout: one fact per file, nothing shared

After this lands, two dreams on two branches can each add facts to the same topic, and GitHub
merges both without a conflict: no file in the memory is written by more than one dream.

---

## 1. Problem

**What is broken or missing.** Every dream rewrites `index.md` and touches every entry of
`usage.json` (`sessionsSinceRead`), and a topic is one file holding up to 18 facts. GitHub merges
the memory as ciphertext, so any file changed on both sides conflicts, whatever the lines. Today
this is hidden because every dream commits on `dev`; the github-workflow plan puts the memory on
PR branches, where two open PRs with a dream each would always conflict.

**How we would know it worked.**

- Two branches from the same `dev`, each with a dream adding a fact to `windows-shell-traps`,
  merge into `dev` one after the other on GitHub with no conflict (checked by hand once, in
  slice 7, with two throwaway branches).
- A session start on today's memory (about 85 facts) builds the index and prints it in under
  300 ms on the owner's machine.
- No committed path under the memory folder is written by two dreams: every dream writes new
  files or edits one fact's file.

**Product fit.** Developer tooling; no screen, no copy. It serves the agents that build Cuisko.

**Out of scope.** Moved to the github-workflow plan, which comes after this one: `memory:sync`,
`push:branch` and its `--auto` gate, the memory riding on the fix PR, the fact names listed in the
PR, `memory:show`, and where the memory of a session run on `dev` goes. The dream's extraction
(P1–P2), its masks and its stamps are unchanged.

---

## 2. Architecture

**Tables** — none. **Operations** — none. **Cascade** — none.

**Layout** — before and after:

```
before                                    after
.claude/memory/                           .claude/memory/
  README.md, _template.md   (owner)         README.md, _template.md   (owner, reworded)
  index.md                  (crypt)         memories/                 (crypt)
  usage.json                (crypt)           windows-shell-traps/
  memories/                 (crypt)             halved-backslashes-in-inline-commands-k3f9.md
    windows-shell-traps.md                      stand-in-hook-needs-mode-755-p2a7.md
    testing-on-web.md                         testing-on-web/
                                                no-seeded-test-account-q9d2.md
                                            usage/                    (plain, not encrypted)
                                              2026-11-14-a1b2.json    one per dream
                                              2026-10.json            one per folded month
                                            .built/                   (git-ignored)
                                              index.md
                                              windows-shell-traps.md  the topic's facts, joined
```

**A fact file:**

```
---
title: Stand-in hook needs mode 755
status: stable
created: 2026-11-08
last_verified: 2026-11-12
---

A test that writes a stand-in hook meant to refuse a commit must create it with mode 0o755, since
git on Linux silently skips a non-executable hook. … (source: 2026-11-08)

## Links

- `docs/CONVENTIONS.md`
```

- The body is one fact, or one `Hypothesis: ` fact, ending with its `(source: …)`, as a bullet is
  today. `## Links` is optional.
- File name: the slug of the title (lowercase `a-z0-9`, words joined by `-`, at most 50 characters,
  cut at a word), then `-`, then a 4-character id from `a-z0-9`. **The script names every new
  fact, never a model** (§3), against the names already in the topic. **The name is fixed at
  creation**: rewording the title changes the header only. A fact is identified by its whole file
  name; no rule needs the id to be unique on its own.
- Topic folder: `a-z0-9` words joined by `-`. `index` is reserved (it would collide with the
  built index). A topic exists while it holds one fact; there is no per-topic file.

**A usage file** (one per dream, `usage/<UTC date>-<id>.json`):

```json
{
  "version": 2,
  "sessions": ["2026-11-14T08:12:03.000Z", "2026-11-14T10:40:51.000Z"],
  "reads": { "windows-shell-traps": { "count": 3, "last": "2026-11-14T10:41:07.000Z" } }
}
```

`sessions` are the session starts the dream read; `reads` holds only topics read in them. A folded
month (`usage/<YYYY-MM>.json`) has the same shape. Every value a dream used to store is now
computed from all usage files, and the same rule is applied before and after a fold, so a fold
never changes a total:

| Value | Computed as |
| --- | --- |
| sessions | the **distinct** session starts across all files |
| reads of a topic | the sum of its `count` over all files |
| last read | the latest `last` |
| sessions since read | the distinct session starts after the last read (after the topic's `created`, the earliest `created` of its facts, when never read) |

A session can appear in two files only if two dreams on two machines read the same transcript,
which cannot happen (transcripts are local); counting distinct starts makes it harmless anyway.
Two dreams on two machines reading the same topic are two different reads, so counts are summed.

**Flows.**

```
SessionStart hook (every start, resume, clear, compact)
  read memories/*/*.md + usage/*.json → render .built/index.md + .built/<topic>.md
  (each written to a temp name, then renamed) → delete .built/ files that match no topic
  → print the index head, as today

memory:update (the dream)
  U1  preflight: the memory is detected, and its encryption checked, on a fact file
  U4  copy; the dream's usage file is written into the copy, once, from the counts
  P3  planner: groups → topics (update an existing topic / create one), fact deletions,
      topic deletions
  P4  writers, up to 4 in parallel, one per topic: grant = that topic folder
      → after all writers: the script names every new file (factName) and runs the checks
  P5  C20 --full on the copy · P6 reviewer: fixes facts, names facts to drop → checks again
  U7  the owner sees the diff and the ranking change (both indexes rendered in memory)
  U9  mirror: memories/** both ways, new usage/ files added, nothing deleted under usage/
      → the commit stages memories/ changes + the new usage file

memory-usage-fold.yml (1st of the month, 06:00 UTC, and on demand)
  GitHub App token → pnpm install → node scripts/memory/fold.mjs on dev → nothing to fold: stop
  → branch chore/memory-usage-fold (fixed name, force-updated) → PR into dev if none is open
  → owner merges
```

**The index** (built index.md): the fixed header, then one line per topic, in today's order rules
(grace for a topic created less than `GRACE_DAYS` ago, then the read score), the 6 newest titles,
then `+N more` when the topic holds more:

```
- [Windows shell traps] → .claude/memory/.built/windows-shell-traps.md: Node missing from PATH in bash · Rewriting a running bash script · … +2 more
```

Each link is the path from the repo root: the hook prints the index as text, with no folder to
resolve a bare name from, and Grep and Glob skip hidden, git-ignored folders by default, so a bare
`windows-shell-traps.md` could not be found. `FIXED_HEADER` and the `headOfIndex` pointer name the
same folder. The topic's display title is its folder name with the first letter capitalised and
`-` as spaces.

**Reads.** A tool call naming a built topic file, a fact file or a topic folder counts one read of
that topic. The built index names no topic (`topicOf` returns null). Old transcripts still name
`memories/<topic>.md`: the migration keeps each topic folder named after its old file, so those
reads map to the same topic.

`countReads` searches each tool input as free text, as `_names` does today: backslashes made
forward first, a boundary checked before the needle. Per topic `t`, the needles are
`memories/<t>/`, `memories/<t>.md`, `.built/<t>.md`, and `memories/<t>` followed by the end of the
text, a space, a quote or `/`. So `memories/git-hook` never matches
`memories/git-hook-scripts/…`.

**Existing data.**

- **Preconditions for slice 6**, because a memory commit in the old layout that reaches `dev`
  after the switch conflicts on deleted ciphertext, and its fact lives only in the deleted file:
  every branch or worktree with an old-layout memory commit is merged into `dev` first; the
  migration runs on the latest `dev`, right before this branch merges; no dream runs on `dev`
  between the migration and the merge.
- **After the merge**, a branch or worktree cut before the switch still has the old dream code: a
  dream there would write `index.md`, `usage.json` and `memories/<topic>.md`, which conflict as
  deleted ciphertext when it merges `dev`, and its new fact would be lost. So every open branch
  and worktree merges `dev` before its next dream, and pushes with `MEMORY_SKIP=1` until it has.
  The owner is told this at landing, with the list of open branches.
- **During slices 1–6**, the work is not committed (§5) and the branch does not dream: the dream
  code is half-changed. It lives in its own worktree, so no other session's commit sweeps it in.
  A push of it, if needed, uses `MEMORY_SKIP=1`. Its sessions stay unread and are dreamt by the
  new dream after the merge; their stamps are untouched.
- The 14 files in `memories/` become about 85 fact files, by an uncommitted script run once
  (slice 6). Each `## Facts` bullet becomes a fact; its title is written by the agent in a
  titles file the script reads, and the script names the file. `status` and `last_verified` come
  from the old header, `created` from the bullet's source date. A topic's `## Links` go to the
  facts the agent picks for each link in the titles file. The owner reviews the result in one
  diff.
- `usage.json` becomes `usage/2026-11-14-mig0.json` (`mig0` is the reserved id of this one file):
  each file's `reads` and `lastRead` move to its topic; `sessions` is empty. `sessionsSinceRead`
  is dropped, so the count restarts at 0 (today's highest is 11 of the 60 that
  `UNUSED_AFTER_SESSIONS` needs).
- `index.md` and `usage.json` are deleted from git.
- Clones that pull this: their built folder is made at the next session start. A clone without
  the key still sees "Run: pnpm memory:setup", now detected on a fact file.
- History: a fact file has no history before the migration, and `git log --follow` does not
  cross a split. The agent definitions that look for a flip in history (dream-planner.md,
  dream-writer.md, dream-reviewer.md) also search the old `memories/<topic>.md` path.

**Cost and limits.** The dream's model calls are unchanged in number: one writer per topic, as one
per file today. The fold Action runs in a few seconds of free GitHub minutes. The GitHub App has
`contents: write` and `pull-requests: write` on this repo only.

---

## 3. Program design

**Reuses.** `isEncrypted`, `factBullets`, `citedDocs`, `fileLinks` (memoryFiles.mjs) ·
`headOfIndex`, `FIXED_HEADER`, `GRACE_DAYS`, `HALF_LIFE_DAYS` (memoryIndex.mjs) ·
`countReads`, `sessionStarts`, `READ_INPUTS` (usage.mjs) · `runAgent` grants, `mapLimit`,
`copyMemory` (dream.mjs, memoryDir.mjs) · `scan` (pii.mjs) · `rankingChanges` (review.mjs) · the
pending/rerun mechanism of update.mjs.

**One landing, no old-and-new period.** The owner accepts that slices 1–6 land together. The live
memory and the code that reads it cannot change in separate commits without one of them failing
C20, so slices 1–5 are build steps on the branch, tested on fixtures and left uncommitted.
Slice 6 runs the migration and lands everything in two
commits. The old exports are replaced, not kept beside the new ones: `readMemoryFiles`,
`readUsage`, `renderIndex` and the index rules of C20 are gone when the branch lands.

**Files created or changed:**

```
○ scripts/memory/_lib/memoryFiles.mjs   + readFacts(dir) → Fact[], the name rule, topicOf(path)
+ scripts/memory/_lib/factNames.mjs     slugOf(title), factName(title, taken)
○ scripts/memory/_lib/usage.mjs         + readUsageFiles, totals, newUsageFile, foldMonth, closedMonths;
                                        countReads maps a path to its topic
○ scripts/memory/_lib/memoryIndex.mjs   + renderTopicIndex, renderTopic; FIXED_HEADER and headOfIndex
                                        name the built index
+ scripts/memory/_lib/built.mjs         buildMemory(memoryDir) → writes the built folder
+ scripts/memory/_lib/factChecks.mjs    the new C20 rules, called by C20 from slice 6
○ scripts/memory/_lib/memoryDir.mjs     compareMemories, snapshotMemory, mirrorMemory over
                                        memories/*/*.md and usage/
○ scripts/memory/_lib/dream.mjs         writer grant = a topic folder; naming of new files; checks;
                                        the refreshIndex calls removed (after writers, reviewer, correct)
○ scripts/memory/_lib/responses.mjs     planner reply: topics, fact and topic deletions; checkPlan
○ scripts/memory/_lib/review.mjs        rankingChanges takes two rendered indexes
○ scripts/memory/update.mjs             preflight on a fact file; usage file at U4; ranking diff in
                                        memory; :e reads facts; --reindex removed
+ scripts/memory/fold.mjs               prints what a fold of the closed months would change; with
                                        --write (the Action only) writes it
○ scripts/memory/pre-commit.mjs         LOCKED = memories/**, usage/**
○ scripts/memory/pre-push.mjs           _memoryEncrypted reads a fact file, not index.md
○ scripts/memory/setup.mjs              deny rules: memories/**, usage/**, the built folder
○ scripts/checks/c20-memory-integrity.mjs  calls factChecks; skips when the fact files are ciphertext
○ .claude/hooks/session-start-memory.mjs   buildMemory, then print the index head
○ .claude/agents/dream-planner.md, dream-writer.md, dream-reviewer.md   the fact contract, old history path
○ .claude/memory/README.md, _template.md   reworded for facts (owner-approved text)
○ .claude/settings.json                 the same deny rules as setup.mjs
○ .gitattributes                        crypt on memories/** only
○ .gitignore                            .claude/memory/.built/
○ .githooks/pre-commit                  its memory-lock comment
○ .github/workflows/memory-encryption.yml   its comment on the patterns (one pattern now)
+ .github/workflows/memory-usage-fold.yml
○ docs/adr/0021-the-agent-memory-is-written-by-the-dream.md
○ docs/ARCHITECTURE.md, docs/CONVENTIONS.md, AGENTS.md   wherever they name index.md or usage.json
```

`package.json` gets `memory:fold`. No `--reindex`: nothing is generated in git any more.

**Signatures:**

```ts
type Fact = {
  path: string;            // "memories/windows-shell-traps/stand-in-hook-needs-mode-755-p2a7.md"
  topic: string;           // "windows-shell-traps"
  id: string;              // "p2a7"
  header: { title: string; status: "stable" | "volatile"; created: string; last_verified: string } | null;
  body: string;
  errors: string[];        // malformed header, bad name, no source date
};
readFacts(memoryDir: string): Fact[]
topicOf(memoryPath: string): string | null   // fact, folder, built topic file, old memories/<topic>.md;
                                             // null for the built index and anything else

slugOf(title: string): string                                        // ≤ 50 chars, cut at a word
factName(title: string, { taken }: { taken: Set<string> }): string   // taken = names in the topic
                                                                     // plus names drawn in this dream

type UsageFile = { version: 2; sessions: string[]; reads: Record<string, { count: number; last: string }> };
readUsageFiles(memoryDir: string): { name: string; usage: UsageFile | null; error: string | null }[]
// a malformed file comes back with usage null and its error: C20 makes it a finding,
// the hook skips it and prints one line, totals ignores it
totals(files: UsageFile[], topics: Map<string, { created: string }>): Map<string, {
  reads: number; lastRead: string | null; sessionsSinceRead: number;
}>
newUsageFile(usage: UsageFile, { today, taken }: { today: string; taken: Set<string> }): { name: string; text: string }
foldMonth(files: { name: string; usage: UsageFile }[], month: string): UsageFile   // pure, deterministic
closedMonths(names: string[], today: string): string[]                            // months before today's

renderTopicIndex(topics: Topic[], totals, { now }: { now: Date }): string   // pure
renderTopic(topic: Topic): string                                            // pure
buildMemory(memoryDir: string, { now }: { now: Date }): { index: string; topics: number }
```

Facts inside a topic file are sorted by source date, then by name. `rankingChanges` receives the
repo's index and the copy's, both rendered by `renderTopicIndex` at the dream's `now`; nothing
reads a built folder during a dream.

**The dream's usage file.** Written into the copy at U4 by `newUsageFile`, with its id drawn once.
A pending rerun from `pending.json` reuses the file already in the dream folder, so a refused and
rerun commit keeps one file and one id. The mirror adds new `usage/` files to the repo and never
deletes one there.

A dream that changes no fact but read sessions still has a usage file. It is committed **without
asking the owner** (`chore(memory): usage after N sessions`): a usage file holds no prose, only
topic names, counts and dates, and C20 checks it. A dream that read no session writes no usage
file and makes no commit, as "nochange" today.

**The planner's reply:**

```ts
{ status: "ok";
  topics: { topic: string; action: "update" | "create"; candidates: string[] }[];
  delete: { fact: string; reason: string; because: "gone" | "wrong" }[];      // fact paths
  deleteTopics: { topic: string; reason: string; because: "unused" | "gone" }[];
  dropped: …;  docsIssues: … }                                                 // unchanged
```

`UNUSED_AFTER_SESSIONS` screens `deleteTopics` with `because: "unused"`, from `totals`. A single
fact cannot be deleted as unused: reads are counted by topic. `checkPlan` refuses a plan that
deletes a topic and also gives it a writer, or that names a fact outside the memory.

**Who may write what, and the checks.**

| Step | May | May not | Checked |
| --- | --- | --- | --- |
| Writer (P4) | create files in its topic folder under any name; edit facts there | touch another folder, delete, rename | once, after all writers (they run in parallel): each change is attributed to the folder it is in |
| Script, after the writers | rename each **new** file to `factName(title, { taken })`, taken = the topic's names plus every file named in this dream | — | — |
| Reviewer (P6) | edit facts this dream created or changed; name facts this dream created in `drop` | create, rename, edit a fact the dream did not touch | after the reviewer |
| Owner `[m]` correction | create a fact under any name; edit any fact; `drop` any fact (the owner asked, and sees the diff again, as today) | rename | after the correction |
| Owner `:e` (hand edit) | anything, a new fact under any name | — | C20 `--full` on the copy |

The naming step also runs after an `[m]` correction and after `:e`, before C20 `--full`, so a fact
the owner adds needs no made-up id. Each time, it renames only a file that is not in the snapshot
taken just before that step, or whose name fails the name rule: a file already named keeps its
name across every later round, so its id never changes between two diffs the owner reads. A check stops the dream, keeps the pending folder, and names
the fact, when an existing fact's file is gone without a `drop` (a rename shows up this way: the
old name is gone and a new file appears), or when a change falls outside the step's grant.

**C20.**

| Mode | Rules |
| --- | --- |
| stable | each fact: header, name rule, one body fact with its source date, links resolve · every usage file parses as v2 · personal data in facts and usage files |
| `--full` | the stable rules · every cited `docs/` path exists · README.md and _template.md equal to the repo's |

C20 skips, as today, when the fact files are ciphertext (CI, a clone without the key); `usage/`
being plaintext does not stop the skip. Two branches adding the same file name to one topic is an
add/add conflict that GitHub reports (§4); two different names never clash, whatever their ids.

The index rules go: the index is not in git.

**The fold Action.** `on: schedule: '0 6 1 * *'` and `workflow_dispatch`; `concurrency:
memory-usage-fold`. Steps: `actions/create-github-app-token` with the secrets
`SELLEST_AGENT_APP_ID` and `SELLEST_AGENT_PRIVATE_KEY` (org secrets) → check out `dev` →
`pnpm install` (its `prepare` runs `setup.mjs --auto`, which finds no `MEMORY_KEY` and leaves the
memory encrypted; the fold reads only `usage/`, which is plaintext) →
`node scripts/memory/fold.mjs --write` → no change: stop → commit on the fixed branch
`chore/memory-usage-fold`, force-pushed (only the App writes it) → open a PR into `dev` unless
one is open from that branch, which then follows the new commit. One PR at most, so two folds of
the same month can never both be open. `prepare` sets `core.hooksPath` in CI too, so the commit
goes through the lock: it is made with `MEMORY_UPDATE=1` and the `Memory-Update: yes` trailer,
and the lock then runs C20 alone, which skips on the ciphertext facts.

`memory:fold` on a machine only prints what the next fold would change: `usage/**` is locked, and
the owner never commits a fold by hand. The ADR 0021 amendment names the fold Action as the second
sanctioned writer of `usage/`, beside memory:update, and the only one that deletes files there.

**Tests** (`scripts/memory/__tests__/`, `.test.ts`). New:

```
memoryFiles.test.ts    a fact with a valid header and name reads · a bad name, a missing source date,
                       a missing title are errors · topicOf: fact, folder, built topic file, old
                       file name, built index → null
factNames.test.ts      slug cut at a word under 50 · accents and punctuation dropped · a taken name is
                       never returned
usage.test.ts          totals sums counts and keeps the latest last · distinct session starts · sessions
                       since read counts starts after the last read · never read counts from created ·
                       a topic with no usage is 0 · countReads maps a built topic file and a fact path
                       to the topic · a usage file for a deleted topic is ignored · a topic whose name
                       is a prefix of another counts only its own reads · a PowerShell Get-Content
                       with backslashes counts · a Grep whose path is a topic folder counts ·
                       readUsageFiles returns a malformed file with its error
fold.test.ts           foldMonth gives the same bytes whatever the input order · totals are equal before
                       and after a fold · a late file folds into the existing month file ·
                       closedMonths skips the current month
built.test.ts          index links are .claude/memory/.built/<topic>.md from the repo root · the header
                       names that folder · index order: grace, then score, then title · 6 titles then "+N more" · facts sorted
                       by source date then name · an empty topic is skipped · a stale topic file is
                       removed · a write leaves no temp file · a rename that fails keeps the old file
factChecks.test.ts     each stable rule fails on its broken fixture · a malformed usage file is a finding
```

Existing test files whose assertions change, listed so the owner's approval of this plan covers
them (AGENTS.md: existing tests are the specification): `update.test.ts`, `review.test.ts`,
`memoryDir.test.ts`, `responses.test.ts`, `memoryIndex.test.ts`, `setup.test.ts`,
`pre-push.test.ts`, `pre-commit.test.ts`, `dream.test.ts`, `c20-memory-integrity.test.ts`,
`session-start-memory.test.ts`. Added to them: a writer's rename, deletion or write outside its
folder is refused · the script renames every new file and avoids names drawn by parallel writers ·
the reviewer cannot create a fact · an `[m]` drop deletes any fact, an `[m]` rename is refused ·
a fact created by `[m]` or `:e` is named by the script · a fact named after the writers keeps
its name through a later `[m]` round · a dream that changed no fact commits its
usage file without asking · a dream that read no session commits nothing ·
`checkPlan` refuses a topic both deleted and written · a pending rerun keeps one usage file · the
mirror never deletes a usage file · a commit staging `usage/` without `MEMORY_UPDATE=1` is
refused · the hook prints the built index head, the setup line on ciphertext, nothing for a dream
cwd.

**Decisions I am least confident about.**

1. The topic's display title comes from its folder name, so "Navigation bar: where a typed food
   goes" becomes "Navigation bar add destination". The fact titles on the index line carry the
   meaning, but a topic name can no longer hold punctuation.
2. `sessionsSinceRead` restarts at 0 at the migration instead of being carried. It only delays an
   "unused" topic deletion by at most 11 sessions.
3. The fold opens a PR that the owner must merge each month. Merging it is one click; without it,
   the per-dream files pile up but nothing breaks.

---

## 4. What can go wrong

| Case | What happens | What the owner or agent sees | Pinned by |
| --- | --- | --- | --- |
| Two sessions start at the same moment | each writes built files to temp names and renames them; the last rename wins with the same content | a normal index | `built.test.ts` |
| A rename on Windows fails because a reader holds the file | the hook keeps the old file and adds one line saying the index may be stale | the previous index, and that line | `built.test.ts` |
| The built folder was deleted by hand | rebuilt at the next start | nothing | `built.test.ts` |
| A topic was deleted | its built file is removed at the next start | it is gone from the index | `built.test.ts` |
| A usage file is malformed (hand edit, bad merge) | C20 fails the commit; the hook skips that file and says so in one line | the index without that file's reads | `factChecks.test.ts` |
| A usage file names a topic since deleted | its reads are ignored | nothing | `usage.test.ts` |
| A late dream file arrives after its month was folded | summed like any other file; the next fold takes it in | nothing | `fold.test.ts` |
| Two fold runs at once | `concurrency` queues the second; it finds nothing left | one PR | — (workflow config) |
| Last month's fold PR is still open | the run force-updates the same branch; the PR follows | one PR, now with two months | — (workflow config) |
| The App secrets are missing or the token is refused | the workflow fails before any write | a red run in Actions | — |
| A writer renames or deletes a fact, or writes outside its folder | the dream stops, the pending folder is kept | the dream's error, naming the fact | `dream.test.ts` |
| Two parallel writers would pick the same name | they never pick: the script names new files after all writers, against every name drawn in the dream | nothing | `dream.test.ts` |
| Two branches each add a fact with the same name to one topic | GitHub reports an add/add conflict on that file; the github-workflow plan's `memory:sync` resolves it | a conflict on one fact | — |
| A dream empties a topic (every fact dropped) | the folder disappears; the index skips it | the topic is gone from the index | `built.test.ts` |
| Two branches edit the same fact | GitHub reports a conflict on that file only | handled in the github-workflow plan (`memory:sync`) | — |
| Clone without the key | the hook detects ciphertext on a fact file | "Run: pnpm memory:setup" | `session-start-memory.test.ts` |
| A transcript from before the migration names `memories/<topic>.md` | counted for that topic | nothing | `usage.test.ts` |
| An old-layout memory commit reaches `dev` after the switch | prevented by slice 6's preconditions (§2) | — | — (procedure) |

---

## 5. Slices

Slices 1–5 are build steps, each ticked when its tests pass on fixtures; they land with slice 6
in one code commit, followed by the memory commit (the owner accepts this). The branch does not
dream until slice 6 lands (§2).

- [x] 1. `readFacts`, the name rule, `topicOf`, `slugOf`, `factName`, their tests
- [x] 2. usage v2 (`readUsageFiles`, `totals`, `newUsageFile`, `foldMonth`, `closedMonths`), its tests
- [x] 3. `renderTopicIndex`, `renderTopic`, `buildMemory`, their tests
- [x] 4. the new dream steps: planner reply and `checkPlan`, writer grant, naming, checks, reviewer
      and `[m]` rules, usage file at U4, mirror over `memories/*/*.md` and `usage/`; the three agent
      definitions drafted; tests on fixtures
- [x] 5. the new C20 rules (factChecks), the new lock list, the pre-push encrypted check, deny
      rules; tests on fixtures
- [ ] 6. the switch, after the §2 preconditions. On the latest `dev` merged into the branch:
      1. run the scratch migration script on the live memory. The script and its titles file
         (written by the agent) live in `.tmp/memory-migration/`: git-ignored, excluded by
         eslint, and outside what knip scans, so step 3's `pnpm verify` never sees them. The
         script is `.mjs`: tsconfig.json includes every `.ts` file, `.tmp/` too. They are deleted
         after step 5
      2. check that every caller is switched (update.mjs, dream.mjs, C20, pre-commit, pre-push,
         setup, the hook) and that no old export or `--reindex` is left; update the agent definitions, README.md and
         _template.md (the owner approves the text), `.gitattributes`, `.gitignore`, the comments,
         ADR 0021, ARCHITECTURE.md, CONVENTIONS.md, AGENTS.md
      3. commit slices 1–6's code first, staging explicit paths: the code, `.gitattributes`,
         `.gitignore`, and `.claude/memory/README.md` and `.claude/memory/_template.md` (they are
         not locked). It stages no locked path, so the lock lets it through, and the hook's
         `pnpm verify` runs the new C20 on the migrated memory in the working tree
      4. commit the memory with `MEMORY_UPDATE=1 git commit -- .claude/memory`, which takes the
         rest of the folder: the lock accepts it, C20 runs on the working tree. The `memories/**`
         crypt line already exists, so the fact files are encrypted; `usage/` matches no crypt line
         and is committed in plaintext
      5. the owner reviews the memory diff; merge into `dev` with no dream on `dev` in between
      6. tell the owner which branches and worktrees are open: each merges `dev` before its next
         dream and pushes with `MEMORY_SKIP=1` until then (§2)
- [ ] 7. `fold.mjs`, `memory:fold` and `memory-usage-fold.yml`. **Owner step:** create the GitHub
      App `sellest-agent` in the Sellest-AI org (contents and pull requests: write, selected repos,
      Cuisko among them), install it, and store `SELLEST_AGENT_APP_ID` and
      `SELLEST_AGENT_PRIVATE_KEY` as org secrets Cuisko can read.
      Then one `workflow_dispatch` run, and the two-branch merge check from §1. Check that no
      ruleset refuses the App's force-push to `chore/memory-usage-fold`

---

## Open questions

None.

---

## Review log

```
round 1   REVISE   14 findings (7 blocking): all fixed. Q1 (how slice 6 is committed) answered
                   by 1.8: two commits, no --no-verify, because the hooks check the working tree
round 2   REVISE   9 findings (3 blocking): all fixed. 2.1 took the recommended option: no id rule,
                   a rename is detected by file name
round 3   REVISE   2 non-blocking findings: both fixed
round 4   READY    (the migration script is .mjs: tsconfig covers .tmp/)
```

---

## Landing

- [ ] Plan review loop ended READY, and the user agreed the plan
- [ ] `pnpm verify` green
- [ ] `architecture-reviewer` clean, or its findings approved
- [ ] Decisions worth keeping promoted: ADR 0021 amended (layout, usage files, the fold)
- [ ] The github-workflow plan updated to build on this layout
- [ ] **This file deleted** — the slice is not done while it exists
