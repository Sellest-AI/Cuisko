# Convex backend

Builders and ctx types come from `../procedures.ts` — never `_generated/server` (ADR 0001).
`internal` / `api` come from `_generated/api` — but never inside `procedures.ts` (type cycle).

- `router/{domain}/{operation}.ts` — validators + procedure wrappers only. Max 90 lines.
  Loops, domain branching or domain-library imports mean the logic belongs in `functions/`.
- `functions/` — reusable logic that touches `ctx.db`. Plain `(ctx, args)` functions, not procedures.
- `lib/` — vendor clients and pure helpers. Never touches `ctx.db`.
- `agent/` — the sealed AI boundary. `ai` and `@convex-dev/agent` are imported here and nowhere
  else. AI endpoints stay ordinary `router/` files that call in; never a parallel API tree.
- `http/` — webhooks, only via `verifiedWebhook`. Bare `httpAction` is forbidden.
- `crons/` — one file per scheduled job body, as an internal function. The schedule itself lives
  in `crons.ts` — the folder holds no `cronJobs()` call.
- `workflows/` — durable multi-step jobs (`@convex-dev/workflow`), for sequences where each step
  must be retried independently. Iterate large tables with `.paginate()` here, never `.collect()`.

Choosing between the three: one follow-up after a write commits is `ctx.scheduler.runAfter`, not a
workflow. Recurring on a clock is `crons/`. Multi-step and must survive a mid-sequence failure is
`workflows/`. A cron can call a workflow.

`agent/`, `crons/` and `workflows/` are empty placeholders — their components are not installed
and `crons.ts` does not exist yet. Add both when the first job or agent lands.

Files camelCase. Indexes named `by_<field>[_and_<field>]`.
Every `ctx.db.query()` uses an index. Never `.filter()` with `.paginate()`.
A new foreign key ships with its cascade index AND its `CASCADE` entry in `functions/cascade.ts`.
Errors are `ConvexError({ code })`, never bare `Error`.
