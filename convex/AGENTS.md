# Convex backend

Builders and ctx types come from `../procedures.ts` — never `_generated/server` (ADR 0001).
`internal` / `api` come from `_generated/api` — but never inside `procedures.ts` (type cycle).

- `router/{domain}/{operation}.ts` — validators + procedure wrappers only. Max 80 lines.
  Loops, domain branching or domain-library imports mean the logic belongs in `functions/`.
- `functions/` — reusable logic that touches `ctx.db`. Plain `(ctx, args)` functions, not procedures.
- `lib/` — vendor clients and pure helpers. Never touches `ctx.db`.
- `http/` — webhooks, only via `verifiedWebhook`. Bare `httpAction` is forbidden.

Files camelCase. Indexes named `by_<field>[_and_<field>]`.
Every `ctx.db.query()` uses an index. Never `.filter()` with `.paginate()`.
A new foreign key ships with its cascade index AND its `CASCADE` entry in `functions/cascade.ts`.
Errors are `ConvexError({ code })`, never bare `Error`.