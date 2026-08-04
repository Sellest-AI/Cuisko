---
id: 0002
applies_to: ["src/ui/**/*.ts", "src/ui/**/*.tsx"]
status: accepted
supersedes: []
---

# src/ui/ does not know the backend exists

MUST NOT: import `convex`, `convex/*`, `**/convex/**`, `~/lib/convex/*` from `src/ui/**`.
MUST NOT: import `~/modules/*`, `~/providers/*`, `~/hooks/*` or `translations` from `src/ui/**`.
MUST: declare props as **structural types** — `{ title: string; minutes: number }`, never
      `Doc<'recipes'>` or `Id<'recipes'>`.
MAY: import `react`, `react-native`, `@ui/*`, `@ui/hooks/*`, `@ui/utils`, `theme`, and
     presentation/animation libraries.

## Why

This is the one boundary the predecessor project got **perfect — 0 violations across 75 files** —
and the reason is worth stating precisely, because it is the model for every other rule here: the
rule was *achievable*. `@ui/*` supplied everything a presentational file needed, so no one ever had
a reason to reach outside. Compliance was the path of least resistance.

Structural props are what make it free. A component that declares the shape it needs has no reason
to import the backend's type:

```tsx
// ✅ no reason to import from convex
type Props = { title: string; minutes: number; difficulty: "easy" | "medium" | "hard" };

// ❌ couples the design system to the database schema
type Props = { recipe: Doc<"recipes"> };
```

The module layer adapts documents to these props. The cost of that adaptation is a few lines per
card; the benefit is that a schema change cannot ripple into the design system.

`cards/` may be domain-*shaped* (`recipe.tsx`) and still satisfy this ADR — the boundary is about
imports and prop types, not about whether the component knows what a recipe looks like.

## Verify

```bash
pnpm lint        # eslint R1
```

## See also

[0006](./0006-screens-never-fetch.md) — the same principle one layer up ·
[CONVENTIONS §3.2](../CONVENTIONS.md)
