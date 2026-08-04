---
id: 0006
applies_to: ["app/**/*.ts", "app/**/*.tsx", "src/modules/**/*.ts", "src/modules/**/*.tsx"]
status: accepted
supersedes: []
---

# Screens never fetch; feature hooks own the data

MUST NOT: call `useQuery` / `useMutation` / `useAction`, or import `~/lib/convex/api`,
          `~/lib/convex/client` or `convex/react`, from `app/**`.
MUST: put a domain's Convex bindings in `src/modules/{domain}/_hooks/use{Domain}.ts` — the only
      place `api.router.{domain}.*` is referenced.
MUST NOT: import `convex/_generated/**` from anywhere in `src/**` or `app/**` except
          `src/lib/convex/api.ts`.
MAY: use `useLocalSearchParams`, `<Stack.Screen options>`, layout composition, and **one** feature
     hook call, in `app/**`.

A screen over ~120 lines is composing too much — extract a module section. (Guideline: reviewed,
not linted.)

## Why

The predecessor had **no rule about which layer owns fetching, so both did** — 42 `useQuery` calls
in screens and 36 in modules. Screens grew to 437 lines mixing routing, fetching and business logic,
and three separate route trees ended up serving the same profile page.

The fix is a contract, not a size limit. When one file per domain owns the bindings, a backend change
has exactly one frontend edit site. When every screen fetches, it has as many as there are screens.

The feature hook is also where the useful frontend techniques live:

- **`'skip'` for conditional queries** — Convex's idiom for "not yet", which avoids a conditional
  hook call.
- **A module-scoped Jotai atom as a fallback id**, so a detail screen still works when navigated to
  without params.
- **`Omit<Parameters<typeof mutate>[0], 'id'>`** — deriving the public argument type from the
  generated mutation signature, so a backend argument change surfaces as a frontend **type error**
  rather than a runtime `undefined`.

None of that is expressible when fetching is scattered across screens.

The full contract, with the feature-hook shape every domain follows, is in
[ARCHITECTURE.md § Feature hooks own the data](../ARCHITECTURE.md#feature-hooks-own-the-data).

## Verify

```bash
pnpm lint      # eslint R4 (screens) + R3 (generated-API choke point)
```

## See also

[0002](./0002-ui-isolation.md) — the same principle one layer down ·
predecessor evidence: F20 — [03-FLAWS.md](../_reference/03-FLAWS.md)
