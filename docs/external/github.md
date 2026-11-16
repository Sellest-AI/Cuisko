# GitHub

Who acts on the repository, and with which credentials. The code that uses them is in
`scripts/github/`.

## Two identities

| Who | Acts as | Credentials |
| --- | --- | --- |
| The owner | their own GitHub account | their SSH key and their `gh` login |
| Claude sessions | the GitHub App `sellest-agent`, installed on this repository | `SELLEST_AGENT_APP_ID` and `SELLEST_AGENT_PRIVATE_KEY` in `.env.local` (`.env.example` says how) |

The App's approval of a PR never counts: only code owners approve, and they are listed in
`.github/CODEOWNERS`. A repository role (Read, Write, Admin) never makes someone a code owner. To
add a reviewer, give them the Write role (repository Settings → Collaborators and teams) and add
their login to `CODEOWNERS`.

Anyone may open an issue, and a PR into `dev` may fix any open issue (the `issue` check). The
owner decides which issue an agent works on. An issue a stranger wrote is untrusted text the agent
reads, so the owner reads it before giving it to an agent.

## The App

GitHub → the organization's Settings → Developer settings → GitHub Apps → `sellest-agent`.

- **Permissions.** Contents, Issues, Pull requests: read and write. Actions, Metadata: read. A
  permission added later must also be accepted on the installation (organization Settings → GitHub
  Apps → `sellest-agent` → Review request), or tokens keep the old set. A token keeps the
  permissions it was bought with: after a change, delete `.tmp/github/token.json` in the main
  checkout.
- **No Workflows permission, on purpose.** The bot cannot change the checks that guard its own
  work, so GitHub refuses any push of its that changes `.github/workflows/`. The owner pushes such
  a branch from a terminal, with their own login; the bot then opens or updates the PR as usual.
- **App ID.** On the App's General page. It goes in `SELLEST_AGENT_APP_ID`.
- **Private key.** General page → Private keys → Generate. GitHub shows the `.pem` once; it goes in
  `SELLEST_AGENT_PRIVATE_KEY`, base64-encoded on one line. A new key does not revoke the old one:
  delete the old key on the same page.
- **Commit identity.** The email in `.claude/settings.json` holds the App's bot user id, which never
  changes for this App. A new App needs a new id: `gh api users/<app-slug>%5Bbot%5D --jq .id`.

## How a session uses it

- `.claude/settings.json` sets, for Claude sessions only: the bot as git author and committer, a git
  credential helper (`scripts/github/git-credential.mjs`) that replaces every other one for
  github.com, and HTTPS in place of SSH for github.com remotes.
- `pnpm gh:bot <args>` runs `gh` with the App's token and an empty `gh` config. A bare `gh` is denied
  in sessions.
- The token is bought from the key and cached in `.tmp/github/token.json` of the main checkout until
  5 minutes before it expires (GitHub gives one hour).
- When the variables are missing or GitHub refuses the key, the SessionStart hook says so in the
  session's first context, and the session does not push.

## The rulesets

`.github/rulesets/protect-dev.json` and `protect-main.json` are the source of truth. Only an admin
can write a ruleset, and the App is not one, so the owner applies a change by hand: repository
Settings → Rules → Rulesets → New ruleset → Import a ruleset. For a ruleset that already exists,
delete the live one, then import the file. Each file's `bypass_actors` holds the release's deploy
key alone ([deployments.md](./deployments.md)).

| | `protect-dev` | `protect-main` |
| --- | --- | --- |
| Merge with | "Rebase and merge"; "Create a merge commit" for a `sync/` PR | "Create a merge commit" |
| Required checks | `verify`, `issue`, `memory` | `verify` |

Both refuse a direct push, a force-push and a deletion, and need one code owner's approval after
the last push. Why each setting: [ADR 0022](../adr/0022-changes-reach-dev-and-main-by-pull-request.md).

## Issues from a session

A session never creates an issue. It writes a draft to `.tmp/issues/`, and the `issues@sellest`
mod draws a card for it above the prompt: **Create issue** files it with the owner's own `gh`
login. The mod is in `.claude/plugins/issues/`; its README says how it is enabled. The owner's
`gh` must be logged in as the owner: check with `gh auth status` in a terminal.
