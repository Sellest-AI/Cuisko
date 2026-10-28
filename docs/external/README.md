# External

Everything true about this project that does **not** live in the repository.

Where things are hosted, which accounts own them, where the design source is, which data is safe to
touch. The code answers "how does this work"; nothing answers "where does this run and who owns it"
— and that gap is a question an agent has to stop and ask a human, every time.

---

## The rule

**Say where to look, not what is there.** Name the service and the path that reaches a thing
("Convex dashboard → prod → Settings → Deploy keys"), and stop there. An identifier that can be read
at that place, or in a file of the repo, is not copied: a deployment name, a project id, a team, a
key id, a bundle identifier. Two reasons. The repo should be reproducible: pointed at other
accounts and deployments through its env alone, with as few ties to this one's real world as
possible. And a copy has to change wherever the original does; the day one is missed, this folder
points at a deployment that no longer exists. Write one only when nothing else can tell the reader
which one is meant. Secrets never, in any form, including "shortened" or "example" ones; their *names* are
documented in `.env.example`, which is the pattern this folder follows.

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

**Application identity** — slug, scheme, bundle id and package live in `app.json`, and only there.

**Environment** — no values here by design.

- Client keys are `EXPO_PUBLIC_*`, validated by `env.ts`, listed in `.env.example`.
- Backend secrets are **not** read from any file. They are set on the deployment with
  `npx convex env set`, validated by `convex/env.ts`, and that file throws at boot if one is missing.

**Deployments** — Convex deployments, EAS channels and the CI secrets: [deployments.md](./deployments.md).

**Website** — cuisko.app is the `cuisko-web` repo (Next.js, a sibling of this one), on Vercel.
`cuisko.app` is the primary domain and `www` redirects to it; keep it that way, because the app's
links claim the apex and Apple and Android refuse a verification file behind a redirect. The site
serves those files from `public/.well-known/`: the Apple Team ID in them is read at
developer.apple.com → Membership, and the Android SHA-256 values at Play Console → Protected with
Play → Play app signing (app signing key and upload key). A new signing key means a new line there.

**Not yet recorded**, because it does not exist or has not been asked for yet — listed so the
absence reads as *not yet* rather than *forgotten*:

- Where the mockups [PRODUCT.md](../PRODUCT.md) is drawn from actually live
- Test accounts and any seeded data
- Support channel — where a user reaches a human
- AI provider accounts, once `convex/agent/` has its first file
