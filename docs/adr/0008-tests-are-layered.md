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
MUST: assert a C1-C15 check on the shape it REJECTS, not on this repo passing it. A check fails
      open — break its predicate and it prints ✅ against everything — so a test that only runs it
      against our own tree pins nothing.
MUST: assert the finding text, not just the exit code. A crashing check also exits 1, so an
      exit-code-only test passes against a check that has stopped working. `runCheck` throws on a
      crash for this reason; the assertion is the second half of the guard.
MUST: put every test in a `__tests__/` folder beside its subject, with no exceptions —
      `convex/router/cellars/addToCellar.ts` → `convex/router/cellars/__tests__/addToCellar.test.ts`.
      C10 rejects a test file anywhere else. See "Where a test file sits" below.
MUST: give every file in `src/modules/*/_model/` a test — in that folder's `__tests__/`. This is
      the one place a test is mandatory rather than judgement 📐 C10.
MUST: keep a rejection test for every access-gated Convex export ([0003](./0003-ownership-via-procedure.md), A6).
MUST: exercise a hook by mounting it — `renderHook` with the module's own store — never by
      re-implementing what it composes.
MUST: preload the module under test in a `beforeAll` when a `convex-test` file reaches a function
      through `api.` / `internal.` — filter the glob on `/convex/<path>.` (the trailing dot keeps
      a `"use node"` sibling out), never load the whole glob. See "The first test pays for the
      import" below 📐 C10.
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
throwaway tree via `CHECK_ROOT` (`scripts/checks/_lib.mjs`), since a check pointed at this repo
can only ever confirm the absence of violations.

Two runtimes is not a preference; it is what the code is. Convex functions run in a web runtime
with no DOM and components need a DOM, so one project has to pick one of them and abandon the
other. Splitting them is what makes the second half testable at all.

**What each layer is for, and why the split holds:**

| Layer | Runs in | Subject | Mandatory? |
| --- | --- | --- | --- |
| Model | either | `_model/` — types, invariants, pure derivation | Yes — C10 |
| Check | `scripts` | a C1-C15 script still fails the shape it exists to reject | Judgement |
| Contract | `convex` | a gated export turns the wrong caller away | Yes — C5 |
| Wiring | `app` | a hook's write reaches the state its read subscribes to; a component's branches | Judgement |
| Flow | not yet | a real build, on a device, end to end | See below |

The layers are not a coverage ladder, and a test that could sit lower belongs lower. `_model/`
exists precisely so a domain rule can be asserted against a plain object rather than a mounted
tree ([ARCHITECTURE.md](../ARCHITECTURE.md)) — pushing that assertion up into a wiring test buys
nothing and costs a mount. What a wiring test earns is the thing no lower layer can see: that the
two halves are connected. `buildSections` being correct and `putInCellar` being correct says
nothing about whether a tap reaches the atom the screen reads.

## Where a test file sits

`__tests__/` beside the subject. Everywhere, for everything, with no exception — given any path
there is exactly one legal place for its test, computable from the path alone. C10 rule 3 enforces
it, so this is checked rather than reviewed.

**Why a folder rather than a sibling.** `convex/router/cellars/` holds seven operations and seven
rejection tests. Co-located, the operations are buried among their tests and `ls` stops answering
"what can this router do?" — the question the folder exists to answer. The effect scales with how
well-tested a folder is, which means co-location penalises exactly the folders doing best.

**Why `_model/` and `_hooks/` are not exceptions, though they were.** The argument for exempting
them was that adjacency makes a missing `_model/` test visible at a glance. It does — but C10 makes
that test *mandatory*, so the tree is not what has to make its absence visible; the check already
does, and it does so whether the test is a sibling or one folder down. Once the check exists the
exemption buys nothing and costs a rule with a branch in it, which is the kind the next author gets
wrong in the direction of the exception.

**Why not "use `__tests__/` once the folder gets crowded".** It cannot be checked, so it cannot be
reviewed, and it makes every already-correct file ambiguous — a co-located test would no longer
mean "follows the rule", it would mean "someone judged this folder small enough", which is not
recoverable from the tree.

**What this cost.** Five test files moved out of `_model/` and `_hooks/`, C10 gained a third rule,
and this ADR reversed a MUST it had stated. Recorded rather than quietly rewritten, because the
exemption was defensible and the reason it lost is the part worth keeping: a rule a script can
check beats a rule that reads better.

## The first test pays for the import

Every `convex-test` file hands the runner `import.meta.glob("/convex/**/*.*s")` — **lazy** loaders,
one per backend module. A test that calls a function through `api.` / `internal.` makes the runner
resolve that path, and the module graph beneath it is transformed and instantiated on that call:
charged to whichever test made it, against that test's own 5s timeout. Almost always the first test
in the file, whatever its subject.

This fails in the one way a suite cannot see. 2.2s and 2ms both print a green tick, and the cost
grows with the backend rather than with the test, so it surfaces as a timeout on somebody's
unrelated commit and is dismissed as a flake. Measured twice: `router/media/images/uploadMany` at
3.6s under `pnpm verify` load on 11 September 2026, which gave every router test its warm-up; then
`__tests__/migrations.test.ts` at 2.2s idle and 5s under load four days later, a file the router
sweep had not covered.

The fix is five lines, and it is per file: a `beforeAll` that loads the module under test through
the same glob, so the import lands before any test is timed.

```ts
beforeAll(() =>
  Promise.all(
    Object.entries(modules)
      .filter(([path]) => path.startsWith("/convex/router/recipes/getOne."))
      .map(([, load]) => load()),
  ),
);
```

Two details carry weight. The trailing dot in `getOne.` keeps a `"use node"` sibling (`getOneNode.ts`)
out of the edge-runtime project. And it warms **that file's own module**, never the whole glob:
every globbing file importing the entire backend measured four times slower than the cold suite.

A test that imports its subject directly — the `functions/` tests, which call `loadRecipe(ctx, …)`
rather than `api.…` — pays the import at module load, outside any timer, and needs no warm-up.
"The module under test" means every module the file calls, not only its subject: a test that seeds
through `planning.commit`, or calls `households.join` on the way to `leave`, warms those too — the
leave test warmed `leave.` alone and paid for `join` inside a timed test. It extends to a module the
subject itself runs through `ctx.runQuery` on every call: `recipes/updateOne` checks ownership
through `recipes/getOne._internal`, so its test warms `getOne.` as well.

C10 rule 4 checks the shape: a `convex-test` file that references `api.` or `internal.` carries a
`beforeAll`, and when that warm-up filters with `startsWith("/convex/…")`, every module the file
names falls under one of those prefixes. A reference into `router/` must end in a legal export name
(`authed`, `_internal_<verb>`…, the C1 grammar), since that is how the module is read off it;
`migrations.` keeps one export per migration and is outside the rule. It reads the test's text
only, so a module the subject calls from inside — the `updateOne` → `getOne` case — is left to the
author and to review.

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
pnpm check:tests   # C10 — every test file is collected by a project; every _model/ has a test;
                   #       every convex-test file calling through api./internal. warms its module
pnpm test          # all three projects
```

## See also

[0003](./0003-ownership-via-procedure.md) — the rejection tests this layers on top of ·
[0006](./0006-screens-never-fetch.md) — why `_hooks/` is the seam worth testing
