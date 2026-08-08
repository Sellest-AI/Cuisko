# External

Everything true about this project that does **not** live in the repository.

Where things are hosted, which accounts own them, where the design source is, which data is safe to
touch. The code answers "how does this work"; nothing answers "where does this run and who owns it"
— and that gap is a question an agent has to stop and ask a human, every time.

---

## The rule

**Names and locations, never values.** A deployment name, a dashboard URL, a bundle identifier, an
account owner — all fine. A key, a token, a password — never, in any form, including "shortened" or
"example" ones. Secrets are set on the deployment and their *names* are documented in `.env.example`,
which is the pattern this folder follows.

If a fact would let someone act without asking, it belongs here. If it would let someone act without
*authorisation*, it does not.

---

## How it grows

This folder is deliberately small and starts almost empty. **Add a fact the moment it becomes true**
— the first EAS build, the first AI provider, the first paying user's support channel — rather than
reconstructing eight services from memory later.

The trigger is concrete: **when an agent asks you where something lives, the answer goes here, not
only into the reply.** That is the same question being asked twice otherwise.

One file per surface once a surface earns one (`deployments.md`, `expo.md`, `accounts.md`). Until
then, facts live in this README. A folder of six files that each say "not yet" is the dead
documentation this project exists to avoid — see the note on drift in [adr/README.md](../adr/README.md).

---

## What is true today

**Application identity** — from `app.json`, repeated here because the rest of this file is about
things `app.json` cannot tell you.

| | |
| --- | --- |
| Expo slug | `cuisko` |
| Deep-link scheme | `cuisko://` |
| Bundle id / package | `com.cuisko.app` (iOS and Android) |
| Web output | static, Metro bundler |

**Environment** — no values here by design.

- Client keys are `EXPO_PUBLIC_*`, validated by `env.ts`, listed in `.env.example`.
- Backend secrets are **not** read from any file. They are set on the deployment with
  `npx convex env set`, validated by `convex/env.ts`, and that file throws at boot if one is missing.

**Not yet recorded**, because it does not exist or has not been asked for yet — listed so the
absence reads as *not yet* rather than *forgotten*:

- Convex deployment names and dashboard URLs (dev and prod)
- Where the mockups [PRODUCT.md](../PRODUCT.md) is drawn from actually live
- EAS account, build profiles, distribution channels
- Test accounts and any seeded data
- Support channel — where a user reaches a human
- AI provider accounts, once `convex/agent/` has its first file
