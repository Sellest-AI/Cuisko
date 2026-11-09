---
name: committing
description: Use before every git commit or merge in Cuisko — when the user asks to commit, to merge into dev, or to release to main. Runs the full review (pnpm verify, architecture-reviewer, /code-review, the fix loop), checks the branch, and writes the commit message. Use it instead of any generic commit skill.
---

# Committing in Cuisko

Commit only when the user asks (AGENTS.md, **Never**). Then run the two parts below, in order.

## 1. Full review (REQUIRED)

Run this **every time**, before staging, on every changed file. Do not skip it because a change looks
small — most defects this catches are one-line changes.

**Step 1 — automated.** `pnpm verify` (typecheck + lint R1–R8 + the C1–C20 scripts + knip + tests).
Run it before the reviews, and do not run it again before committing: the hook does. Run it by
hand afterwards only when nothing will be committed.

**Step 2 — get the changed set.** `git diff --name-only`, `git diff --cached --name-only` and
`git ls-files --others --exclude-standard`. You need it to decide Step 4's trigger and to check the
findings in Step 5. The reviewer does **not** need it from you — it runs the same commands itself.

**Step 3 — spawn `architecture-reviewer`. Every time.** A cold context catches what yours cannot:
you know what you meant, so you read the diff as intent rather than as text. It is defined in
`.claude/agents/architecture-reviewer.md`, runs read-only on Sonnet, and establishes its own inputs
— the changed set from `git`, the applicable ADRs from their `applies_to` frontmatter, the criteria
from the **Never** and **Code rules** tables in `AGENTS.md`.

**Your prompt carries the intent, and nothing else:**

- **what the change is for**, in two or three lines.
- **what scope was deliberately left out** — placeholder data, a screen not yet wired to Convex, a
  test deferred to the next slice. Absent scope reads as an omission to someone who was not there,
  and you will get it back as a finding.
- **anything that happened outside the diff** it would otherwise misread — a file moved rather than
  rewritten, a rule you and the user agreed to break knowingly.

**Do not list the changed files, and do not name the ADRs.** It is tempting: you already know both,
and typing them looks like saving the reviewer a step. But a list you write is a filter you control,
and you are the party under review — forget one untracked file and it is never checked; forget the
one ADR your change happens to break and the review comes back clean on the rule you broke. Both
failures are invisible in the output. The reviewer derives those from the repo so that no mistake of
yours can narrow what it looks at. What you supply is what `git` cannot know: why.

**Step 4 — `/code-review` when the diff contains logic.** It hunts defects, which Step 3 deliberately
does not: off-by-one, unhandled rejection, an unreachable branch, an N+1. Trigger is concrete —
`convex/functions/`, `convex/router/` beyond a validator change, `src/modules/**/_hooks/`, or
`shared/`. Skip it for pure `src/ui/` styling, docs, config and dependency bumps; a defect hunt on a
stylesheet finds nothing and teaches you to skip the step that matters.

**Both passes run on the same diff, and that is the point** — they are not redundant, they are split
by question. Step 3 asks *does this obey the rules we wrote down*, and answers it from a table, which
is why it can be a cheap model with no Bash. Step 4 asks *is this correct*, which needs a defect hunt
and the depth to run one. Neither finds the other's issues. If you catch Step 3 reporting a race
condition or Step 4 reporting a filename, the split has collapsed and the cheap pass has stopped
being cheap.

**Step 5 — verify every finding before fixing or relaying it.** Open the file each one names and
confirm it. A reviewer that never saw the conversation also invents findings, and acting on one
unchecked costs more trust than the whole review buys.

### The fix loop

**When the review finds anything, fix, re-run, and report what is left: three reviews at most**,
like the plan review loop (`docs/plans/README.md`, "The review loop"). BLOCKING breaks a written
rule; NON-BLOCKING breaks none but costs something you can point at (a name that says nothing, a
duplicated shape). Each round, verify every finding (Step 5), then:

- **Fix it** if it is BLOCKING and the fix stays inside the change, or NON-BLOCKING and the
  reviewer marked it `Effort: easy` (local, mechanical, no behaviour change). The tag is a hint.
- **Leave it** if it is involved (reaches files the change never touched, an extraction), or the
  user's call even when easy: a deliberate violation, a behaviour change, wider scope.
- **Decline it**, with the reason, if it does not hold once the file is open.

A fix obeys the rest of `AGENTS.md`: one that turns an existing test red stops the loop (AGENTS.md,
"Tests"). Then continue the same reviewer with `SendMessage`: `round n`, each finding marked fixed,
left or declined, with a reason for the last two. The loop ends on a clean round, after round 3, or
when a round fixed nothing. Then Step 4 on the fixed diff, and report:

```
Architecture review: 3 rounds, 3 fixed, 2 left, 1 declined
FIXED     getOne.ts:48 `admin` → `adminQuery` (ADR 0001 · r1) · use-recipes.ts → useRecipes.ts (r1) · …
LEFT — BLOCKING
1. src/ui/cards/recipe.tsx:3 — imports `Doc<'recipes'>` from ~/lib/convex/api  (ADR 0002)
   Couples the design system to the schema. Fix: a structural prop type.
   Left because: the card then needs `servings`, which no screen passes yet; it widens the slice.
LEFT — NON-BLOCKING
2. convex/functions/recipes/loadRecipe.ts:22 — `const data = await ctx.db.get(id)`  (naming)
   `data` says nothing three lines down. Fix: rename to `recipe`.
   Left because: `loadRecipe` is outside this change, and the name reaches 6 callers.
DECLINED  useRecipes.ts:14 "useQuery outside a hook": it is the hook (ADR 0006).
```

Every left finding cites its rule, what actually breaks, and why it was left. Then wait for approval.

If a violation is deliberate, ask the user to confirm, and record it: a knowingly-broken rule must
become `status: superseded` in its ADR. **Never leave a rule documented as active that the project
has stopped following** — that single failure is what let 58 files drift in the predecessor project.

## 2. Writing the commit

**First, check the branch: `git branch --show-current`.** The `pre-commit` hook validates the branch
*name* against the type vocabulary; it cannot tell whether the change belongs there. So a commit
landing on the wrong branch fails silently — and stays invisible, because nobody reviewing that PR
expects it. Moving it afterwards costs a cherry-pick, a reset and a rebase.

Ask what the branch exists to do, then:

- The change serves that purpose → commit.
- It does not — a doc, an unrelated fix, a chore no other commit here needs → **stop and ask the
  user**, naming the branch it belongs on. Usually `dev`, or a branch of its own.
- Unsure → ask. The question is cheaper than the move.

Supporting work is not a stray: a `feat(groceries)` a `feat/planning-…` branch needs, or a `fix` for
something the branch itself broke, belongs on the branch, even when its scope is another domain.

- **The hooks check the files on disk, not what you commit.** An uncommitted edit can hide a broken
  commit, so trust `pnpm verify` only once nothing is left uncommitted. Commit `package.json` whole.
- **Into `dev`:** rename a `claude/…` branch to `<type>/…` (the hook refuses it), merge `dev` into
  it, verify, then a plain `git merge`. Never `--no-ff`. A push to `dev` ships to preview phones and
  the dev Convex deployment.
- **Into `main`:** only `dev` is merged into `main`, and only when the user says so: that merge is
  the release, to the production channel and the prod deployment (`docs/ARCHITECTURE.md` §
  Releases).

Format is Conventional Commits. The rules live in `commitlint.config.js`, which the `commit-msg` hook
runs; branch names are checked by `.githooks/pre-commit`. When the two disagree with a doc, they win.
One logical change per commit. Scopes and a worked example: `docs/CONVENTIONS.md` §10.

**Write the body for an agent reading `git log` a year from now.** It will have the diff; what it
cannot recover is intent. So the body is the payload, not decoration:

- **The trigger** — what was broken, missing or newly required. Highest-value sentence in the message.
- **What changed by layer**, not by file — "the check moved from `router/` into `procedures.ts`".
- **The governing rule** when one applies (`ADR 0003`, `C4`, `lint R7`), so `git log --grep` finds it.
- **What you deliberately did not do**, if a reader would wonder. Absent scope is invisible in a diff.

Omit the body only when the subject is complete alone (`chore(deps): bump convex to 1.44`).

⚠️ **Never start a body line with `word:`.** The parser reads `Note:`, `Result:`, `enforced:` as a
footer token and treats everything after it as footers — silently wrecking the structure the history
is supposed to be readable by. Rewrite as "enforces it: …", or put the phrase mid-line. The
`commit-msg` hook refuses it (`no-footer-shaped-body-line`), except for real footer tokens, so
write the body without it rather than retrying until it passes.

No `Co-Authored-By` or any AI-attribution trailer (AGENTS.md, **Never**).
