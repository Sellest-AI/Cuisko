# 00 — Handoff: Starting the New Project

> Read this first if you are picking up this folder in a new repository.
> It tells you what to copy, what decisions are needed, and how to run the setup session.

---

## Step 1 — Create the folder and copy the blueprint

```bash
# from anywhere in Git Bash
mkdir -p /c/Users/Franck/Documents/Developpement/<app-name>
cp -r /c/Users/Franck/Documents/Developpement/<predecessor-repo>/architecture \
      /c/Users/Franck/Documents/Developpement/<app-name>/.blueprint
cd /c/Users/Franck/Documents/Developpement/<app-name>
git init
```

That gives you:

```
<app-name>/
└── .blueprint/          ← source material for the setup session
    ├── 00-HANDOFF.md    this file
    ├── 01-EXTRACTION.md    reference — how the predecessor worked
    ├── 02-DIVERGENCE.md    reference — how its docs rotted
    ├── 03-FLAWS.md      ★ the defect list the new project must not repeat
    ├── 04-BLUEPRINT.md  ★★ THE SPEC — target architecture
    ├── 05-CONVENTIONS.md ★★ becomes docs/CONVENTIONS.md
    ├── 06-AGENT-DOCS.md ★ how to structure the doc layer
    └── AGENTS.template.md ★★ becomes AGENTS.md
```

**Keep `.blueprint/` for the setup session, then decide:** either delete it (the useful parts will
have been transformed into `AGENTS.md` + `docs/`), or keep `03-FLAWS.md` and `04-BLUEPRINT.md` as
`docs/_reference/`. Do **not** leave all seven files in the repo long-term — that recreates
`.readme/`.

---

## Step 2 — Decisions needed before scaffolding

Answer these in the kickoff prompt. They change the shape of the work, so guessing wastes a day.

**A. Identity**
1. Project / package name, and the display name for the app.
2. Bundle identifier (e.g. `com.franck.cookbook`) — needed for `app.json` and EAS.

**B. Reuse vs clean start** — the biggest decision
3. Predecessor has battle-tested code that is domain-agnostic: `expo/lib/image/` (compression, HEIC,
   base64, metadata), `expo/lib/s3/`, `expo/ui/` primitives (button, text, modal, sheet, skeleton),
   `expo/global/theme.ts`, the `providers/` tree, `utils/convex-allowed/`.
   **Copy any of it, or start clean?**
   *Recommendation:* copy `lib/image/`, `lib/s3/`, `global/theme.ts` and a handful of `ui/`
   primitives — they are genuinely reusable and re-writing them buys nothing. Start clean on
   everything else, since the layering changes.

**C. Scope of the first session**
4. Scaffolding only, or scaffolding **+ the recipes/ingredients vertical slice**?
   *Recommendation:* both. The slice is what proves the layering and becomes the template every
   later domain copies.

**D. Integrations from day one**
5. Auth providers — Apple / Google / Password? (Predecessor used all three.)
6. RevenueCat now, or later?
7. PostHog now, or later?
8. Image storage — S3 (as Predecessor) or Convex file storage?
   *Recommendation:* Convex storage unless you already know you need S3. Fewer moving parts.
9. i18n — English-only, or enforced bilingual from screen one? (See blueprint §5.7; recommendation
   is English-only.)

**E. Environment**
10. Do you want to run `npx convex dev` yourself during the session (it needs your login and creates
    a deployment), or should scaffolding stop short of that?

---

## Step 3 — Kickoff prompt

`cd` into the new folder, start Claude Code, and paste this — filling in the answers from Step 2:

```
I'm starting a new Expo + Convex project from an architecture blueprint.

Read .blueprint/04-BLUEPRINT.md and .blueprint/05-CONVENTIONS.md in full — they are the
spec. Skim .blueprint/03-FLAWS.md for the defects we are explicitly avoiding, and
.blueprint/06-AGENT-DOCS.md before you create any documentation.

DECISIONS
- Name / package: <...>          - Bundle id: <...>
- Reuse from predecessor: <yes: lib/image, lib/s3, theme, ui primitives | no, clean start>
  (source repo is at ../<predecessor-repo> — read from it, don't modify it)
- Scope: scaffolding + the recipes/ingredients vertical slice
- Auth: <apple/google/password>  - RevenueCat: <now|later>  - PostHog: <now|later>
- Storage: <convex|s3>           - i18n: <english-only|bilingual>
- I will run `npx convex dev` myself when you tell me to.

BUILD ORDER — follow blueprint Part 8, and do not skip step 1.
1. Scaffolding: tsconfigs + aliases, env.ts (Zod, throws at boot), procedures.ts
   (complete surface, no _generated/api import), eslint rules R1-R6, scripts C1-C2,
   package.json scripts, CI workflow. Verify `pnpm verify` runs green on an empty repo.
2. AGENTS.md from .blueprint/AGENTS.template.md + the nested convex/ and src/ui/ ones,
   docs/CONVENTIONS.md, and the 5 ADRs referenced by number in the Never table.
3. Auth: convex auth, usersExtended, the procedures.ts merge, AuthProvider,
   plus the authorization test suite harness.
4. UI foundations: theme + a few src/ui primitives.
5. Vertical slice: recipes + ingredients through all five layers.

RULES FOR THIS SESSION
- Stop after each numbered step and show me what you built before continuing.
- Anything you cannot verify, tell me — don't assume.
- Use sub-agents for parallel or research-heavy work, per AGENTS.md.
```

---

## Step 4 — What to expect

| Step | Output | Roughly |
|---|---|---|
| 1 | Config, `procedures.ts`, `env.ts`, lint rules, CI — `pnpm verify` green | the most important step; nothing after it is safe without it |
| 2 | `AGENTS.md`, nested files, `docs/CONVENTIONS.md`, 5 ADRs | the doc layer, sized per 06 |
| 3 | Working sign-in + the auth test harness | |
| 4 | `theme` + primitives | |
| 5 | recipes + ingredients, schema → screen | the template for every later domain |

**The discipline that matters:** step 1 is not skippable, and step 5 is *one* domain, not four.
Predecessor built breadth-first and got twenty dialects of the same architecture.

---

## What I will need from you during the session

- **Your Convex login** when it is time to create a deployment — I cannot do that for you.
- **A decision when two options are genuinely equivalent.** I will pick a default and say so rather
  than block, but flag it if you disagree.
- **Confirmation before anything outward-facing** — creating a deployment, installing packages that
  cost money, pushing a first commit.

## What I do not need

- Access to the Predecessor repo beyond reading it (`../<predecessor-repo>`) — I will not modify it.
- Any secrets. Env values go in `.env.local` / the Convex dashboard, by you, never through me.
