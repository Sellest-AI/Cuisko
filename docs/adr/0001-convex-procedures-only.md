---
id: 0001
applies_to: ["convex/**/*.ts"]
status: accepted
supersedes: []
---

# Convex builders come from procedures.ts; api never enters procedures.ts

MUST: import every query/mutation/action builder and every ctx type from `convex/procedures.ts`.
MUST NOT: import `convex/_generated/server` anywhere except `convex/procedures.ts`.
MAY: import `internal` / `api` from `convex/_generated/api` in any backend file —
     **except** `convex/procedures.ts`, where it creates a project-wide type cycle.
MUST: use `makeFunctionReference<...>("path/to/file:export")` for internal references needed
      inside `procedures.ts`, and cover each one with a test that asserts the path resolves.

## Why

These are **two modules with two different dependency graphs**, and collapsing them into one rule
is the specific mistake that cost the predecessor project 58 files.

| Module | Its `.d.ts` imports | In the cycle? | Safe to re-export from `procedures.ts`? |
| --- | --- | --- | --- |
| `_generated/server` | `convex/server`, `./dataModel.js` | no | **yes** |
| `_generated/api` | *every module in the project* | yes | no |

`_generated/api.d.ts` contains `import type * as X from "../<module>.js"` for every module. So a file
that imports it and is *itself* imported by router files forms a circular type reference, and
TypeScript degrades the procedures to `any` — silently. Predecessor's `procedures.ts:6` did exactly that,
correctly diagnosed the cycle, and then generalised the conclusion to `_generated/server`, which is
not in the cycle. `internalAction` and `httpAction` were therefore never re-exported, so **41 of the
58 violating files had no legal alternative**. The rule was right; it was made unfollowable.

Hence the shape of [convex/procedures.ts](../../convex/procedures.ts): a complete re-export surface
comes first, because a rule needs an affordance or it will be broken. If you need something it does
not export, **add it there** — routing around it is the failure this ADR exists to prevent.

The string path in `makeFunctionReference` is not checked by the compiler, which is why the escape
hatch carries a test: [convex/router/users/\_\_tests\_\_/getAccount.test.ts](../../convex/router/users/__tests__/getAccount.test.ts)
asserts `router/users/getAccount:_internal` still resolves. Move or rename that file and the test
fails — instead of authentication silently breaking for every action.

## Verify

```bash
pnpm lint        # eslint R2 (server) + R2b (api)
pnpm test        # the makeFunctionReference path assertion
```

## See also

[0003](./0003-ownership-via-procedure.md) · predecessor evidence: [F8](../_reference/03-FLAWS.md)
