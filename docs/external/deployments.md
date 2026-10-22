# Deployments

Where Cuisko runs, and what a merge to `dev` or `main` ships to. How the pipeline decides between an update
and a build is in [ARCHITECTURE.md § Releases](../ARCHITECTURE.md#releases); this page is only the
where, and only as far as where to look: see [the rule](./README.md#the-rule).

---

## Channels and deployments

| Git branch | EAS channel | EAS environment | Convex deployment | Who runs it                      |
| ---------- | ----------- | --------------- | ----------------- | -------------------------------- |
| (local)    | development | development     | dev               | dev-client builds, JS from Metro |
| `dev`      | preview     | preview         | dev               | internal APKs                    |
| `main`     | production  | production      | prod              | store builds                     |

- Both deployments are in Europe (Ireland). A new deployment defaults to the US, so create one
  with `--region eu`; the region is fixed at creation, and moving one means a new deployment and
  copying its env vars across.
- Each EAS environment (expo.dev → the project → Environment variables) sets
  `EXPO_PUBLIC_CONVEX_URL` to the deployment in its row.
- A merge into `dev` deploys Convex to dev, so it overwrites whatever a local `pnpm convex:dev` pushed
  from a branch, until that `convex:dev` pushes again.

## Secrets

GitHub Actions secrets, by name, read by `.github/workflows/deploy.yml`:

| Secret                   | Where it comes from                                                 |
| ------------------------ | ------------------------------------------------------------------- |
| `CONVEX_DEPLOY_KEY_DEV`  | Convex dashboard → dev → Settings → Deploy keys                     |
| `CONVEX_DEPLOY_KEY_PROD` | Convex dashboard → prod → Settings → Deploy keys                    |
| `EXPO_TOKEN`             | expo.dev → Account settings → Access tokens                         |
| `RELEASE_DEPLOY_KEY`     | private half of GitHub → Settings → Deploy keys → `release` (write) |

Each Convex key carries `deployment:deploy` only: it can push functions, never read data or env.

**Why a deploy key.** A store release commits the version bump and pushes it to `main`, and the
`protect-main` ruleset takes changes to `main` only through a pull request. The workflow's own token
cannot bypass it (GitHub Actions is not a bypass actor), so the release pushes through the deploy
key, and **Deploy keys** sit on the ruleset's bypass list. Deploy keys are off by default in the
Sellest-AI organization; they were enabled for this. Anyone holding the key can push to `main`, so
rotate it (new key, new secret, old key deleted) if it may have leaked. Generate it outside the
repository: the private half must never sit in the working tree, and `.gitignore` refuses
`cuisko-release*` as a guard.

## iOS signing

Everything an iOS build signs with is stored on EAS (`npx eas credentials --platform ios`):

- The distribution certificate, and an App Store provisioning profile per target: the app
  (`com.cuisko.app`), the share extension and the widget (`com.cuisko.app.ExpoWidgetsTarget`). The
  development profiles are ad hoc, tied to the registered iPhone. A new extension target needs its
  own profile, made the same way as a new capability below.
- An App Store Connect API key, assigned to the app for EAS Submit.

**CI builds with `--non-interactive`, so it cannot log in to Apple.** It signs with what EAS
already holds. That breaks in one case: a new **capability** in `app.json` (push notifications, App
Groups, iCloud…) needs the App ID changed at Apple and a new provisioning profile. Once per new
capability, after it is merged, run `npx eas build --profile production --platform ios` from a
terminal and answer **yes** to the Apple login; EAS updates the App ID and stores the new profile,
and CI builds work again from the next one. A native module that adds no capability needs none of
this.

## Store submission

Every production build is submitted when it finishes (`eas build --auto-submit`, profile
`submit.production` in `eas.json`). Neither store gets the build in front of users by itself:

- **iOS** uploads to App Store Connect with the API key above, and shows in TestFlight. Sending a
  version to review is done in App Store Connect.
- **Android** uploads to the `production` track as a **draft**. Rolling it out is done in Play
  Console. Google refuses an API upload until one AAB has been uploaded by hand in Play Console,
  and the upload goes through a Google service account whose JSON key is stored on EAS, never in the
  repository: `npx eas credentials --platform android` → production → Google Service Account →
  upload the key for submissions. The account is invited in Play Console (Users and permissions)
  with release rights on the app.

A failed submission leaves the build intact. It shows on the build's page at expo.dev and is retried
with `npx eas submit --platform <android|ios> --latest`.

## Not yet recorded

- Whether a CI iOS build really needs no Apple login: unconfirmed until the first one runs
