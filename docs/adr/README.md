# Architecture Decision Records

One decision per file. Each declares the files it governs, states its rules as imperatives, and
carries the command that proves it still holds.

| # | Decision | Governs | Verify |
| --- | --- | --- | --- |
| [0001](./0001-convex-procedures-only.md) | Convex builders come from `procedures.ts`; `api` never enters it | `convex/**` | `pnpm lint`, `pnpm test` |
| [0002](./0002-ui-isolation.md) | `src/ui/` does not know the backend exists | `src/ui/**` | `pnpm lint` |
| [0003](./0003-ownership-via-procedure.md) | Ownership is a procedure capability | `convex/router/**` | `pnpm typecheck`, `pnpm lint`, `pnpm check:exports`, `pnpm check:authtests` |
| [0004](./0004-webhooks-must-verify.md) | A webhook cannot be defined without a verifier | `convex/http/**` | `pnpm lint` |
| [0005](./0005-env-validated-at-boot.md) | Environment is Zod-validated and throws at boot | `convex/env.ts`, `env.ts` | `pnpm test`, `pnpm typecheck` |
| [0006](./0006-screens-never-fetch.md) | Screens never fetch; feature hooks own the data | `app/**`, `src/modules/**` | `pnpm lint` |
| [0007](./0007-every-query-uses-an-index.md) | Every query reads an index; pagination never filters | `convex/**` | `pnpm check:queries`, `pnpm check:schema` |
| [0008](./0008-tests-are-layered.md) | Tests are layered by runtime; every test file runs | `**/*.test.ts(x)`, `vitest.config.mts` | `pnpm check:tests`, `pnpm test` |
| [0009](./0009-the-client-decides-an-undo.md) | Taking stock out is not an undo unless the client says so | `convex/**/cellars/**`, `src/modules/groceries/**` | `pnpm test` |
| [0010](./0010-a-model-returns-names-not-ids.md) | A model returns names and vocabulary, never a composed id and never free text | `convex/agent/**`, `shared/ingredientMatch.ts` | `pnpm typecheck`, `pnpm test` |
| [0011](./0011-derived-search-fields-have-one-sanitizer.md) | A searchable blob has one serializer; a promise is a filter, not a search term | `convex/schema/**`, `convex/functions/**`, `shared/search.ts` | `pnpm check:search`, `pnpm test` |
| [0012](./0012-a-lossy-index-ranks-its-claimants.md) | A lossy index ranks its claimants by what folding cost, never by source order | `convex/functions/ingredients/lookup/**`, `shared/ingredientMatch.ts` | `pnpm test` |
| [0013](./0013-a-plate-is-planned-through-one-path.md) | A plate is planned through one path, and only what is ahead holds stock | `convex/functions/planning/**`, `convex/router/planning/**`, `convex/schema/planning.ts` | `pnpm test` |
| [0014](./0014-a-recipe-is-readable-by-any-cook.md) | A recipe is readable by any signed-in cook; only editing is gated | `convex/router/recipes/*`, `convex/functions/recipes/**`, `src/modules/recipes/**` | `pnpm test` |
| [0015](./0015-one-producer-for-a-shared-derivation.md) | A value two screens must agree on is computed by one side | `shared/**`, `convex/router/**`, `convex/functions/**`, `src/modules/**` | `pnpm lint` |
| [0016](./0016-household-state-resets-on-a-switch.md) | Session state about a household resets when the household switches | `src/modules/**`, `src/lib/**`, `app/_layout.tsx` | `pnpm check:households`, `pnpm test` |
| [0017](./0017-a-deleted-recipe-is-archived-and-unlisted.md) | A deleted recipe is archived, and no list reaches it | `convex/functions/**`, `convex/router/**`, `convex/agent/**`, `convex/schema/recipes.ts` | `pnpm check:recipes`, `pnpm test` |
`pnpm verify` runs all of them — on demand, in the pre-commit and pre-merge-commit hooks, and in CI.

## Format

```markdown
---
id: 0009
applies_to: ["convex/**/*.ts"]    # the ADR is relevant only to files matching these globs
status: accepted                  # accepted | superseded | deprecated
supersedes: []
---

# One-line imperative title

MUST / MUST NOT / MAY — RFC 2119, one rule per line. No judgement to exercise.

## Why
Short. The narrative belongs in ../ARCHITECTURE.md, linked.

## Verify
The command that proves compliance.
```

Four properties, each doing a job:

- **`applies_to`** — an agent loads the ADR only for files it governs, so cost scales with relevance
  rather than with project size.
- **MUST / MUST NOT / MAY** — imperatives, not explanation. A rule that requires interpretation gets
  interpreted differently each time.
- **`## Verify`** — a rule with no mechanical check decays, and you get no signal when it stops
  holding. The check is written into the rule itself.
- **`status`** — a rule the project stops following becomes `superseded`, **not** silent drift.

## The one rule about these rules

If a violation is deliberate, the ADR changes. A knowingly-broken rule must become
`status: superseded`, with the record that replaces it named in the new ADR's `supersedes`.

**Never leave a rule documented as active that the project has stopped following.** That single
failure — not volume, not structure — is what let 58 files drift in the predecessor project while
six documents continued to assert the rule in bold. See
[_reference/02-DIVERGENCE.md](../_reference/02-DIVERGENCE.md).
