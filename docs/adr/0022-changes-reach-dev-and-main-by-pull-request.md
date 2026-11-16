---
id: 0022
applies_to: ["scripts/github/**", ".githooks/**", ".github/rulesets/**", ".github/workflows/pull-request.yml", ".github/dependabot.yml", ".github/CODEOWNERS", ".github/pull_request_template.md", ".claude/settings.json", ".claude/skills/working-issues/**", ".claude/skills/committing/**", ".claude/plugins/issues/**"]
status: accepted
supersedes: []
---

# Changes reach `dev` and `main` by a pull request the owner approved

MUST: reach `dev` and `main` only through a pull request. `protect-dev` and `protect-main`
      (`.github/rulesets/`, imported by hand) refuse every direct push, the owner's included; the
      one bypass is the release's deploy key.
MUST: fix an open issue in every PR into `dev`, named in its body with `Fixes #N` (the `issue`
      check), and carry the dream's commit as its newest commit (the `memory` check). A
      Dependabot PR and a `sync/` branch of this repository skip both; the fold PR skips `issue`.
MUST: approve a PR by a code owner (`.github/CODEOWNERS`). The `sellest-agent` App's approval never
      counts, and the session never approves or merges: `.claude/settings.json` denies
      `gh:bot pr merge`, `pr review --approve` and the rulesets API.
MUST: act on GitHub from a session as the `sellest-agent` App: `pnpm gh:bot` for `gh`, the
      credential helper for `git`. A bare `gh` is denied in sessions.
MUST: let only the owner create an issue: on GitHub, or from a session's draft in `.tmp/issues/`
      through the `issues@sellest` mod's button. `issue:create` runs `gh` with the owner's login
      and is denied in sessions.
MUST: merge an ordinary PR into `dev` with "Rebase and merge"; a `sync/` PR into `dev` and every PR
      into `main` with "Create a merge commit".
MUST NOT: force-push, except `pr:push` on a work branch, with an explicit lease sha
          (`--force-with-lease=<branch>:<sha>`), never on `dev` or `main`.
MUST: open dependency PRs into `dev` (`.github/dependabot.yml`), never into `main`.
MUST: run `pnpm verify` once per agent commit, in Step 1 of the `committing` skill. The
      `pre-commit` hook runs only the fast checks (branch name, memory lock, C20 on a memory
      commit); a merge commit, clean or conflicted, still runs the whole verify in the hooks.

## Why

Before this, `dev` had no protection: an agent merged into it locally and pushed, and the dream
committed the memory on it. The owner bypassed `protect-main`. Nothing recorded why a change was
made. A PR per issue gives each change its cause, its review and its memory in one place, and the
rulesets make that the only road.

- **An App rather than a machine account,** because its token is short-lived, it is bought from a
  key in `.env.local`, and its approval cannot count. The owner's own `gh` login stays on the
  machine; the deny rules keep sessions off it, and nothing stronger was chosen.
- **The owner creates the issues,** because an issue is what an agent is told to work on. A
  session drafts one; only the owner's click files it. A mod that registered a tool would let the
  agent file it alone.
- **Rebase into `dev`, merge commit into `main`,** because a rebase merge rewrites SHAs: a rebased
  release would leave `main` and `dev` diverged. A ruleset cannot tie a merge method to a head
  branch, so `dev` allows both, and the `memory` check refuses a merge commit except from `sync/`.
- **Last-push approval off,** because the owner's own merge into `dev` is the last push of every
  release PR's head, and the owner is the only code owner. Stale-approval dismissal keeps the
  guarantee that the approval came after the last push.
- **No "Restrict updates" rule, and no bypass for the owner,** because with that rule on, only a
  bypass actor can merge: the deploy key alone would be able to. Code-owner approval is the gate
  instead. Adding the rule back locks the owner out of every merge.
- **The force-push exception,** because a PR behind `dev` must be rebased to pass "branch up to
  date", and a rebased branch can only be force-pushed. The lease refuses to overwrite a push made
  since `pr:push` fetched. `pr:push` runs it as a child process, out of the deny rules' reach.
  Those rules catch the common forms a session might type (`git push origin dev`, `--force`); a
  refspec such as `HEAD:refs/heads/main` gets past them. The rulesets are the gate: they refuse
  every direct push to `dev` and `main`, whatever its form.
- **Verify once per commit, in the skill rather than the hook,** because CI `verify` is now a
  required check, so the hook only gave earlier feedback, and each agent commit ran verify twice
  to get it. It cannot go entirely: "Rebase and merge" lands every commit of a PR on `dev`, CI
  checks only the head, and a red commit in the middle would break `git bisect`. The owner's own
  commits are not verified locally; CI checks their PR. A merge commit keeps the hook's verify,
  because its tree is the one no branch commit verified. No pre-push verify: it would check only
  the tip, which CI checks already.

How a change travels, from the issue to the release: [ARCHITECTURE.md § Releases](../ARCHITECTURE.md#releases).
Who holds which credentials: [external/github.md](../external/github.md).

## Verify

`pnpm test` runs `scripts/github/__tests__/` (the checks' verdicts and skips, the PR file, the
issue draft, `pr:push` against a bare origin with its lease), and
`scripts/memory/__tests__/pre-commit.test.ts` runs the real hooks: no verify on a plain commit,
verify on a clean and on a conflicted merge. On GitHub, the rulesets refuse
`git push origin dev` and an unapproved merge; the `issue` and `memory` checks run on every PR
into `dev`.

## See also

[0021](./0021-the-agent-memory-is-written-by-the-dream.md): the memory the `memory` check looks for
