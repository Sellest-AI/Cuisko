---
id: 0008
applies_to: ["**/*.test.ts", "**/*.test.tsx", "vitest.config.mts", "test/**/*.ts", "src/modules/**/_model/*.ts"]
status: accepted
supersedes: []
---

# Tests are layered by runtime, and each layer tests only what it alone can

MUST: put a test in the project whose runtime its subject needs — `convex/**` and `shared/**` in
      the `convex` project (edge-runtime, `convex-test`); `src/**` and `app/**` in the `app`
      project (jsdom + react-native-web); `scripts/**` in the `scripts` project (plain node).
MUST: assert a C1-C10 check on the shape it REJECTS, not on this repo passing it. A check fails
      open — break its predicate and it prints ✅ against everything — so a test that only runs it
      against our own tree pins nothing.
MUST: co-locate a `_model/` file's test beside it — `model.ts` → `model.test.ts`. Every file in
      `src/modules/*/_model/` has one; this is the one place a test is mandatory rather than
      judgement.
MUST: keep a rejection test for every access-gated Convex export ([0003](./0003-ownership-via-procedure.md), A6).
MUST: exercise a hook by mounting it — `renderHook` with the module's own store — never by
      re-implementing what it composes.
MUST NOT: mock a module of this repo inside `test/setup.dom.ts`. That file carries browser APIs
          jsdom omits, and nothing else.
MUST NOT: leave a test file no project collects. A test that never runs reports nothing and reads
          as coverage that already exists.
MAY: skip a render test for a component that is layout only — one with no branch, no derived
     value and no prop that changes what is drawn.

## Why

The suite had one project, `environment: "edge-runtime"`, `include: ["**/*.test.ts"]`. Every
consequence of that line was invisible:

- **No `.tsx` could be tested.** Not "was not" — could not. The glob excluded the extension and the
  environment had no DOM, so a component test would have been written, reviewed, committed and
  never executed, with nothing anywhere reporting that it had not run.
- **19 hooks in `src/modules/**/_hooks/`, one tested** — and that one only because it turned out to
  be a pure function wearing a hook's name, which its own file has to explain. `_hooks/` is the
  seam [0006](./0006-screens-never-fetch.md) makes load-bearing: every screen's data reaches it
  through that folder. It was the least covered layer in the repo and the most depended upon.

The `scripts` project came later, and for a different reason than the other two. The checks are
the only code here that fails OPEN: a broken predicate does not error, it approves everything, and
the repo goes green exactly as it does when the rule works. Nothing downstream can catch that —
which is why the checks are worth testing even though they ship to no one. They run against a
throwaway tree via `CHECK_ROOT` (`scripts/_lib.mjs`), since a check pointed at this repo can only
ever confirm the absence of violations.

Two runtimes is not a preference; it is what the code is. Convex functions run in a web runtime
with no DOM and components need a DOM, so one project has to pick one of them and abandon the
other. Splitting them is what makes the second half testable at all.

**What each layer is for, and why the split holds:**

| Layer | Runs in | Subject | Mandatory? |
| --- | --- | --- | --- |
| Model | either | `_model/` — types, invariants, pure derivation | Yes — C10 |
| Check | `scripts` | a C1-C10 script still fails the shape it exists to reject | Judgement |
| Contract | `convex` | a gated export turns the wrong caller away | Yes — C5 |
| Wiring | `app` | a hook's write reaches the state its read subscribes to; a component's branches | Judgement |
| Flow | not yet | a real build, on a device, end to end | See below |

The layers are not a coverage ladder, and a test that could sit lower belongs lower. `_model/`
exists precisely so a domain rule can be asserted against a plain object rather than a mounted
tree ([ARCHITECTURE.md](../ARCHITECTURE.md)) — pushing that assertion up into a wiring test buys
nothing and costs a mount. What a wiring test earns is the thing no lower layer can see: that the
two halves are connected. `buildSections` being correct and `putInCellar` being correct says
nothing about whether a tap reaches the atom the screen reads.

## Not yet — flow tests

Deliberately absent, with a trigger rather than an intention: **Maestro, when the first slice is
wired to Convex end to end.** Today every screen draws placeholder data from a Jotai atom, so a
flow test would pin the fixtures rather than the product, and it would have to be re-recorded the
moment the real data arrives.

Maestro over Detox because a flow is YAML against a build rather than a second JavaScript runtime
to keep alive; over Playwright because the target is a device, and react-native-web is a test
surface this app does not ship on. It runs against an EAS build on a schedule, never in the
pre-commit hook — `pnpm verify` is a per-commit gate and a device build is not.

Until then this ADR claims no flow coverage, which is the point of writing the gap down.

## Verify

```bash
pnpm check:tests   # C10 — every test file is collected by a project; every _model/ has a test
pnpm test          # all three projects
```

## See also

[0003](./0003-ownership-via-procedure.md) — the rejection tests this layers on top of ·
[0006](./0006-screens-never-fetch.md) — why `_hooks/` is the seam worth testing
