# Reference — the Predecessor audit (frozen)

> ## ⛔ This folder does not describe Cuisko.
>
> It is a **frozen audit of a different repository** — referred to throughout as *Predecessor*,
> audited 2026-08-04 at a fixed commit — and the reasoning that produced Cuisko's architecture.
> It is history.
>
> - **Never** treat anything here as a description of this codebase.
> - **Never** update it to match Cuisko. It is a record of a moment; editing it destroys its value.
> - For how Cuisko actually works: [../ARCHITECTURE.md](../ARCHITECTURE.md).
> - For the rules: [../CONVENTIONS.md](../CONVENTIONS.md) and [../adr/](../adr/).
>
> Kept because every rule in `docs/` cites evidence from here. An ADR that says "this prevents F3"
> is checkable only while F3 is readable. Delete this folder and the rules become assertions.

---

## 🔒 Redactions

This audit documents **unfixed vulnerabilities in a real, deployed application**. It was written for
a private setup session, not for a repository. Before it landed here, the directly actionable parts
were removed:

| Removed | Was in | Why |
| --- | --- | --- |
| The test account's email and password | F4 | Live credentials the `Password` provider accepted. |
| The public webhook route paths | 01 §3.7 | Paired with "verifies nothing" in the same table — a target list. |
| The product name and identity | everywhere | The audit is about architecture, not about which app. |

**What is deliberately kept:** internal file paths, export names, table names and the mechanism of
each flaw. Those are what make the rules in `docs/` checkable, and none of them is exploitable
without the deployment URL and the product identity — both now absent.

**Residual risk, stated plainly.** Anonymisation here is *reduction, not elimination*: someone who
already knows which project this describes will still recognise it. More importantly, **redacting a
write-up fixes nothing.** If the endpoints in F1–F4 have not been patched in the source repository,
they remain exploitable whether or not they are documented. Treat patching that repo as the real
remediation; this section is housekeeping.

---

## What became what

| Reference doc | Transformed into |
| --- | --- |
| 04-BLUEPRINT.md | [../ARCHITECTURE.md](../ARCHITECTURE.md), and the scaffolding itself |
| 05-CONVENTIONS.md | [../CONVENTIONS.md](../CONVENTIONS.md) — tags re-audited against the real repo |
| 06-AGENT-DOCS.md | the shape of [../adr/](../adr/), `AGENTS.md`, and the nested `AGENTS.md` files |
| 03-FLAWS.md | the `## Why` section of every ADR |
| 00 / 01 / 02 | background; not transformed |

The handoff (00) suggested keeping only 03 and 04 long-term. All eight are kept instead, because the
failure mode it warned about — a doc tree that rots against the code — **cannot occur here**: these
describe a different repository at a fixed commit, and nothing in `AGENTS.md` routes an agent into
this folder to learn how Cuisko works.

## The files

| # | File | What it is |
| --- | --- | --- |
| 00 | [00-HANDOFF.md](./00-HANDOFF.md) | The setup plan for this repo. Largely executed. |
| 01 | [01-EXTRACTION.md](./01-EXTRACTION.md) | Predecessor's architecture as actually implemented. |
| 02 | [02-DIVERGENCE.md](./02-DIVERGENCE.md) | Every point where its docs contradicted its code. **The reason `docs/` is built the way it is.** |
| 03 | [03-FLAWS.md](./03-FLAWS.md) | 22 defects with `file:line` evidence and fixes. Cited by every ADR. |
| 04 | [04-BLUEPRINT.md](./04-BLUEPRINT.md) | The target architecture Cuisko was built from. |
| 05 | [05-CONVENTIONS.md](./05-CONVENTIONS.md) | The original rulebook draft. |
| 06 | [06-AGENT-DOCS.md](./06-AGENT-DOCS.md) | How to structure docs an LLM agent will actually follow. Research-backed. |

*(00 references an `AGENTS.template.md`; it was never copied into this repo — `AGENTS.md` was
written directly.)*

---

## Why this audit exists — the executive summary

**The verdict.** Predecessor's architecture was structurally sound and ahead of the average Expo+Convex
app. What failed was not the design — it was **enforcement**. Every rule with a mechanical backstop
held perfectly. Every rule that relied on discipline eroded, and the documentation kept describing
the intent rather than the result.

### What worked, and why

| Pattern | Result | Why it held |
| --- | --- | --- |
| `ui/` isolated from Convex | **0 violations in 75 files** | The rule was *achievable*: `@ui/*` had everything a UI file needed. |
| `procedures.ts` auth wrappers | Auth centralised, not copy-pasted | One import gave you `ctx.user`. Cheaper to comply than to bypass. |
| `router/` ↔ `functions/` split | Real reuse across 3–5 procedure variants | Sharing a `handler` was obviously less work than duplicating it. |
| A separate edge-compatible folder | Client and server shared logic without duplication | Physically separate folder = unambiguous. |

### What failed, and why

| Rule | Compliance | Root cause |
| --- | --- | --- |
| "NEVER import from `_generated/server`" | **58 files violate it** | A correct rule dropped after a misdiagnosis — the constraint belonged to `_generated/api`, a different module. 41 of the 58 had no legal alternative. |
| Export names are `anon`/`authed`/`admin`/`server`/`_internal` | **~22% break it** (26 ad-hoc names) | An action cannot touch the DB, so one operation legitimately needs several registered functions. No sanctioned way to name them existed. |
| "Files are kebab-case" | 29/332 break it | The real, better convention (hooks camelCase, components kebab-case) was never written down. |
| "i18n via react-i18next" | **1 file of 332**, 7 keys | Nothing enforced it. |

**Three lessons, and they are the spine of Cuisko:**

1. **A rule is only as strong as the affordance behind it.** UI isolation succeeded because
   compliance was the path of least resistance. The `procedures.ts` rule failed because compliance
   was *impossible* for 41 of the 58 files that broke it.
2. **Scope a constraint precisely before generalising from it.** "Importing `_generated/api` from
   `procedures.ts` creates a cycle" and "`procedures.ts` cannot be the single import point" are very
   different claims, and only the first is true.
3. **Without a mechanical check, you get no signal when a rule stops holding.** The 58 violations
   accumulated silently over months.

### The defects that mattered most

1. **Two endpoints let any logged-in user read any other user's data.** Both named `admin`, both
   using `authQuery`. → C1, [ADR 0003](../adr/0003-ownership-via-procedure.md)
2. **Three webhooks accepted unauthenticated requests**, and two more verified only if a secret env
   var happened to be set. → [ADR 0004](../adr/0004-webhooks-must-verify.md)
3. **Every missing env var silently defaulted to `''`**, disabling the check that used it. →
   [ADR 0005](../adr/0005-env-validated-at-boot.md)
4. **A public mutation returned working credentials.**
5. **No typecheck script, no tests, no CI.** The meta-flaw: nothing mechanically prevented any of
   the above.

### The sentence never to write

`.github/copilot-instructions.md:20` instructed the agent:

> *"The documentation is the source of truth."* … *"Trust these instructions — only search codebase
> if information is incomplete or unclear."*

**The code is the source of truth.** Documentation is a curated index into it, and every rule it
asserts must carry the command that proves it still holds.

---

## Method

Everything in these documents was derived by reading the code, not the docs. Behavioural claims are
anchored to `file:line`; scale claims come from scripted counts re-run at the end. Claims about
third-party behaviour were checked against the installed source in `node_modules`.

Two findings were deliberately downgraded after verification: the `adminQuery` context bug was real
but **latent**, and the domain-shaped card components were noted as a design question rather than a
violation. Commerce was summarised rather than extracted, per scope.
