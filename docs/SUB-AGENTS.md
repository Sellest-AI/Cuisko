# Sub-agents

How to spawn a sub-agent well, and when a spawn becomes a definition in `.claude/agents/`. When to
spawn one is in the root `AGENTS.md`, § Sub-agents, which points here.

## What the prompt carries

A sub-agent starts with **no memory of this conversation**. It only knows what you write in its
prompt. Every spawn must therefore include:

- **The goal**, and what "done" looks like.
- **Exact file paths** to read — never "look around the codebase".
- **Which docs apply**: `docs/CONVENTIONS.md`, plus the specific `docs/adr/` files matching the globs
  it will touch.
- **The commands** it may run (`pnpm verify`, `pnpm test <file>`).
- **The output shape** you expect back (a list of `file:line` findings, a diff, a summary), plus
  what it could not confirm and where it looked — a silent gap reads as a clean result.
- **Boundaries** — read-only vs may-edit, and which paths are off limits.

## A spawn made twice becomes a definition

**A spawn you make more than once becomes a definition in `.claude/agents/`.** Everything above then
lives in the definition instead of the prompt — a stable prefix the model caches, rather than one you
retype and drift from each time — and the definition pins the model and the tool list, so a
table-checking pass is not paying for a reasoning model with a shell it does not need.

`architecture-reviewer` and `plan-reviewer` are the shape to copy. The `dream-*` definitions are run
by `scripts/memory/update.mjs`, never by hand (ADR 0021).

## Edits and reports

Prefer read-only sub-agents for investigation and keep edits in the main thread, so changes stay
reviewable in one place. When several sub-agents will edit, give each a disjoint set of files.

Their reports are not shown to the user — relay what matters. Never present a pending sub-agent's
result as if it had returned.
