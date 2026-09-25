# Plans

One file per slice, written **before** the code, deleted **when the code lands**.

A plan is scaffolding. It exists to make the expensive decisions cheap — while they are still a
paragraph rather than a diff — and then it comes down. Nothing in this folder is a description of
how the app works; that is what the code, the [ADRs](../adr/) and the commit bodies are for.

---

## Why the folder exists

Two problems, and the second is the one that matters most here.

**Decisions get made at the worst possible moment.** Without a plan, the choices that shape a
feature — which files exist, what a hook returns, what the arguments are called — get made
implicitly, mid-implementation, interleaved with the code that depends on them. That is the most
expensive place to change them: the work already exists, and whoever wrote it is anchored to it.
The same decisions, made first, cost thirty lines of markdown and ninety seconds of reading.

**Work here is split, so the interface is a contract between two people.** One person builds the
backend while the other builds the screen. Whatever the hook returns is the seam between them, and
a seam discovered during wiring is a rewrite for one side. Section 3 of the template exists
precisely to settle that seam before either half is built.

---

## Lifecycle

```
1. Write it        before code, in a short session — the model is cheap and unbiased here
2. Agree it        the other half of the work reads it and pushes back; this is the point
3. Build from it   in slice order, thin end-to-end first; tick each slice as it lands
4. Take it down    deleted in the commit that finishes the slice
```

**Step 4 is not optional, and it is the whole reason this folder is safe to have.**

A plan that survives its slice becomes a document that describes the code and is not maintained by
the code — which is exactly the failure this repository is built against. The predecessor's docs
asserted ten functions that were never written and four hooks that never existed; none of it was
careless, it was all true when written and nothing re-read it
([_reference/02-DIVERGENCE.md](../_reference/02-DIVERGENCE.md)). A stale plan is worse than a stale
doc, because it reads as a specification and an agent will build against it.

Same rule the project already applies to dead code: **delete it, git remembers.** If you need a
landed plan again:

```
git log --diff-filter=D --name-only -- docs/plans/
```

### What survives, and where it goes

Nothing is lost by deleting the file, because anything durable in a plan belongs somewhere else:

| What it was | Where it lives after |
| --- | --- |
| A description of what the code does | The code. It is the source of truth |
| A decision that constrains future code | A new record in [adr/](../adr/) |
| A naming or placement rule | [CONVENTIONS.md](../CONVENTIONS.md) |
| Why this slice existed at all | The commit body — [AGENTS.md](../../AGENTS.md) already requires the trigger |

If a plan contains something that fits none of those rows, it was a note, not a decision.

---

## When to write one

**A change that crosses two layers.** Backend plus frontend, schema plus router, a new module plus
the screen that consumes it. Those are the changes where an unagreed interface costs a rewrite.

**Not** for: a single component, a copy change, a dependency bump, a fix inside one file. A plan for
a one-file change is ceremony, and ceremony is what teaches people to skip the process entirely.

---

## The four sections

Copy [\_template.md](./_template.md). Each section answers a different question, and they are ordered
so that a wrong answer is caught before it is expensive.

| # | Section | The question | The cost of skipping it |
| --- | --- | --- | --- |
| 1 | Problem | What can the user not do today, and how would we know it worked? | You build the right thing badly, or the wrong thing well |
| 2 | Architecture | Which tables, which operations, what flow? | Discovered during implementation, when the schema is already written |
| 3 | Program design | Which files, what call stack, what signatures, which tests? | **The seam between the two halves of the work is discovered during wiring** |
| 4 | Slices | In what order, thin end-to-end first? | Five layers deep before anything is runnable |

Section 3 is the one most likely to feel skippable and is the one that pays. Keep it to signatures
and file paths — not implementation. If you are writing logic, you are writing the feature in
markdown, and the model is better at that in TypeScript.

---

## Enforcement 👁

Writing a plan is judgement, not a mechanism: nothing can tell whether a change "crosses two layers"
without being the judgement itself. It is listed as such in
[CONVENTIONS §11](../CONVENTIONS.md#11-rules-that-stay--and-why), with the deletion rule stated in
AGENTS.md's **Done means**.

The single rule with teeth: **a slice is not done while its plan file still exists.** Anything else
here is a guideline, and this file says so rather than pretending otherwise.
