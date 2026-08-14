# Feature modules — the only layer that calls Convex

One folder per domain. It owns that domain's data and everything drawn with it.

## Public surface vs. interior

    src/modules/planning/
    ├── weekly-plan.tsx     PUBLIC  — any module or route may import this
    ├── screen.tsx          PUBLIC
    ├── hooks.ts            PUBLIC  — the door: re-exports the hooks other modules may call
    ├── tunnel/             PUBLIC  — a sub-domain: one flow, several screens of its own
    │   ├── chrome.tsx              the frame its routes mount into
    │   ├── setup.tsx, diet.tsx     one file per step
    │   └── _components/, _hooks/   PRIVATE to the sub-domain, same rules one level down
    ├── _components/        PRIVATE — this module only, by relative path
    ├── _hooks/             PRIVATE — the ONLY place api.router.planning.* is referenced
    └── _model/             PRIVATE — framework-free domain types and pure functions; no React,
                                       no Jotai, no Convex import ever lands here

Root files are public. The underscore folders are the interior: reach them with `./_hooks/useX`,
never with `~/modules/other/_hooks/useX`. Sharing a hook across modules is one line added to
`hooks.ts` — a deliberate edit somebody reviews — not an import that walks past the underscore.

**A named subfolder is a sub-domain, and carries the same shape as a module.** Reach for one when a
single flow owns several screens that belong together — a generation tunnel, an onboarding — rather
than scattering them across the root, or claiming a parent that does not exist (`tunnel.setup.tsx`
says there is a `tunnel.tsx` to read first). Its files are public to the module and to `app/`, and
it may grow its own `_components/`, `_hooks/` and `_model/` on exactly the rules above, one level
down. A single screen is not a sub-domain: that is `screen.tsx` at the root, with its parts in dot
notation beside it.

`_model/` is where the domain lives once it grows past a couple of pure functions used by one
hook — types, invariants, derivations, all of it framework-free and unit-testable without
mounting anything. `_hooks/` is what's left once that moves out: the Jotai/Convex glue that
turns `_model/`'s pure functions into what a screen reads and calls. A one-off helper used by a
single hook can stay inline; `_model/` is for a domain shape that several files in the module
need to agree on. See `src/modules/groceries/_model/model.ts` for the pattern in practice.

`hooks.ts` re-exports and nothing else. The moment logic lands in it, it has stopped being a door.
It is also created at the first real consumer, not in advance: a door nobody walks through is how
a convention becomes decoration.

## Placement

| Imported by                            | Goes                                               |
| --------------------------------------- | -------------------------------------------------- |
| one parent                             | dot notation beside it — `screen.list.filters.tsx` |
| several parents in this module         | `_components/`                                     |
| several `_hooks/` files, framework-free | `_model/`                                          |
| another module, and it is pure         | not here at all — `src/ui/`                        |
| another module, and it needs data      | this module's root                                 |

## Never

- Never import `app/**` — the dependency runs the other way.
- Never reference `api.router.*` outside `_hooks/` (ADR 0006).
- Never reach into another module's `_hooks/`, `_components/` or `_model/` (lint R8).
- Never import React, Jotai or Convex inside `_model/` — that's what makes it unit-testable
  without a provider tree, and what `_hooks/` is for.
