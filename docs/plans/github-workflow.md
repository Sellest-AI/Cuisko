---
slice: github-workflow
branch: chore/github-workflow
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# Changes reach `dev` and `main` by pull request only

After this lands, every change starts as an issue the owner created, is investigated and built by
the `sellest-agent` GitHub App on its own branch, carries its memory update in that branch, and
reaches `dev` and then `main` only through a pull request the owner approved.

---

## 1. Problem

**What is broken or missing.** `dev` has no protection: an agent merges into it locally and
pushes, and the dream commits the memory on it directly (`push:dev`). `main` has a ruleset, but the
owner's account bypasses it with mode `always`, so a direct push still works. Nothing records why a
change was made: no issue, no root cause, no review trail. And Dependabot PRs target `main`, so
merging one would ship to production without passing through `dev`.

**How we would know it worked.**

- `git push origin dev` and `git push origin main` are refused by GitHub, for every account.
- A PR into `dev` cannot be merged while `verify`, `issue` or `memory` is red, or without the
  owner's approval. The same holds on `main` for `verify` and the approval.
- Every PR fixes an open issue, whoever opened it: the owner decides which issue an agent works
  on, and reads a stranger's issue before giving it to one. Every comment, branch, commit and PR an agent makes is authored by `sellest-agent[bot]`.
- Nothing is committed on `dev` by hand or by an agent: the memory reaches `dev` inside a PR.
- A release is one PR, `dev → main`, whose body lists the issues it closes; those issues close when
  it merges.

**Product fit.** None of PRODUCT.md's four tests applies: this changes how code reaches the cook,
not what the cook sees. It comes near no anti-goal. Its user-side effect is that nothing reaches the
preview or production phones unreviewed.

**Out of scope.**

- `deploy.yml` and `ci.yml`'s `verify` and `deploy` jobs: unchanged. Merging into `dev` or `main`
  still ships exactly as today.
- The Claude GitHub App (`@claude` in issues, run in Actions): not used. Every agent session stays
  local.
- A merge queue: one owner merges. A PR behind `dev` is brought up to date by `pr:push` (§2).
- PRs the owner authors: the owner can never approve their own PR, and they are the only code
  owner. A change the owner makes by hand goes on a branch, and an agent runs `pr:push` on it.
- Screenshots in PRs: the bot attaches none and asks for none.
- The owner reviewing the memory: `pr:push` dreams with `--auto`, which accepts what the dream
  keeps. The memory is in the PR's commits, encrypted; the PR body lists the fact titles.
- The owner's own `gh` login on this machine stays. An agent could still reach it; the deny rules
  and the skill say it must not. Accepted, not recorded in an ADR.

---

## 2. Architecture

There are no tables and no Convex operations in this slice. Its "architecture" is GitHub's
configuration, one App identity used locally, three CI checks, and the PR script.

### Identities

| Who | Acts as | Credentials on this machine | Can |
| --- | --- | --- | --- |
| Owner | GitHub account `franckdsf`, the only code owner | their SSH key and their `gh` login, as today | create issues (form, or the mod's card), approve, merge |
| Claude sessions | the GitHub App `sellest-agent`, installed on Cuisko: Contents, Issues, Pull requests read/write; Actions, Metadata read | `SELLEST_AGENT_APP_ID` and `SELLEST_AGENT_PRIVATE_KEY` (base64 of the PEM, one line) in `.env.local`, beside `MEMORY_KEY` | comment, label, push branches, open and edit PRs. Its approval does not count (not a code owner) |
| Release | the repo's deploy key `RELEASE_DEPLOY_KEY` | in Actions secrets only | push the release commit and tag to `main`, fast-forward `dev` (bypass on both rulesets), as today |
| Fold Action | `sellest-agent`, through the org secrets of the same names | none | the monthly `chore/memory-usage-fold` PR into `dev`, as today |
| Dependabot | `dependabot[bot]` | GitHub's | open dependency PRs into `dev` |

**How a session acts as the App.** A key signs a JWT (10 minutes at most); the JWT buys an
installation token (1 hour); the token does the work. `scripts/github/_lib/appToken.mjs` does both
steps and caches the token in `.tmp/github/token.json` (git-ignored) until 5 minutes before it
expires.

- **git** asks a credential helper, `scripts/github/git-credential.mjs`, which answers
  `x-access-token` and a token from `appToken`. Every push gets a valid token, however long the
  session.
- **gh** runs for agents only through `pnpm gh:bot <args>` (`scripts/github/gh-bot.mjs`): it gets a
  token and runs `gh <args>` with `GH_TOKEN` set and `GH_CONFIG_DIR` pointing at an empty folder
  under `.tmp/github/`, so the owner's login is never read. A deny rule refuses bare `gh` in
  sessions. The owner's terminal and the mod's button run plain `gh`, as the owner.

The `env` block of the **committed** `.claude/settings.json` sets the rest for Claude sessions
only, so every checkout and every worktree has it. Nothing in it is a secret:

| Variable | Value |
| --- | --- |
| `GIT_AUTHOR_NAME`, `GIT_COMMITTER_NAME` | `Sellest Agent` (the login stays `sellest-agent[bot]`: GitHub links the commit through the email) |
| `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_EMAIL` | `<bot user id>+sellest-agent[bot]@users.noreply.github.com` (the id is read once in slice 1 with `gh api users/sellest-agent%5Bbot%5D`) |
| `GIT_CONFIG_COUNT` and `GIT_CONFIG_KEY_n` / `GIT_CONFIG_VALUE_n` | `credential.https://github.com.helper` = empty (resets the helpers configured before it, Git Credential Manager among them, so the owner's login is never offered), then `credential.https://github.com.helper` = `!node "$(git rev-parse --show-toplevel)/scripts/github/git-credential.mjs"`; `url.https://github.com/.insteadOf` = `git@github.com:` (the bot pushes over HTTPS, never with the owner's SSH key) |
| `MEMORY_SKIP` | `1`: see "The pre-push hook" below |

Slice 1 checks, in the main checkout and in a worktree, that a push from a session reaches GitHub
as `sellest-agent[bot]` and that Git Credential Manager is never asked.

**The key is read like `MEMORY_KEY`.** `setup.mjs`'s private `readKey` reads one variable from
`.env.local`, falling back to the main checkout's file in a worktree. It is extracted, not copied,
into `scripts/_lib/localEnv.mjs` as `readLocalEnv(name, { root, mainRoot })`; `setup.mjs` calls it for
`MEMORY_KEY`, `appToken` for the two App variables.

**A session without the App refuses to write to GitHub.** The existing SessionStart hook
(`.claude/hooks/session-start.mjs`) checks that both variables are found and that `appToken`
returns a token (from the cache when it is fresh). On failure, it adds one line to the session's
context: "GitHub App sellest-agent is not available (<reason>): push, comment and open no PR until
it is fixed". The `working-issues` skill and `pr:push` stop on that line's cause. A dream agent
never reaches the check: the hook already exits on `isDreamSession()` (`session-start.mjs:17`),
and the App check goes after that line.

**The pre-push hook.** It refuses a push while it finds unread transcript lines, and the bot's own
running session always has some. The bot's env sets `MEMORY_SKIP=1`: its pushes pass with the
hook's reminder. The gate moves to CI: the `memory` check refuses the merge until `pr:push` has
dreamed after the last code commit. The owner's own pushes keep the hook as today.

### Rulesets

Kept as JSON in the repo and imported by the owner (Settings → Rules → Import a ruleset), because
only an admin can write them and the App is not one.

| Rule | `protect-dev` (new) | `protect-main` (changed) |
| --- | --- | --- |
| Target | `refs/heads/dev` | `refs/heads/main` |
| Deletion, force-push | refused | refused (unchanged) |
| Pull request | required, 1 approval, code-owner review, stale approvals dismissed on push, **last-push approval off** | same (last-push approval goes from on to off) |
| Merge methods | `rebase`, and `merge` for a `sync/` PR | `merge` (was `rebase`) |
| Required checks, branch up to date | `verify`, `issue`, `memory` | `verify` |
| Restrict updates | no | **removed** |
| Bypass | deploy key, `always` | deploy key, `always`; the owner's `always` bypass **removed** |

Why each change:

- **Merge commit into `main`:** GitHub's rebase merge rewrites SHAs, so a rebased release would
  leave `main` and `dev` diverged, and the release's `git push origin HEAD:dev` would stop
  fast-forwarding.
- **Merge allowed into `dev` too:** a hotfix, or a release that could not fast-forward `dev`, comes
  back to `dev` as a merge commit (the sync PR, §2 Flow). Rebased, `main`'s commits would get new
  SHAs, and every later `dev → main` PR would fail "branch up to date". A ruleset cannot tie a
  method to a head branch, so both are allowed on `dev`; the PR template and the skill say which to
  press, and the `memory` check fails a merge commit from any head but a `sync/` branch (§3).
- **Restrict updates removed:** with it, only bypass actors can merge. With no owner bypass, only
  the deploy key could. Code-owner review is the gate instead.
- **Last-push approval off, on both:** GitHub refuses an approval from whoever pushed the head
  last. The owner's own "Rebase and merge" is a push to `dev`, so the head of every `dev → main`
  release PR is last pushed by the owner, the only code owner: with it on, no release could ever be
  approved. Stale-approval dismissal keeps the guarantee that the owner approved after the last
  push. Slice 3 checks on its test PR that the owner can approve a head they pushed last.

`.github/CODEOWNERS` holds one line, `* @franckdsf`. No team: a role in the repo's settings says
what someone can do, never whose approval counts. Adding a reviewer later is giving them the Write
role and adding their login to that line, in a commit.

### Flow

```
OWNER        "file a bug: eggs counted twice" in a session
CUISKO       the agent writes .tmp/issues/eggs-counted-twice.md
OWNER        the mod's card → Create issue ──► gh issue create, as the owner ──► #12
               │   "fix #12" in a session (on a branch, never on dev)
               ▼
SELLEST-AGENT working-issues skill
               systematic-debugging ──► first comment on #12 (cause, impact, fix, pinning test)
               branch fix/12-eggs-counted-twice ──► committing skill (review, commits)
               writes .tmp/pr/fix-12-eggs-counted-twice.md
               pr:push ──► rebase onto origin/dev ──► dream --auto ──► push ──► PR "Fixes #12"
               │   review comments ⇄ fixes, each ending in pr:push
               ▼
CI           verify ✓  issue ✓  memory ✓
OWNER        approve, "Rebase and merge" ──► dev ──► deploy.yml (preview, Convex dev)
               ⋮
OWNER        "release" in a session ──► SELLEST-AGENT opens dev → main: version, issues, ship type
OWNER        approve, "Create a merge commit" ──► main ──► deploy.yml (production) ──► #12 closes
```

**Hotfix:** branch `hotfix/<n>-<slug>` from `main`, its PR file says `base: main`, `pr:push`
rebases onto `origin/main` and opens the PR into `main` (merge commit).

**Sync `main` back into `dev`** (after a hotfix, or a release whose fast-forward of `dev` failed):
a PR with head `main` itself can never pass "branch up to date" with `dev`, because `main` lacks
`dev`'s newer commits and `protect-main` refuses to merge `dev` into it. So the bot makes
`sync/main-<YYYY-MM-DD>` from `origin/main`, merges `origin/dev` into it (a merge commit; a conflict
is resolved by the agent like any other), pushes it, and opens its PR into `dev`. The owner presses
"Create a merge commit". `dev` then contains `main`'s tip, and the next release PR is up to date.
The `issue` and `memory` checks skip a head under `sync/` from this repository (§2 CI checks).

A sync branch never goes through `pr:push`: its rebase would flatten the merge and give `main`'s
commits new SHAs, and its dream would add a memory commit nobody needs. `pr:push` refuses a
`sync/` branch. The `working-issues` skill runs the steps itself:

```
git fetch origin main dev
git switch -c sync/main-<YYYY-MM-DD> origin/main
git merge --no-ff origin/dev
git push -u origin sync/main-<YYYY-MM-DD>:refs/heads/sync/main-<YYYY-MM-DD>
pnpm gh:bot pr create --base dev --head sync/main-<YYYY-MM-DD> --title "chore: sync main into dev" --body …
```

If `dev` moves while the sync PR is open, the skill merges `origin/dev` into the branch again and
pushes it plainly: one more merge commit, no rewrite, no force-push. The `memory` check skips the
branch, so its merge commits are allowed.

### `pr:push`

Replaces `push:dev`. One command takes a branch from local commits to an up-to-date PR:

```
0. refuse: on dev, main or a sync/ branch · a dirty tree · no .tmp/pr/<branch slug>.md ·
   the App unavailable
1. git fetch origin <base> <branch>   (base from the PR file, dev by default)
   lease = origin/<branch>'s sha, or none when the branch was never pushed
   refuse when origin/<branch> is neither contained in the local branch nor equal to the sha
   recorded in .tmp/github/pushed/<branch slug> (what pr:push last pushed): someone else pushed.
   A local rebase from an earlier run that stopped before its push is not a refusal.
2. git rebase origin/<base>   a conflict: git rebase --abort, stop; the branch is unchanged
3. memory:update --auto        on top of base: the planner sees the facts other PRs merged.
                               --auto skips U2 (the git pull): pr:push has just fetched and
                               rebased, and a pull would merge the old origin/<branch> back in
4. push: never pushed           → git push -u origin <branch>:refs/heads/<branch>
         origin/<branch> in HEAD → git push origin <branch>:refs/heads/<branch>
         otherwise              → git push --force-with-lease=<branch>:<lease> origin <branch>:refs/heads/<branch>
   then write HEAD's sha to .tmp/github/pushed/<branch slug>
5. gh:bot pr view <branch>: none → gh:bot pr create --base <base> --title … --body-file …
                            open → gh:bot pr edit --title … --body-file …
   the body is the PR file with its "Memory" section filled by memorySummary
```

**Run from a session.** A dream starts several `claude -p` agents, each allowed 20 minutes
(`runAgent.mjs`), and a session's Bash tool kills a command after 10 minutes at most. So the
`working-issues` skill runs `pr:push` in the background and waits for its completion notice; it
never polls. `runAgent` starts each agent with the session's environment: slice 5 checks that
`claude -p` runs from inside a Claude Code session, and if the CLI refuses a nested start, `runAgent`
drops the variables the CLI uses to detect one (`CLAUDECODE` and its siblings) from the child's env.

**A killed run** (the session ends, the process is stopped) leaves at most the dream lock and the
dream's folder. Slice 5 reads `acquireDreamLock`: a lock whose holder process is gone must not block
the next run; if it does today, `pr:push` names the lock file and the agent removes it after
checking that no dream runs. The dream's folder is reused as a pending commit, as today. No push
has happened unless step 4 finished, and step 1 accepts the rerun.

**Force-push.** AGENTS.md forbids it; `pr:push` is the one exception, written into ADR 0022 and
AGENTS.md's Never table: only `pr:push`, only with an explicit lease sha, never on `dev` or `main`.
The lease refuses to overwrite a push made since step 1, whatever was fetched.

**A rebase replays the memory commits without running the pre-commit hook.** That is safe here: a
replayed commit carries the same fact files, already checked by C20 when the dream committed them.
A conflict on a fact file (two PRs edited the same fact) stops at step 2 like a code conflict; the
message says to wait until the other PR merges, then run `pr:push` again after
`git rebase --skip` of the conflicting memory commit is decided by the agent with the owner.

**Stops.** Step 2: the branch is unchanged, nothing pushed. Step 3 (a failed dream: network,
quota, C20): the branch is rebased locally, nothing pushed; a rerun starts at step 1, which accepts
the local rebase (origin still equals the recorded sha), the rebase is then a no-op, and the dream's
pending folder is reused as today. Step 4 (a refused lease): nothing pushed; the message says
someone else pushed to the branch. Step 5 (gh failure): the branch is pushed; a rerun finds
nothing to read, makes no new commit (the newest commit already carries the trailer), pushes
nothing new and edits or creates the PR.

**The Memory section** (`memorySummary({ base, head })`) lists, for the whole PR (`base..head`),
the fact titles added, changed and dropped, grouped by topic, read from the fact headers: the
current file for added and changed, `git cat-file --filters <base>:<path>` for dropped (the blobs
are ciphertext; `--filters` runs transcrypt's smudge). "No fact changed" when there is none.

### The dream with `--auto`

`memory:update --auto` runs the same dream with no prompt:

- U2 (`git pull`) is skipped (see `pr:push` step 3).
- U8 answers `[o]`. There is no `[m]` round and no `:e`.
- The reviewer's prompt (P6) gets one more line: "The terminal is non-interactive: fix as many
  flags as you can; everything you leave flagged is dropped." A fact the reviewer still leaves for
  the owner is dropped, and named in the run's output.
- A dream that read no session commits an **empty commit** with the trailer (below), so the
  `memory` check sees the dream ran, but only when the branch's newest commit lacks the trailer.
  A resync after `dev` moved, or a rerun after a failed PR call, adds no commit when there is
  nothing new.
- Any failure exits non-zero, so `pr:push` stops.

The interactive dream stays for the owner's terminal. Neither form commits on `dev` or `main`:
`update.mjs` refuses there (ADR 0021 amended).

**The empty memory commit.** Taken by `update.mjs` on a branch other than `dev` and `main` when the
run ends in "nothing to read" and `HEAD`'s message has no `Memory-Update: yes` trailer:

```
refuse if anything is staged outside .claude/memory/   (an empty commit takes no pathspec, so it
                                                        would sweep in whatever is staged)
git commit --allow-empty -F <message file>             with MEMORY_UPDATE=1, as _commit does
message   chore(memory): no session to read
          + the trailer Memory-Update: yes
```

No dream folder exists on "nothing to read", so the message file goes to `.tmp/memory/` directly.
Stamps: "nothing to read" writes none, as today.

**Sessions on `dev`.** Nothing is committed on `dev` any more, but a session may still run there.
Its transcript stays unread until the next dream, on any branch, which reads every unread session
as today.

**Merged branches.** `openBranches` (`transcripts.mjs`) defers the lines of every local branch whose
tip is not in the pushed commit. A rebase merge rewrites SHAs, so a merged `fix/12-…` never looks
merged: its later lines (review fixes, closing chat) would wait as long as the local branch exists,
and `git branch -d` refuses it. So once its PR merges, `working-issues` removes its worktree, if any,
and deletes the local branch with `git branch -D`. Its unread lines are then read by the next
dream on any branch.

### CI checks

A new workflow, triggered by `pull_request` (`opened`, `edited`, `synchronize`, `reopened`) on a PR
into `dev`. Two jobs, each a thin call into a tested script. It only reads, so a fork's PR is safe:
`permissions: { contents: read, issues: read, pull-requests: read }`.

| Job | Passes when | Skips (passes) when |
| --- | --- | --- |
| `issue` | the PR body names at least one issue with `Fixes`, `Closes` or `Resolves #N`, and each named issue exists and is open, whoever opened it | the author is `dependabot[bot]`; the head is **this repository's** `sync/…` branch; the head is this repository's `chore/memory-usage-fold` (the fold PR) |
| `memory` | the newest non-merge commit in `base..head` carries the trailer `Memory-Update: yes`, and `base..head` holds no merge commit | the author is `dependabot[bot]`; the head is this repository's `sync/…` branch |

The fold PR needs no `memory` skip: its commit carries the trailer (memory-usage-fold.yml).
`isSkipped` reads the head repository, not just the branch name, so a fork's `sync/…` branch is
checked like any other branch.

`memory` reads history, so its job checks out with `fetch-depth: 0`, and reads
`HEAD_SHA = github.event.pull_request.head.sha` and `BASE_SHA = github.event.pull_request.base.sha`.
`GITHUB_SHA` is GitHub's test merge commit, not the branch tip.

GitHub closes an issue when a commit or a PR body with `Fixes #N` reaches the default branch
(`main`). The release PR into `main` has no such line of its own, so the bot also writes `Fixes #N`
in the fix commit's body (it survives the rebase merge into `dev`, then the merge into `main`).

### Issues

The owner creates every issue, two ways:

- **On GitHub** (web, mobile): the issue forms (§3 "Forms").
- **From a session:** the agent writes a draft to `.tmp/issues/<slug>.md`. The mod `issues@sellest`
  draws a card for it with two buttons. **Create issue** runs `issue:create` on the file: it runs
  plain `gh issue create` with the draft's title, body and labels, with `GH_TOKEN`, `GH_CONFIG_DIR`
  and every `GIT_CONFIG_*` removed from its env, so `gh` uses the owner's login. It refuses when
  `gh api user` answers `sellest-agent[bot]` or nothing. On success it prints the URL and deletes
  the draft. **Discard** deletes the draft. The mod registers no tool and no command for Claude, so
  only the owner's click creates anything. Running `issue:create` from a session is denied.

### Labels

Kept as code in `.github/labels.json` (JSON: no YAML parser to add), applied by `github:labels --apply` as the sellest-agent App, with its installation token.

- Type, exactly one: `bug`, `feature`, `chore`, `docs`.
- Area, one or more: `account`, `assistant`, `auth`, `groceries`, `health`, `home`, `households`,
  `navigation`, `network`, `onboarding`, `planning`, `recipes` (the modules under `src/modules/`),
  and `infra` (CI, release, tooling).
- Kept for Dependabot: `dependencies`, `javascript`.
- Deleted: GitHub's defaults (`documentation`, `duplicate`, `enhancement`, `good first issue`,
  `help wanted`, `invalid`, `question`, `wontfix`).

### Existing data

- **Dependabot PR #6** targets `main`: retargeted to `dev` once the config lands. It has no issue
  and no memory commit, which the skips cover.
- **`dev`'s history**, memory commits on `dev` included: untouched. The rules apply from the import.
- **Labels on old PRs:** `enhancement` / `documentation` are on no open issue; deleting them is safe.
- **Open branches and worktrees** made before this lands have neither `pr:push` nor
  `scripts/github/`. Their first step is by hand: `git fetch origin` then
  `git rebase origin/dev`; after that `pr:push` exists on the branch and works like on any other.
  The `working-issues` skill says so, and the owner is told at landing, with the list of open
  branches.
- **The fold PR** (memory-layout slice 7) passes the checks: `issue` skips it, its commit carries
  the trailer.
- **The open branch of this slice** is itself merged through a PR, so `protect-dev` is imported
  before it is merged (slice 8), and that PR is the first to pass the three checks.

### Cost and limits

- Actions minutes: free on a public repo. Two small jobs per PR event.
- Each `pr:push` runs one dream: the model calls are the dream's, as today. The bot runs it when it
  asks for a review and after each review fix, not on every commit.
- `gh:bot`: two GitHub API calls when the cached token is stale, none otherwise.
- No paid call, no Convex limit.

---

## 3. Program design

**Reuses.**

- `scripts/memory/update.mjs` (`_commit`, `_finish`, the pending rerun) for `--auto` and the empty
  commit. `scripts/memory/pre-commit.mjs` needs no change: with `MEMORY_UPDATE=1` and nothing
  staged, it already answers `memory-only`.
- `readKey` in `scripts/memory/setup.mjs`, **extracted** into `scripts/_lib/localEnv.mjs` (the
  second caller is `appToken`), never copied.
- The JWT shape of `scripts/release/_lib/appleClientSecret.mjs` (`node:crypto` `sign`, base64url
  parts). Not the function itself: GitHub wants RS256 and other claims. `appJwt` is written once.
- `readFacts` (`scripts/memory/_lib/memoryFiles.mjs`) for the fact titles of the Memory section.
- `releaseVersion` in `scripts/release/_lib/nextVersion.mjs` for the release PR's version.
- The `systematic-debugging` and `committing` skills, called by `working-issues`, not copied.
- The `plugin-authoring` skill to write the mod.
- Commit trailer parsing: none exists in `scripts/`; the check writes `hasMemoryTrailer` once.

**Files created or changed:**

```
+ .github/CODEOWNERS                               * @franckdsf
+ .github/ISSUE_TEMPLATE/config.yml                blank_issues_enabled: false
+ .github/ISSUE_TEMPLATE/1-bug.yml                 label bug; fields in "Forms"
+ .github/ISSUE_TEMPLATE/2-feature.yml             label feature
+ .github/ISSUE_TEMPLATE/3-task.yml                label chore or docs, chosen in the form
+ .github/pull_request_template.md                 Fixes · Changed · How it was verified · Memory
+ .github/dependabot.yml                           npm, weekly, target-branch dev
+ .github/labels.json                              the label set, group · name · color · description
+ .github/rulesets/protect-dev.json                imported by hand
+ .github/rulesets/protect-main.json               imported by hand, replaces the live one
+ .github/workflows/pull-request.yml               jobs issue, memory
+ scripts/_lib/localEnv.mjs                        readLocalEnv, extracted from setup.mjs
+ scripts/github/_lib/appToken.mjs                 appJwt, installationToken (cached)
+ scripts/github/_lib/pullRequest.mjs              linkedIssues, isSkipped, hasMemoryTrailer, memoryVerdict
+ scripts/github/_lib/prFile.mjs                   parsePrFile, renderPrBody
+ scripts/github/_lib/issueDraft.mjs               parseDraft, issueArgs
+ scripts/github/_lib/labels.mjs                   labelPlan
+ scripts/github/git-credential.mjs                git's credential helper: the App token
+ scripts/github/gh-bot.mjs                        CLI behind gh:bot
+ scripts/github/pr-push.mjs                       CLI behind pr:push (§2)
+ scripts/github/create-issue.mjs                  CLI behind issue:create
+ scripts/github/check-issue.mjs                   CLI for the issue job
+ scripts/github/check-memory.mjs                  CLI for the memory job
+ scripts/github/sync-labels.mjs                   CLI behind github:labels
+ scripts/memory/_lib/memorySummary.mjs            memorySummary
+ scripts/github/__tests__/…                       appToken, pullRequest, prFile, issueDraft, labels, pr-push
+ scripts/memory/__tests__/memorySummary.test.ts
+ scripts/_lib/__tests__/localEnv.test.ts
+ .claude-plugin/marketplace.json                  marketplace "sellest", lists ./.claude/plugins/issues
+ .claude/plugins/issues/.claude-plugin/plugin.json
+ .claude/plugins/issues/hooks/register.tsx        the band, its two buttons (hooks.json names it)
+ .claude/plugins/issues/types/index.d.ts          the mod's $.state contract
+ .claude/plugins/issues/README.md                 what it does, the Claude Code version tested
+ .claude/skills/working-issues/SKILL.md           an issue's path, the PR file, the release, the hotfix
+ docs/external/github.md                          the App, its key in .env.local, the code owner, the rulesets
+ docs/adr/0022-changes-reach-dev-and-main-by-pull-request.md
○ .claude/settings.json                            the env block; deny rules; the sellest marketplace + issues@sellest enabled
○ .env.example                                     SELLEST_AGENT_APP_ID, SELLEST_AGENT_PRIVATE_KEY
○ package.json                                     gh:bot, pr:push, issue:create, github:labels; push:dev removed
- scripts/memory/push-dev.mjs                      replaced by pr:push; its test goes with it
○ scripts/memory/setup.mjs                         readKey → readLocalEnv
○ scripts/memory/update.mjs                        --auto; the empty commit; refuses on dev and main
○ .claude/agents/dream-reviewer.md                 the non-interactive line, read when --auto
○ scripts/memory/pre-push.mjs                      its message names pr:push instead of push:dev
○ .claude/hooks/session-start.mjs                  the App check
○ docs/adr/0021-the-agent-memory-is-written-by-the-dream.md   memory on PR branches, never on dev; --auto; MEMORY_SKIP for the bot
○ .claude/skills/committing/SKILL.md               "Into dev / Into main" becomes "pr:push, then the owner merges"
○ AGENTS.md                                        "Issues and pull requests"; Never table: the pr:push exception; Committing
○ docs/ARCHITECTURE.md                             § Releases: the release PR; the scripts/memory line
○ docs/external/deployments.md                     "a merge into dev" stays true; the PR wording added
```

(Package scripts are written without their `pnpm` prefix in this file: C6 checks every
`pnpm <script>` in `docs/` against `package.json`, and these do not exist yet.)

**Signatures.**

```js
// scripts/_lib/localEnv.mjs
readLocalEnv(name: string, { root, mainRoot }: { root: string, mainRoot: string }): string | null
    // .env.local in the checkout, then in the main checkout (worktree); null when absent or empty

// scripts/github/_lib/appToken.mjs
_appJwt({ appId: string, privateKey: string, now: Date }): string     // private; RS256, iat now-60s, exp now+9min
installationToken({ root, mainRoot, repo, now, fetch }): Promise<{ token: string, expiresAt: Date }>
    // reads the two variables, finds the installation of `repo`, caches in .tmp/github/token.json;
    // throws AppTokenError naming what is missing (variable, key format, HTTP status)

// scripts/github/_lib/pullRequest.mjs
linkedIssues(body: string): number[]              // Fixes|Closes|Resolves #N, case-insensitive, deduplicated
isSkipped(pr: { author, headRef, headRepo, baseRepo }, { check }: { check: "issue" | "memory" }): boolean
issueVerdict(issue: { number, state, pullRequest } | null): { ok: true } | { ok: false, reason: string }
_hasMemoryTrailer(message: string): boolean       // private, tested through memoryVerdict; a trailer line "Memory-Update: yes"
memoryVerdict(commits: { sha, message, parents: string[] }[]): { ok: true } | { ok: false, reason: string }
                                                  // newest first; refuses an empty list, any merge
                                                  // commit, and a newest commit without the trailer

// scripts/github/_lib/prFile.mjs
parsePrFile(text: string): { title: string, base: "dev" | "main", body: string }   // throws PrFileError
renderPrBody(body: string, { memory }: { memory: string }): string  // fills or replaces "## Memory"

// scripts/memory/_lib/memorySummary.mjs
memorySummary({ top, base, head }): string        // markdown: topic → added / changed / dropped titles

// scripts/github/_lib/issueDraft.mjs
parseDraft(text: string): { title: string, type: Type, areas: Area[], body: string }   // throws DraftError
issueArgs(draft): string[]                        // gh issue create --title … --body-file - --label …

// scripts/github/_lib/labels.mjs
labelPlan(wanted: Label[], live: Label[]): { create: Label[], update: (Label & { from: string })[], remove: Label[] }
```

**The PR file** (`.tmp/pr/<branch with / as ->.md`, written by the agent):

```md
---
title: "fix(planning): eggs counted twice on the week plan"
base: dev
---
Fixes #12

## Changed
…
## How it was verified
…
## Memory
(filled by pr:push)
```

**The issue draft** (`.tmp/issues/<slug>.md`, written by the agent):

```md
---
title: Eggs counted twice on the week plan
type: bug
areas: [planning, groceries]
---
<body, in the shape of the matching form>
```

**CLIs.**

```
gh:bot <gh args>                          gh with the App's token, the owner's login unreadable
pr:push                                   §2 "pr:push"
memory:update --auto                      the dream with no prompt (§2)
issue:create .tmp/issues/<slug>.md        run by the mod's button; gh as the owner; deletes the draft
node scripts/github/check-issue.mjs       reads PR_BODY, PR_AUTHOR, HEAD_REF, HEAD_REPO, BASE_REPO,
                                          GH_TOKEN from env
node scripts/github/check-memory.mjs      reads BASE_SHA, HEAD_SHA, PR_AUTHOR, HEAD_REF, HEAD_REPO,
                                          BASE_REPO; uses git
github:labels [--apply]                   prints the plan; --apply runs it as the sellest-agent App
```

`HEAD_REPO` and `BASE_REPO` come from `github.event.pull_request.head.repo.full_name` and
`base.repo.full_name`.

**Deny rules** added to `.claude/settings.json`:

```
Bash(gh *)  Bash(*issue:create*)  Bash(node scripts/github/create-issue*)
Bash(git push * dev*)  Bash(git push * main*)  Bash(git push * HEAD:dev*)  Bash(git push * HEAD:main*)
Bash(git push --force*)  Bash(git push -f*)
Bash(pnpm gh:bot pr merge*)  Bash(pnpm gh:bot pr review*--approve*)  Bash(pnpm gh:bot api *rulesets*)
```

`git push --force-with-lease` is run by `pr:push` as a child process, not through a session's Bash
tool, so these rules do not stop it. They stop an agent from trying; the rulesets are the gate.

**Forms.** ★ = required.

| Form | Label | Fields |
| --- | --- | --- |
| Bug | `bug` | ★ What happened · ★ What you expected · ★ Steps to reproduce · ★ How often (always / sometimes / once) · ★ Platform (iOS / Android / Web, multiple) · ★ Build (production / preview / dev) · App version · ★ Area (multiple) · Screenshots or video |
| Feature | `feature` | ★ The problem (who, when, what blocks them) · ★ What you would like · Alternatives considered · ★ Area (multiple) |
| Task | `chore` / `docs` | ★ Type · ★ What needs doing · ★ Why now · ★ Area (multiple) |

A form cannot turn a dropdown answer into a label: the bot applies the area labels from the Area
answer in its first comment. A draft created through the mod carries its labels already.

**The bot's first comment** (in `working-issues`, written in the project's own words):

```
Bug      Summary · Reproduced (by which test, or what was tried) · Cause (trigger, condition at
         file:line, why nothing caught it, class: code / data / config / external) · Impact (who,
         since which commit, bad rows in prod?) · Fix (by layer) · The test that pins it ·
         Not confirmed (what could not be checked, and where it looked)
Feature  Problem · Plan (link to docs/plans/<slug>.md on the branch) · Open questions · Out of scope
```

**Shapes on GitHub** (comment and PR alike): a Mermaid diagram for a flow, a call stack or layers
crossed; a before/after table for a behaviour change; `<details>` for a log; one sentence for one
fact. A diagram only when it carries information.

**The release PR.** `dev → main`, titled `release: <version>`, opened by the bot with `gh:bot`. The
version comes from `releaseVersion` over the commits since the last `v*` tag. The body: the issues
closed (every `Fixes #N` in those commits), and the ship type, read by comparing the runtime
fingerprint of `main`'s tip with `dev`'s (`npx expo-updates runtimeversion:resolve` on each):
equal is an OTA update, different is a store build.

**Tests** (each in its folder's `__tests__/`).

```
localEnv.test.ts      the checkout's file · the main checkout's file from a worktree · quoted value ·
                      absent → null · empty → null
appToken.test.ts      appJwt: header RS256, iat 60 s back, exp under 10 min, verifies with the public
                         key · installationToken: a fresh cache is used, no fetch · a stale cache →
                         two calls, cache rewritten · a missing variable / a bad key / a 401 → its
                         AppTokenError
pullRequest.test.ts   linkedIssues: Fixes/closes/RESOLVES, several, duplicates, "#12" alone ignored,
                         a URL to another repo's issue ignored
                      isSkipped: dependabot[bot] · a sync/ head of this repo · a fork's sync/ branch
                         → not skipped · head main → not skipped · the fold branch → skipped for
                         issue, not for memory · an ordinary PR
                      issueVerdict: open → ok, whoever opened it · closed → refused · missing →
                         refused · a PR's number → refused
                      hasMemoryTrailer: the trailer · the words in the subject only · another trailer
                      memoryVerdict: trailer newest → ok · a code commit after it → refused · a merge
                         commit anywhere → refused · empty list → refused
prFile.test.ts        parsePrFile: valid · no title · base outside dev/main · base absent → dev
                      renderPrBody: fills an empty Memory section · replaces a filled one · adds it
                         when missing
memorySummary.test.ts (temp repo with a filter.crypt pair that really transforms the bytes) an added,
                         a changed and a dropped fact → their titles under their topic · a usage
                         file alone → "No fact changed"
issueDraft.test.ts    parseDraft: valid · no title · no type · type outside the four · no area · an
                         area that is not a label · issueArgs: labels, body on stdin
labels.test.ts        labelPlan: create · update colour · remove a default · keep dependencies
pr-push.test.ts       (temp repo with a bare origin, run(), the dream and gh replaced by stubs)
                      on dev or main → refused · on a sync/ branch → refused, nothing rebased ·
                      dirty tree → refused · no PR file → refused ·
                      never pushed → rebase, dream, push -u, pr create · dev unchanged → plain
                      push, pr edit · pushed with an upstream, then dev moves → a second pr:push
                      rebases, dreams with no pull, pushes with the lease of step 1 ·
                      origin/<branch> moved after step 1 → lease refused, nothing pushed · a code
                      conflict → rebase aborted, branch unchanged · pushed before, dev moved, the
                      dream fails → nothing pushed; a rerun is accepted by step 1 and pushes ·
                      a rerun after a failed pr create → no new commit, pr created · base main for a
                      hotfix · someone else pushed (origin is neither in HEAD nor the recorded sha)
                      → refused
update tests          --auto: no prompt, [o] taken, U2 not run · a fact the reviewer leaves flagged is
                         dropped and named · nothing to read on a branch → an empty commit with the
                         trailer · nothing to read and HEAD already carries the trailer → no commit
                         · something staged outside the memory → refused · on dev or main → refused,
                         interactive or not
pre-commit test       an empty MEMORY_UPDATE=1 commit → memory-only (pins today's code)
pre-push test         MEMORY_SKIP=1 still passes with the reminder (pins the bot's path)
session-start test    the line appears when a variable is missing or the token call fails, not when
                         a token comes back
setup tests           unchanged assertions pass through readLocalEnv
```

**Existing test files whose assertions change**, listed so the owner's approval of this plan covers
them (AGENTS.md: existing tests are the specification): the `push-dev` test (deleted with its
script), `pre-push.test.ts` (the message names `pr:push`), `update.test.ts` (the dream refuses on
`dev`, where it used to commit).

**Decisions I am least confident about.**

1. **The credential helper reset.** An empty `credential.https://github.com.helper` from
   `GIT_CONFIG_*` should drop Git Credential Manager for that URL. Slice 1 checks it on this
   machine; if GCM still answers, the helper moves to `credential.https://github.com/Sellest-AI/Cuisko.git`
   with `useHttpPath`, or the remote rewrite gets a dedicated host alias.
2. **A conflict on a fact file during `pr:push`'s rebase** stops the run and needs a human choice.
   Two PRs editing the same fact is rare with one fact per file.
3. **The ship type in the release PR** compares `main` and `dev` fingerprints, while `deploy.yml`
   compares against the latest build. The PR says "predicted"; `deploy.yml` still decides.
4. **The mod's band card** is checked only in slice 6. If the Desktop app does not draw a band with
   buttons, `issue:create` is run by the owner from the terminal, and the mod waits.

---

## 4. What can go wrong

| Case | What happens | What the owner or agent sees | Pinned by |
| --- | --- | --- | --- |
| `.env.local` lacks the App variables | the SessionStart line; `gh:bot`, the credential helper and `pr:push` fail with `AppTokenError` | the line, naming the missing variable | `appToken.test.ts`, `botToken.test.ts` (`identityLine`) |
| The key in `.env.local` is not the App's | GitHub answers 401 to the JWT | the error, naming the 401 | `appToken.test.ts` |
| The App lacks the Issues permission | a comment or label call fails with 403 | the `gh` error | slice 1's check |
| A session lasts more than an hour | the next push or `gh:bot` call gets a new token | nothing | `appToken.test.ts` |
| The token cache file is deleted or corrupt | read as stale, a new token is fetched | nothing | `appToken.test.ts` |
| An agent runs bare `gh` | the deny rule stops it | the refusal | the deny rule |
| An agent sets `GH_CONFIG_DIR` back to the owner's or calls the owner's `gh` another way | possible: the owner's login is on the machine | an action under the owner's name | accepted (§1) |
| The draft has no type or no area | `parseDraft` throws | the card shows the missing field, nothing is created | `issueDraft.test.ts` |
| The owner's `gh` is not logged in, or logged in as the bot | `issue:create` refuses | the card's error | `issueDraft.test.ts` + the CLI |
| The owner clicks Create twice | the first run deletes the draft; the second finds no file | one issue | — (the CLI) |
| A PR names a closed or missing issue | `issue` red, naming it | the red check | `pullRequest.test.ts` + the CLI's error |
| A stranger's issue tries to steer the agent | nothing in CI: `issue` accepts any open issue | the owner reads an issue before giving it to an agent (docs/external/github.md) | — |
| A branch the bot pushes changes `.github/workflows/` (this plan's branch, a CI change, or probably a branch rebased onto a `dev` whose workflows changed) | GitHub refuses the push: the App has no Workflows permission, on purpose | "refusing to allow a GitHub App to create or update workflow"; the owner pushes that branch from a terminal with their own login, then the bot carries on | slice 3's run |
| A hotfix or a failed fast-forward leaves `dev` without `main`'s tip | the bot opens the `sync/main-<date>` PR | a PR into `dev` to merge with "Create a merge commit" | `pullRequest.test.ts` (the skips) + the skill |
| The fold PR falls behind `dev` | nobody runs `pr:push` on it | "branch out of date"; rerun "Memory usage fold" from the Actions tab: it rebuilds the branch from `dev` and force-updates it | — (workflow config) |
| Two sessions run `pr:push` at once | the second's dream finds the dream lock (shared by every worktree) and stops, nothing pushed; a pending dream of another branch stops it too, naming that branch | the dream's message; the agent waits for the other run's notice, then reruns | update tests (existing) |
| The bot pushes code after the last `pr:push` (plain `git push`) | `memory` red | the red check, until `pr:push` runs | `pullRequest.test.ts` |
| The dream has nothing to read | an empty commit with the trailer | `memory` green | update tests |
| The dream fails (no network, quota, C20) | `pr:push` stops before the push | the dream's error; rerun `pr:push` | `pr-push.test.ts` |
| The PR body is edited to remove `Fixes` | the `edited` event reruns `issue`, red | the red check | the workflow's triggers |
| GitHub Actions fails with "0 jobs, Internal server error" | the checks never report; no merge possible | a stuck PR; rerun the workflow (memory `ci-and-release-traps`) | — (no bypass, by decision) |
| `dev` moved since the PR opened | "branch out of date" | the agent runs `pr:push`: rebase, dream, force-with-lease; the approval is dismissed | `pr-push.test.ts` |
| The owner presses "Update branch" on GitHub | a merge commit or a server-side rebase lands on the branch; the local branch lacks it | `memory` red for a merge commit; `pr:push` refuses until the agent fetches and resets onto origin/<branch> | `pullRequest.test.ts`, `pr-push.test.ts` |
| Two PRs edited the same fact | `pr:push`'s rebase stops on that file; nothing pushed | the file name; the PR waits for the other, then the agent and owner decide | `pr-push.test.ts` |
| A code conflict in that rebase | aborted, branch unchanged | the conflicting files; the agent resolves them on request | `pr-push.test.ts` |
| Someone pushed to the branch since `pr:push` fetched | the lease refuses | "someone pushed to the branch since" | `pr-push.test.ts` |
| The owner presses "Create a merge commit" on an ordinary PR into `dev` | allowed by the ruleset | a merge commit in `dev`'s history, harmless | — (the PR template says which button) |
| A session starts in a worktree | it reads the committed settings and the main checkout's `.env.local` | nothing | `localEnv.test.ts`, slice 1's check |
| A fork PR from its own `main` | `issue` and `memory` run, red | two red checks | `pullRequest.test.ts` |
| The owner opens a PR themself | it can never be approved (author, sole code owner) | "review required"; an agent runs `pr:push` on the branch instead | §1 Out of scope |
| The bot approves a PR | the approval does not count (not a code owner) | still "review required" | the ruleset |
| An agent tries `git push origin dev` | the deny rule stops it; GitHub would refuse it anyway | nothing | the ruleset |
| A dream is started on `dev` | `update.mjs` refuses | "the memory is committed on a branch: run pr:push there" | update tests |
| A release while `dev` holds a native change and a JS fix | the release PR says "store build" | that line in the PR | release section of the skill |
| A hotfix merged into `main`, `dev` not yet updated | the release's fast-forward of `dev` fails; `deploy.yml` already warns | the warning; the `sync/main-<date>` PR | `deploy.yml` (existing) |
| A Dependabot PR | `issue` and `memory` skip | three green checks | `pullRequest.test.ts` |
| A merged branch stays checked out locally | its later session lines wait | nothing, until the skill deletes it with `-D` after the merge | `working-issues` |
| The fold PR | `issue` skips; `memory` passes on its trailer | three green checks | `pullRequest.test.ts` |

Household, device and platform prompts from the template do not apply: nothing here runs in the
app.

---

## 5. Slices

- [x] 1. **Owner step:** give `sellest-agent` the Issues (write) and Actions (read) permissions and
      accept them on the installation; put `SELLEST_AGENT_APP_ID` and `SELLEST_AGENT_PRIVATE_KEY`
      in `.env.local`. Then:
      `docs/external/github.md`, `.env.example`; `readLocalEnv` extracted; `appToken`,
      `git-credential`, `gh-bot` and their tests; the settings env (bot user id looked up); the
      SessionStart check (after `isDreamSession`) and its test → a session, in the main checkout
      and in a worktree, pushes a throwaway branch and comments on a throwaway issue as
      `sellest-agent[bot]`, and Git Credential Manager is never asked
- [x] 2. labels file + `sync-labels` + its test, applied; issue forms, `config.yml`, PR template,
      CODEOWNERS → the owner opens a Task issue "Changes reach dev and main by pull request" (#9) that
      this slice's own PR names with `Fixes #N` in its PR file. GitHub shows issue forms only from
      the default branch, `main`, so the Bug form is tried after the next release to `main`
- [x] 3. `pullRequest.mjs` + the two check CLIs + their tests + the workflow → a test PR into `dev`,
      from a throwaway branch cut from `chore/github-workflow` (a `pull_request` run reads the
      workflow from the PR's merge commit), shows `issue` and `memory`, red then green; the owner
      approves it after pushing to it last; the PR is closed, not merged
- [x] 4. `update.mjs`: `--auto` (U2 skipped), the reviewer's line, the empty commit, the refusal on
      `dev` and `main`, their tests
- [x] 5. `prFile`, `memorySummary`, `pr:push` and their tests; `push:dev` and its test removed;
      pre-push's message; the nested `claude -p` start and the dead lock checked (§2 "Run from a
      session") → a session runs `pr:push` in the background, to the end, with a real dream: a
      branch goes from local commits to an open PR with its Memory section. The live lease run is
      slice 8's second merge (nothing moved `dev` during this slice); `pr-push.test.ts` covers it
- [x] 6. `issueDraft`, `issue:create` and its test, then the mod → a draft in `.tmp/issues/` shows a
      card; Create issue creates it as the owner
- [ ] 7. `working-issues` skill, `committing` updated, AGENTS.md, ARCHITECTURE.md, deployments.md,
      ADR 0022 and the ADR 0021 amendment, the deny rules, `dependabot.yml` → a real issue goes
      through the whole path, on a branch cut from `chore/github-workflow`; its PR into `dev` stays
      open until slice 8
- [ ] 8. **Owner step:** import `protect-dev` and the new `protect-main`; retarget PR #6 → this
      slice's own PR is the first merged under the rules; then `pr:push` on slice 7's branch
      rebases it onto `dev` (dropping this slice's commits, now merged), pushes with the lease, and
      it merges second

---

## Open questions

None.

---

## Review log

```
(rewritten on the one-fact-per-file memory layout; the earlier draft's four review rounds no
longer apply: its memory rebase, its machine account and its prefilled issue URL are gone)
round 1   REVISE   13 findings (5 blocking): all fixed. 1.3 took option (a), a sync/ branch;
                   1.4 turned last-push approval off on both rulesets
round 2   REVISE   2 findings (1 blocking): both fixed. A sync/ branch never goes through pr:push;
                   the skill merges and pushes it. Slice 2 opens this slice's own issue
round 3   READY    (not reached in any round: the mod, the forms, memorySummary's cat-file
                   --filters, the release fingerprint, deny-rule matching, docs and ADR wording)
```

---

## Landing

- [x] Plan review loop ended READY, and the user agreed the plan
- [ ] `pnpm verify` green
- [ ] `architecture-reviewer` clean, or its findings approved
- [ ] Decisions worth keeping promoted to an ADR or to [CONVENTIONS.md](../CONVENTIONS.md)
- [ ] **This file deleted** — the slice is not done while it exists
