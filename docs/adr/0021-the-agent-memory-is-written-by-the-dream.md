---
id: 0021
applies_to: ["scripts/memory/**", "scripts/checks/c20-memory-integrity.mjs", ".claude/memory/**", ".claude/agents/dream-*.md", ".claude/hooks/session-start-memory.mjs", ".claude/settings.json", ".githooks/**", ".gitattributes", ".github/workflows/memory-encryption.yml"]
status: accepted
supersedes: []
---

# The agent memory is written by the dream alone, encrypted, and shown to the owner first

MUST: change `.claude/memory/index.md`, `usage.json` and `memories/**` only through
      `pnpm memory:update`, whose commit carries `MEMORY_UPDATE=1` and the trailer
      `Memory-Update: yes`. The pre-commit lock refuses any other commit staging them, except a merge
      or a revert, and refuses a `MEMORY_UPDATE=1` commit that stages anything else.
MUST NOT: let a session agent write the memory. `.claude/settings.json` denies `Edit` on those
          three paths; a session says what is worth keeping on one reply line starting `Memory:`.
MUST: keep every memory path encrypted by transcrypt through `.gitattributes`. A plaintext memory
      file reaching a pushed commit fails `memory-encryption.yml`; `MEMORY_KEY` lives in
      `.env.local` and is never committed.
MUST: mask personal data before a transcript enters any prompt (`mask` in
      [pii.mjs](../../scripts/memory/_lib/pii.mjs), applied by condense and excerpts), and refuse it
      after: C20 scans the memory in every `pnpm verify` and on the dream's copy.
MUST: run each dream agent through `runAgent`: it reads the repo but not `.env*` or `.git/`, runs
      no Bash but `git log`, and writes only where the script grants. A writer gets its one file;
      the reviewer gets `memories/` of the dream's copy. After each step the script compares the
      copy with what it was and stops the dream on a change outside the grant, then runs C20 again.
MUST: write a statement about the code as a fact only if it holds in the repo today, else as a
      `Hypothesis: ` bullet, and end every fact with its source date.
MUST: show the owner the whole diff, the reviewer's fixes and its open flags before anything reaches
      the repo. Nothing is written without `[o]` or a `[m]` correction.
MUST NOT: delete a memory as unused before `UNUSED_AFTER_SESSIONS` (in
          [responses.mjs](../../scripts/memory/_lib/responses.mjs)) sessions started without
          reading it. Staleness is counted in sessions, never in days, so a repo nobody works on
          ages nothing. A memory whose subject is gone may go sooner; the owner judges its reason.
MUST: refuse a branch push while a finished Claude session on it is unread by a dream.
      `MEMORY_SKIP=1 git push` is the owner's escape, for one push.
MUST NOT: set `cleanupPeriodDays` to 0. Setup refuses it: transcripts the dream has not read
          would be lost.
MAY: commit the memory (`chore(memory): …`) on whichever branch the dream ran on, `dev` included.
     It is the one sanctioned direct commit on `dev`.
MAY: pin the dream agents to the model aliases `haiku`, `opus` and `sonnet`. The owner chose them
     on purpose: the dream follows each family's newest model.

## Why

Sessions forget what the owner corrected and decided. A memory a session could write itself would
hold unreviewed claims, so it is written only after the session, by a pipeline the owner reads
before it lands: cheap extractors find the candidate facts in each conversation, a planner groups
them into files, writers word each file from the cited passages, C20 checks the result, and a
reviewer in a fresh context checks each fact against its source, fixing what the evidence settles.
The steps (U1–U11, P1–P7) are in the docblock of
[update.mjs](../../scripts/memory/update.mjs).

The lock is a guard rail, not a boundary: an agent can type `MEMORY_UPDATE=1`, as it can type
`--no-verify`. The encryption workflow and the owner's diff are the gates. Git keeps whatever is
committed, even encrypted, which is why personal data is masked before a model reads it, not at
commit.

The specification is the owner's document "Architecture mémoire agent" (2026-11-08), kept outside
the repo. Each module's docblock names the section it implements.

## Verify

`pnpm test` runs `scripts/memory/__tests__/` (the lock, the push block, the dream's grants and
checks, the masks) and `c20-memory-integrity.test.ts`. `pnpm check:memory` runs C20 on the memory,
and `pnpm verify` runs it on every commit. `memory-encryption.yml` reads the stored blobs of every
push in CI. The deny rules were probed once in a live session: an `Edit` on `index.md` is refused.

## See also

[0008](./0008-tests-are-layered.md): the `scripts` Vitest project these tests run in
