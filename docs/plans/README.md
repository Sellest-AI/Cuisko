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
2. Review it       plan-reviewer and the author loop until it says READY; no user in the loop
3. Ask once        what neither could settle reaches the user in one batch, at the end
4. Agree it        the other half of the work reads it and pushes back; this is the point
5. Build from it   in slice order, thin end-to-end first; tick each slice as it lands
6. Take it down    deleted in the commit that finishes the slice
```

Steps 2 and 3 are [the review loop](#the-review-loop).

**Step 6 is not optional, and it is the whole reason this folder is safe to have.**

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

## The five sections

Copy [\_template.md](./_template.md). Each section answers a different question, and they are ordered
so that a wrong answer is caught before it is expensive.

| # | Section | The question | The cost of skipping it |
| --- | --- | --- | --- |
| 1 | Problem | What can the user not do today, how would we know it worked, and what is left out? | You build the right thing badly, or the wrong thing well |
| 2 | Architecture | Which tables, which operations, what flow, what happens to the rows already there? | Discovered during implementation, when the schema is already written |
| 3 | Program design | Which files, what call stack, what signatures, which tests? | **The seam between the two halves of the work is discovered during wiring** |
| 4 | What can go wrong | What happens on a failure, a retry, a dropped connection, a second device? | The build decides each case by accident, and a fix commit decides it again |
| 5 | Slices | In what order, thin end-to-end first? | Five layers deep before anything is runnable |

Section 3 is the one most likely to feel skippable and is the one that pays. Keep it to signatures
and file paths — not implementation. If you are writing logic, you are writing the feature in
markdown, and the model is better at that in TypeScript.

Section 4 is where most of this repo's fix commits would have been one line instead: a video import
whose card vanished when the connection dropped, a share Android replayed from Recents, archived
recipes in the catalog export. Each was a case nobody wrote down.

Two more parts, written by [the review loop](#the-review-loop) rather than by hand: **Open
questions**, what waits for the user, and **Review log**, what the reviewer raised and the author
declined.

---

## The review loop

Every new plan is reviewed before the user sees it, by
[`plan-reviewer`](../../.claude/agents/plan-reviewer.md): a read-only agent that reads the plan and
the code it names, and reports what building it as written would get wrong — a failure path with no
behaviour, existing rows the new code breaks, a hook that returns no error state, a paid call with
no rate limit. It returns numbered findings and a verdict, `REVISE` or `READY`.

The point is that the user is not in this loop. The author and the reviewer go round until the
plan holds, and the user is asked only what neither of them could settle, once, at the end.

```
author writes the plan ──▶ plan-reviewer, round 1
                              │
                ┌── REVISE ◀──┤
                ▼             └── READY ──▶ ask the user, once ──▶ the user agrees the plan
   author fixes or declines            (one more round if an answer
   each finding, questions             changed the design)
   go to Open questions
                │
                └──▶ plan-reviewer, round n+1
```

**Each round, the author handles every finding.** No finding is ignored; each ends one of three ways:

- **Fixed** — the plan text now settles it. No log entry: the text is the fix.
- **Declined** — wrong, or out of scope. One line in the Review log with the reason. The reviewer
  does not raise it again unless the reason is factually wrong.
- **A question** — only the user can decide. It goes to Open questions with its options and a
  recommendation, and the loop carries on around it.

**The author's own unknowns go there too.** Whoever hits a decision that is the user's, author or
reviewer, writes it down and keeps going. Before writing one, try to answer it: from the code, an
ADR, [PRODUCT.md](../PRODUCT.md). A question the repo already answers is a finding, not a question.

**Running a round.** Round 1 is a fresh `plan-reviewer`, and its prompt is the plan's path and
"round 1" — nothing else. The plan carries its own intent; if the reviewer needs the prompt to
understand the slice, the plan is missing that, and the next agent to build from it will be too.
Later rounds continue the same reviewer (`SendMessage`), which already holds the code it read. A
fresh one loses nothing, because the Review log in the file is the loop's state.

**Verify a finding before acting on it.** Open the section and the file it names. The reviewer was
not there when the plan was written, and it can be wrong; a finding that does not hold is declined,
with the reason.

**When the loop stops:**

| Stop | Then |
| --- | --- |
| `READY` | Ask the open questions, if there are any |
| Round 4 ends `REVISE` | Stop. The open findings go to the user with the questions: a plan that does not converge in four rounds is a disagreement or a missing decision, and another round will not find it |
| A declined finding comes back with a new reason, twice | It goes to the user as a question. Two parties that disagree twice are not going to agree on a third pass |
| A question decides whether the plan exists at all — the premise contradicts PRODUCT.md, or the slice is not wanted | Ask it now. Polishing a plan that may be thrown away is the waste the loop exists to remove |

**Asking the user, once.** Every open question in one batch, each with its options and the
recommendation first. Record each answer in the section it changes and remove it from Open
questions. An answer that changes the design, rather than confirming the recommendation, gets one
more round, scoped to what it changed.

**Then the user agrees the plan.** They were not in the loop, so tell them what it did: the number
of rounds, what the review changed in a few lines, and the declined findings, so they can overrule
one. The loop removes the iterations; it does not remove the agreement.

**A plan revised mid-build** — a slice found that changes §2 or §3 — gets one round on the change
before it is built.

---

## Enforcement 👁

Writing a plan is judgement, not a mechanism: nothing can tell whether a change "crosses two layers"
without being the judgement itself. So is the review loop: whether it ran lives in the conversation
and the Review log, and nothing checks either. It is listed as such in
[CONVENTIONS §11](../CONVENTIONS.md#11-rules-that-stay--and-why), with the deletion rule stated in
AGENTS.md's **Done means**.

The single rule with teeth: **a slice is not done while its plan file still exists.** Anything else
here is a guideline, and this file says so rather than pretending otherwise.
