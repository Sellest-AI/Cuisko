# 06 — Documentation Architecture for LLM Agents

> How to structure project documentation so an AI agent actually follows it.
> Research-backed, because the intuitive approach — write more documentation — is measurably
> counterproductive, and `.readme/` is a 5,176-line demonstration of why.

---

## The evidence, with provenance

Before the recommendations, the sourcing — because "an LLM told me docs should be short" is exactly
the kind of unverified rule this report exists to criticise.

### Study 1 — Does a context file help at all?

**"Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?"**
ETH Zurich SRI Lab, [arXiv 2602.11988](https://arxiv.org/abs/2602.11988), **February 2026.**

| | |
|---|---|
| **Agents/models** | Claude Code (**Sonnet 4.5**), Codex (**GPT-5.2**, GPT-5.1 Mini), Qwen Code (Qwen3-30B-Coder) |
| **Benchmarks** | AGENTbench — 138 tasks from real GitHub PRs across 12 Python repos *that already had developer-written context files*; plus SWE-bench Lite (300 tasks) |

| Approach | Task success | Inference cost |
|---|---|---|
| **Developer-written** context file | **+~4 pp** | +19% |
| **LLM-generated** context file | **−0.5% to −2%** (hurt in 5 of 8 settings) | +20–23% |
| No context file | baseline | baseline |

**This is recent and it is frontier models** — Sonnet 4.5 and GPT-5.2, six months old. So "today's
LLMs have better attention" does not dismiss it. But read the result carefully, because it cuts both
ways: **human-written context files do help.** The negative result is specifically about
*LLM-generated* ones, and the cost applies to all of them. Agents also took 2.45–3.92 extra steps per
task.

### Study 2 — Does long context degrade?

**Chroma's context-rot work**, across **18 frontier models** (GPT-4.1, Claude 4 family, Gemini 2.5,
Qwen3). Two distinct failure modes:

- **Positional (lost-in-the-middle):** accuracy follows a U-shape — high at the start and end,
  **20–30 points lower in the middle**.
- **Length degradation:** accuracy falls as input grows *even with evidence favourably placed*. A
  200K-token window can show serious loss by **50K tokens** of input.

⚠️ **One number I quoted needs a caveat:** the "0.92 → 0.68 accuracy between a few hundred and 3,000
tokens" figure comes from a controlled *reasoning* task, not coding-agent instruction-following.
Directionally relevant, not directly transferable. I should not have implied otherwise.

### Study 3 — Where instructions sit matters

Instruction **placement** significantly affects adherence: distributing instructions through the
context rather than appending them at the end improved corpus-level performance by **22.3 points on
average**.

This one *supports* hierarchical documentation, and is the strongest argument for **nested
`AGENTS.md` files** — a rule stated in the folder it governs beats the same rule on line 340 of a
root file.

---

## Correction: hierarchical docs are not the problem

An earlier draft of this document said Predecessor's `.readme/` was "25× the effective limit." **That was
wrong, and the reasoning was sloppy** — it conflated *total corpus size* with *context load*.

`.readme/` is genuinely a progressive-disclosure tree: `copilot-instructions.md` directs the agent to
read `LLM_SUMMARY.md`, and only to drill into `CONVEX_ROUTER.md` or `EXPO_UI.md` when the task calls
for it. Measured honestly:

| Layer | Lines | ≈ tokens |
|---|---:|---:|
| `.github/copilot-instructions.md` (auto-loaded by Copilot) | 289 | ~4k |
| `.readme/LLM_SUMMARY.md` (the mandated first read) | 535 | ~7k |
| **First-read budget** | **824** | **~11k** |
| Full corpus if it never drills | 5,176 | ~70k |

~11k tokens is a real cost, and it is above the ~200-line guidance for the always-on layer — but it
is **not** 5,176 lines of always-on context, and the architecture is closer to current best practice
than the first draft credited. The instinct behind it was right.

### So what is the actual problem?

**Accuracy, not volume — and progressive disclosure does nothing for accuracy.**

[02-DIVERGENCE.md](./02-DIVERGENCE.md) catalogues 13 categories of drift. Lazy loading does not
prevent an agent from reading wrong content; it only changes *when*. Worse, it arrives with more
authority, because the agent fetched the file that specifically covers its task:

- An agent that needs to fetch data drills into `expo/lib/LIB_CONVEX.md` (398 lines) and finds a
  fully documented `@/lib/convex/server` module with ten functions — **a file that does not exist.**
- An agent writing a screen drills into `EXPO_APP.md` and gets Next.js server components and
  `preloadQuery` — **impossible in React Native.**
- An agent adding a UI hook drills into `EXPO_UI.md` and finds `useBreakpoint`, `useIsMobile`,
  `useHorizontalScroll`, `useTheme` — **none of the four exist.**

Perfect progressive disclosure delivers all three with full confidence. The hierarchy is fine. **The
missing layer is staleness detection**, which is what `status:` and `## Verify` in an ADR provide,
and what no amount of restructuring gives you.

### A concrete gap worth fixing today

There is **no `CLAUDE.md` and no `AGENTS.md`** in the repository. `.github/copilot-instructions.md`
is Copilot-specific and is not auto-loaded by Claude Code. So for the agent actually in use, the
carefully built hierarchy has **no entry point** — it works only when you point at it manually or the
agent happens to grep the right file. Adding a short `AGENTS.md` fixes that for every tool at once.

---

## The three layers, and what each should own

The critical mental model. These differ by **when they enter the context window**, and that
difference should drive what you put in each.

| Layer | Loads | Cost | Owns |
|---|---|---|---|
| **Always-on** — `AGENTS.md` / `CLAUDE.md` | every session, before the first token of work | full size, every request | commands, boundaries, non-obvious constraints |
| **On-demand** — Skills, ADRs, reference docs | only when triggered or matched | ~100 tokens/skill until activated | procedures, decisions, narrative architecture |
| **External access** — MCP servers | on connect | ~55k tokens for a 5-server setup, before any conversation | live data, external actions |

> **The rule that follows:** if information is not needed *before the agent acts*, it does not belong
> in the always-on layer. Link to it instead.

This is **progressive disclosure**, and it is now a first-class primitive: a Claude Skill puts only
its name and one-line description in context at session start; the body loads when the skill
triggers. Structure your own docs the same way.

---

## Layer 1 — `AGENTS.md` (always-on)

### What it is

Since August 2025 an open specification, **donated to the Linux Foundation's Agentic AI Foundation in
December 2025**, used by 60,000+ repositories and read natively by Claude Code, Codex CLI, Cursor,
Aider, Devin, Copilot, Gemini CLI, Windsurf, Zed, Jules, Amp, Continue, Roo, Factory and Amazon Q.

**Use it instead of a custom `.readme/` convention.** Predecessor put its rules in
`.github/copilot-instructions.md` plus a bespoke `.readme/` tree — a format only one tool reads,
which then went stale. `AGENTS.md` is portable across every agent you might use later.

**Nesting and precedence:** agents read the *nearest* `AGENTS.md` up the directory tree, so a
monorepo or a layered project can override per package. Explicit user prompts beat all files.

```
AGENTS.md              # global: commands, boundaries
convex/AGENTS.md       # backend-specific rules
src/ui/AGENTS.md       # "this folder never imports Convex" — stated where it applies
```

That last line is the important trick: **a rule stated in the folder it governs is far harder to
ignore than the same rule on line 340 of a root file.**

### What goes in (high signal)

- **Exact commands with full flags** — `pnpm verify`, not "run the tests"
- **Non-obvious patterns, with one real code snippet** — one snippet beats three paragraphs
- **"Never" boundaries** — secrets, force-push, protected directories
- **Non-standard tooling** — anything an agent would guess wrong
- **Exact versions** where they constrain the answer
- **Closure criteria** — what "done" means, mechanically

### What stays out (low signal, high cost)

- ❌ **Architecture overviews and directory-structure diagrams.** This is the surprising one, and it
  is exactly what `.readme/ROOT.md` and `LLM_SUMMARY.md` are made of. Agents infer structure from
  the filesystem; a hand-typed tree is redundant when correct and actively harmful when stale — and
  Predecessor's were wrong in six places.
- ❌ Anything already in `README.md` or the code
- ❌ Auto-generated or speculative rules
- ❌ Structure that follows framework convention (Expo Router, Convex) — already known

### The style that works

| ❌ Gets ignored | ✅ Gets followed |
|---|---|
| prose paragraphs | imperative bullets |
| "be careful with auth" | "MUST use `ownedMutation` for any mutation taking a document id" |
| "run the tests" | `pnpm verify` |
| contradictory priorities | one rule, one place |
| "read A, modify B, run C" | "after the change, `pnpm verify` is green" |

**Command-first, task-organised, closure-defined.**

---

## Layer 2 — Agent-optimised ADRs (on-demand)

### Why ADRs, specifically for this project

A classic ADR is a narrative for humans: *Title, Status, Context, Decision, Consequences.* An
**agent-optimised** ADR keeps the same decisions but restructures them so a machine can **find,
scope, follow and check** them.

Look at what this format would have done to Predecessor's biggest failure — the `_generated/server` rule:

| Property | `.readme/` prose | Agent-optimised ADR |
|---|---|---|
| **Scoped** | "never import from generated files", stated globally in 6 docs | `applies_to: ["convex/**/*.ts"]` — loads only for backend files |
| **Unambiguous** | mixed with a contradictory note about `api`/`internal` | `MUST NOT` on `_generated/server`; `MAY` on `_generated/api` — two rules, two lines |
| **Verifiable** | none | `## Verify: pnpm lint` |
| **Revisable** | rotted silently for 58 files | `status: superseded by R-CVX-004` — a state change, not a silent drift |

Every one of the 13 divergences in [02-DIVERGENCE.md](./02-DIVERGENCE.md) is a failure of one of
those four properties.

### The format

Store in `docs/adr/`, one decision per file, **under ~200 lines each**:

```markdown
---
id: R-CVX-001
applies_to: ["convex/**/*.ts"]
status: accepted            # accepted | superseded | deprecated
supersedes: []
---

# Convex builders are imported from procedures.ts

MUST: import query/mutation/action builders and ctx types from `convex/procedures.ts`.
MUST NOT: import from `convex/_generated/server` outside `convex/procedures.ts`.
MAY: import `internal` and `api` from `convex/_generated/api` — except inside
     `procedures.ts`, where it creates a project-wide type cycle (see R-CVX-002).

## Why
`_generated/server.d.ts` imports only `convex/server` and `./dataModel.js`, so it is not in
the api type cycle. Re-exporting it is safe. Conflating it with `_generated/api` is what
caused 58 files to drift in the predecessor project.

## Verify
pnpm lint    # eslint rule R2 / R2b
```

Four properties, deliberately:

1. **`applies_to` glob** — the ADR activates only for files it governs. Token cost scales with
   relevance, not with project size.
2. **MUST / MUST NOT / MAY** — RFC-2119 imperatives, not explanation. No judgement to exercise.
3. **`## Verify`** — a command that proves compliance. This is the same principle as
   [04-BLUEPRINT §P2](./04-BLUEPRINT.md): *a rule with no mechanical check will decay.* Here the
   check is written into the rule itself.
4. **`status`** — a rule you stop following becomes `superseded`, not silent drift. This is the
   single mechanism that would have prevented Predecessor's worst documentation failure.

Keep the reasoning short and put the narrative in `docs/ARCHITECTURE.md`, linked. Research on
LLM-assisted ADR work found a recency window of the **last 3–5 records** gives near-optimal results —
so a small, current set beats an exhaustive archive.

---

## Layer 3 — Skills and MCP (on-demand / external)

**Skills** are procedural knowledge: *how to do a repeatable thing*. A folder with a `SKILL.md`;
name and description cost ~100 tokens until triggered, then the body loads.

Good candidates for the cooking app — each is a multi-step procedure that spans layers and is easy to
get subtly wrong:

- `add-domain` — schema → functions → router → module hook → screen, in order, with the naming rules
- `add-webhook` — always via `verifiedWebhook`, never bare `httpAction`
- `add-migration` — schema change + `@convex-dev/migrations` + backfill

**MCP** is *access*, not knowledge: connecting to a live database, GitHub, an API. Add it only when
the blocker is genuinely external. It is the expensive layer — a 5-server setup can consume ~55k
tokens before you type anything. The Convex MCP server is worth it once you have a live deployment
(it can query real data and read function specs); most others are not.

**The decision rule:**

| The agent is missing… | Add |
|---|---|
| a rule it should always respect | `AGENTS.md` |
| a decision that governs certain files | an ADR with `applies_to` |
| a repeatable multi-step procedure | a Skill |
| access to an external system | MCP |
| background narrative | `docs/*.md`, **linked, not loaded** |

---

## Recommended setup for the cooking app

```
AGENTS.md                       ~150 lines. Always loaded. ← the only always-on file
CLAUDE.md                       one line: "See AGENTS.md"  (or a symlink)
convex/AGENTS.md                ~40 lines. Backend rules, stated where they apply.
src/ui/AGENTS.md                ~15 lines. "This folder never imports Convex." Nothing else.
docs/
├── adr/
│   ├── 0001-convex-procedures-only.md
│   ├── 0002-ui-isolation.md
│   ├── 0003-ownership-via-procedure.md
│   ├── 0004-webhooks-must-verify.md
│   └── 0005-env-validated-at-boot.md
├── ARCHITECTURE.md             the narrative. Linked from AGENTS.md, NOT inlined.
├── CONVENTIONS.md              05-CONVENTIONS.md. Reference, loaded on demand.
└── DOMAIN.md                   schema + the reasoning behind each modelling decision.
.claude/
├── skills/add-domain/SKILL.md
└── settings.json               hooks
```

### The root `AGENTS.md`, in full

This is the whole always-on budget. Notice what is *absent*: no directory tree, no architecture
overview, no restating of framework conventions.

```markdown
# Cooking App — Agent Instructions

Expo (React Native) + Convex. TypeScript throughout.

## Commands
pnpm verify        # typecheck + lint + test — MUST pass before any PR
pnpm convex:dev    # MUST be running before `pnpm start`
pnpm start         # Expo dev server

## Before you write code
Read `docs/CONVENTIONS.md` for naming and file placement.
Decisions that constrain code are in `docs/adr/` — each declares the files it governs.

## Never
- Never import `convex/_generated/server` outside `convex/procedures.ts`  (ADR 0001)
- Never import Convex from `src/ui/**`                                     (ADR 0002)
- Never call `useQuery` in `app/**` — screens call a module hook           (ADR 0006)
- Never define a webhook with bare `httpAction` — use `verifiedWebhook`    (ADR 0004)
- Never default a secret to `''` — env is Zod-validated and throws         (ADR 0005)
- Never commit secrets or force-push

## Non-obvious patterns
Router files bind an access level to a shared handler. The export NAME must match the
builder — `admin` requires `adminQuery`, not `authQuery`:

    const handler = async (ctx, args) => { /* the work */ }
    export const authed = authQuery({ args, handler: (ctx, a) => handler(ctx, {...a, userId: ctx.userId}) })
    export const admin  = adminQuery({ args: {...args, userId: v.id("users")}, handler })

Mutations taking a document id use `ownedMutation('<table>')`, which loads the row and
asserts ownership before your handler runs. Access it as `ctx.doc`.

## Done means
`pnpm verify` is green. New non-`anon` endpoints have an authorization test.
```

That is roughly 45 lines and it carries more enforcement than 5,176 lines of `.readme/`, because
every line is either a command, a boundary, or a non-obvious pattern — and each rule points to an ADR
with a `Verify` command behind it.

---

## Answering the original question directly

> *Should we write a doc for an LLM, or add heavy production LLM architecture (ADR, memory, …)?*

**Neither extreme.** Concretely:

| | Verdict |
|---|---|
| A hierarchical doc tree for the LLM | ✅ **Yes — keep it.** The `.readme/` structure was sound; progressive disclosure is current best practice. What it lacked was staleness detection, not brevity. |
| Trimming the always-on entry point | 🟡 **Worthwhile.** ~11k tokens of first-read is defensible but not free; ~150 lines carries the same enforcement if every line is a command, a boundary, or a non-obvious pattern. |
| `AGENTS.md` (+ nested ones) | ✅ **Yes, day one.** Linux Foundation standard, portable across every agent — and today the repo has *no* entry point Claude Code reads at all. Nested files also exploit the +22.3 pt placement effect. |
| Agent-optimised ADRs | ✅ **Yes, but grow them.** Start with the 5 rules that map to the 🔴/🟠 flaws. One file per decision, `applies_to` + `Verify` + `status`. |
| Skills | 🟡 **Later.** Add when you notice yourself explaining the same multi-step procedure twice. `add-domain` first. |
| MCP | 🟡 **Later.** Convex MCP once there is a live deployment. Nothing else until a specific blocker. |
| Long-form architecture docs | ✅ **Keep — but as reference.** `docs/ARCHITECTURE.md`, linked from `AGENTS.md`, never inlined. |

**And the meta-point.** Predecessor's mistake was never the volume of documentation, and it was not the
hierarchy — both were reasonable. It was that **no line of it was ever checked against the code**,
combined with an explicit instruction to trust it over the code, at
`.github/copilot-instructions.md:20`:

> *"The documentation is the source of truth."* … *"Trust these instructions — only search codebase
> if information is incomplete or unclear."*

**Never write that sentence.** The code is the source of truth. Documentation is a curated index into
it, and every rule it asserts must carry the command that proves it still holds.

---

## Sources

- [AGENTS.md — official specification](https://agents.md)
- [AGENTS.md Complete Guide 2026: Spec, Tools, Examples — Codersera](https://codersera.com/blog/agents-md-complete-guide-2026/)
- [How to Build Your AGENTS.md (2026) — Augment Code](https://www.augmentcode.com/guides/how-to-build-agents-md) *(ETH study data, length limits, include/exclude lists)*
- [ADRs for Coding Agents: Architectural Context, Optimized — Actual AI](https://www.actual.ai/blog/agent-optimized-adrs) *(the `applies_to` / MUST / Verify format)*
- [Context Matters: Evaluating Context Strategies for Automated ADR Generation Using LLMs — arXiv](https://arxiv.org/html/2604.03826v2) *(recency window of 3–5 records)*
- [Your CLAUDE.md Is Probably Too Long — TianPan.co](https://tianpan.co/blog/2026-02-14-writing-effective-agent-instruction-files)
- [AGENTS.md Patterns: What Actually Changes Agent Behavior — Blake Crosley](https://blakecrosley.com/blog/agents-md-patterns)
- [Claude Code Memory vs MCP vs Skills (2026): Which Layer Should Own What? — LaoZhang AI](https://blog.laozhang.ai/en/posts/claude-code-memory-vs-mcp-vs-skills)
- [Progressive Disclosure in AI Agents — MindStudio](https://www.mindstudio.ai/blog/progressive-disclosure-ai-agents-context-management)
- [Best practices for Claude Code — Anthropic docs](https://code.claude.com/docs/en/best-practices)
