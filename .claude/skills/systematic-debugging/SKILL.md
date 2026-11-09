---
name: systematic-debugging
description: Use when a bug, a failing test, a red `pnpm verify` or any unexpected behaviour shows up in Cuisko, before proposing a fix. Finds the root cause first, then pins it with a test as AGENTS.md "Tests" requires.
---

<!-- Adapted from obra/superpowers, skills/systematic-debugging (MIT, © Jesse Vincent). -->

# Systematic debugging

**No fix before the root cause.** A fix at the symptom moves the bug. It does not remove it.

Use it for every bug, simple ones too. A simple bug has a root cause as well, and the first guess
sets the pattern for every later one.

## 1. Find the root cause

1. **Read the whole error.** Stack trace, file, line, Convex error code. The answer is often there.
2. **Reproduce it.** Same input, same result, every time. If you cannot, collect more data. Do not
   guess.
3. **Check what changed.** `git log --oneline -15`, `git diff dev...`, a dependency bump, an env
   variable, a schema change. A bug that appeared after a change usually lives in it.
4. **Find the failing layer.** Cuisko crosses layers: screen → module hook (`_hooks/`) → router
   (`convex/router/`) → function (`convex/functions/`) → table. Check the value at each boundary,
   once, and find the first layer where it goes wrong. Example: the grocery list shows 1 egg to buy,
   with 5 eggs owned and a recipe needing 2. Is `toBuy` already 1 in the query result (backend), or
   does the screen compute it (ADR 0015 forbids that)?
5. **Trace the bad value back.** From where it appears, ask "who passed this?" and go up until you
   reach where it was made. Fix it there, not where it surfaced.

## 2. Compare with code that works

1. Find a similar case in this repo that works — another router, another hook, another module.
2. Read it in full. A skimmed reference gives a partial fix.
3. List every difference, even the small ones: the index used, the builder (`authQuery` vs
   `ownedMutation`), the args validator, the `householdAtom` key.

## 3. One hypothesis at a time

1. Say it in one line: "I think X is the cause, because Y."
2. Test it with the smallest change. Change one thing only.
3. Wrong? Undo the change, then make a new hypothesis. Never stack a second change on the first.
4. If you do not understand something, say "I don't understand X". Do not cover it with a guess.

## 4. Fix

1. **Pin the rule that broke, not the instance** (AGENTS.md "Tests"). Put the test in the existing
   test file of the layer that owns the rule (`convex/`, `shared/`, `_model/`). Run
   `pnpm test <file>` and watch it fail on the old code.
2. **Make one fix, at the root cause.** No refactor and no "while I'm here" change in the same fix.
3. **Verify.** The new test passes, then `pnpm verify` is green.
4. **The fix turns an existing test red? STOP.** Report it with the table in AGENTS.md "Tests". Never
   edit the assertion.
5. **A guard at another layer** (a validator, an index, a `v.` type that makes the bad value
   impossible) is often worth adding. It reaches files outside the fix, so put it under **Found** and
   do not add it.

Remove every `console.log` you added before you finish.

## When to stop

**Three fixes failed? Stop and report to the user.** Do not try a fourth. When each fix shows a new
problem somewhere else, the design is probably wrong, not the hypothesis. That decision is the
user's. Report what you tried, what each attempt showed, and which design choice you suspect.

**Stop and go back to step 1** when you catch yourself thinking:

| Thought                                        | What is true                                        |
| ---------------------------------------------- | --------------------------------------------------- |
| "Quick fix now, investigate later"             | Later never comes. The bug comes back.              |
| "Let me just try changing X"                   | That is a guess, not a hypothesis.                  |
| "I'll change three things, then run the tests" | You will not know which one worked.                 |
| "I'll check it by hand, no test"               | An untested fix does not stay fixed.                |
| "I see the problem"                            | You see the symptom. Trace it to its origin.        |
| "One more try" (after two failures)            | Two failures say the model of the bug is wrong.     |

The user saying "stop guessing", "is that really happening?" or "we're stuck" means the same thing:
go back to step 1.

## Flaky tests

A test that fails only sometimes usually waits a fixed time for something async. Wait for the
condition itself (Testing Library's `waitFor`, or `vi.useFakeTimers()` for timed behaviour), never
for a fixed `setTimeout`.

## No root cause found

It can be truly external: the Convex deployment, the network, the model provider. Then write in
**Found** what you checked and where. Propose handling (a retry, a clear error) as a separate
change. Most "no root cause" cases are an investigation that stopped too early, so check step 1 again
first.
