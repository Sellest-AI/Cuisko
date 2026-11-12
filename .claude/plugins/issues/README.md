# issues@sellest

A Claude Code mod that turns an agent's issue draft into a GitHub issue, on the owner's click.

An agent writes a draft to `.tmp/issues/<slug>.md` (the format is in
`scripts/github/_lib/issueDraft.mjs`). The mod draws a card above the prompt for each draft: its
labels, its title, the first section of its body, and two buttons.

- **Create issue** runs `node scripts/github/create-issue.mjs <draft>` (`pnpm issue:create`). The
  CLI checks the draft against `.github/labels.json`, creates the issue with the owner's own `gh`
  login, and deletes the draft. The card then becomes a row with a link to the issue, until
  **Dismiss**.
- **Discard** runs the CLI with `--discard`, which deletes the draft and creates nothing.

The mod registers no tool and no command, so only the owner's click creates an issue. Every rule
lives in the CLI; an error it prints shows in red on the card. The mod rereads `.tmp/issues/` when
the session starts and when each turn ends: it has no file watcher.

It is enabled for this project by `.claude/settings.json`, from the `sellest` marketplace in
`.claude-plugin/marketplace.json`: Sellest's catalog of mods, hosted in this repository for now.
Tested with Claude Code 2.1.319 in the desktop app. There, a
primary Button's label is always bold, and a notice added with `$.session.append` is not drawn, so
the link lives in the band.

Its types are laid by Claude Code in `.claude-plugin/types/` when the mod loads; `tsc -p
.claude/plugins/issues` type-checks it then. The repo's own typecheck, lint and knip skip
`.claude/plugins/`.
