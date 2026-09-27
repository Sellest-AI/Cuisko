# Feature modules — the only layer that calls Convex

One folder per domain. It owns that domain's data and everything drawn with it.

## Public surface vs. interior

    src/modules/planning/
    ├── weekly-plan.tsx     PUBLIC  — any module or route may import this
    ├── screen.tsx          PUBLIC
    ├── hooks.ts            PUBLIC  — the door: re-exports the hooks other modules may call
    ├── tunnel/             PUBLIC  — a sub-module: one flow, several screens of its own
    │   ├── chrome.tsx              the frame its routes mount into
    │   ├── setup.tsx, diet.tsx     one file per step
    │   └── _components/, _hooks/   PRIVATE to the sub-module, same rules one level down
    ├── _components/        PRIVATE — this module only, by relative path
    ├── _hooks/             PRIVATE — the ONLY place api.router.planning.* is referenced
    └── _model/             PRIVATE — framework-free domain types and pure functions; no React,
                                       no Jotai, no Convex import ever lands here

Root files are public. The underscore folders are the interior: reach them with `./_hooks/useX`,
never with `~/modules/other/_hooks/useX`. Sharing a hook across modules is one line added to
`hooks.ts` — a deliberate edit somebody reviews — not an import that walks past the underscore.

**A named subfolder holding several routed screens is a sub-module, and may carry the same shape as
a module.** Reach for one when a single flow owns several screens that belong together — a
generation tunnel, an onboarding — rather than scattering them across the root, or claiming a parent
that does not exist (`tunnel.setup.tsx` says there is a `tunnel.tsx` to read first). It may grow its
own `_components/`, `_hooks/` and `_model/` on exactly the rules above, one level down. A single
screen is not a sub-module — but it may still be a folder. Under three files it stays a root file
with its parts in dot notation beside it; at three it becomes a folder entered through `index`, on
the same threshold as any other component (CONVENTIONS §1.1). That folder is not a sub-module:
nothing inside it is routed on its own, which is the whole distinction. Its name is `screen.tsx`
only when it is the module's one screen — a module with several names each of them for what it does.

**It comes in two shapes, and the difference is where the door is.** `tunnel/` is a flow: its root
files are screens, each mounted by a route, and all of them public to the module and to `app/`.
`modal-sheet/` is a unit of behaviour: several hooks over one piece of shared state, entered through
an `index.ts` barrel that re-exports the hooks and nothing else, so the state has no route out
through the door. Take the barrel when there is something to keep between siblings; skip it when the
files are screens and privacy is not the question. Either way the call site is the folder —
`~/modules/navigation/modal-sheet`, never a file inside it.

**Lint R8 reaches a sub-module's underscore folders at any depth** — its glob is
`~/modules/**/_hooks/**`, and `**` crosses slashes where the `*` it replaced did not. So
`planning/tunnel/_hooks/` is as closed as `planning/_hooks/`, and stays closed however deep the
folders go. The seal is directional: a sub-module may still reach its parent module's `_hooks/` and
`_components/` by relative import — it is inside the boundary, not crossing it. Only the reverse is
sealed, which is what makes moving a flow's own files down into it worth doing.

⚠️ **A barrel is not.** Nothing stops `~/modules/navigation/modal-sheet/state` — the door is a
convention, and `state.ts` is a normal module. Underscore folders are enforced; a barrel is yours to
catch in review. If a sub-module's private piece is a component or a hook, put it in `_components/`
or `_hooks/` and the linter guards it for you. `modal-sheet/state.ts` cannot use that: `_model/`
takes no Jotai, and an atom is neither a component nor a hook.

`_model/` is where the domain lives once it grows past a couple of pure functions used by one
hook — types, invariants, derivations, all of it framework-free and unit-testable without
mounting anything. `_hooks/` is what's left once that moves out: the Jotai/Convex glue that
turns `_model/`'s pure functions into what a screen reads and calls. A trivial helper used by a
single hook can stay inline; `_model/` is for logic that has rules worth a test of their own, or
that several `_hooks/` files need. See `src/modules/groceries/_model/model.ts` for the pattern in
practice.

`hooks.ts` re-exports and nothing else. The moment logic lands in it, it has stopped being a door.
It is also created at the first real consumer, not in advance: a door nobody walks through is how
a convention becomes decoration.

## Placement

| Imported by                            | Goes                                               |
| --------------------------------------- | -------------------------------------------------- |
| one parent                             | dot notation beside it — `screen.list.filters.tsx` |
| several parents in this module         | `_components/`                                     |
| several `_hooks/` files, or rules worth a test, framework-free | `_model/`                   |
| another module, and it is pure         | not here at all — `src/ui/`                        |
| another module, and it needs data      | this module's root                                 |

## Never

- Never import `app/**` — the dependency runs the other way.
- Never reference `api.router.*` outside `_hooks/` (ADR 0006).
- Never reach into another module's `_hooks/`, `_components/` or `_model/` (lint R8).
- Never import React, Jotai or Convex inside `_model/` — that's what makes it unit-testable
  without a provider tree, and what `_hooks/` is for.
