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

| Secret                   | Where it comes from                              |
| ------------------------ | ------------------------------------------------ |
| `CONVEX_DEPLOY_KEY_DEV`  | Convex dashboard → dev → Settings → Deploy keys  |
| `CONVEX_DEPLOY_KEY_PROD` | Convex dashboard → prod → Settings → Deploy keys |
| `EXPO_TOKEN`             | expo.dev → Account settings → Access tokens      |

Each Convex key carries `deployment:deploy` only: it can push functions, never read data or env.

## iOS signing

Everything an iOS build signs with is stored on EAS (`npx eas credentials --platform ios`):

- The distribution certificate and the App Store provisioning profile; the development profile is
  ad hoc, tied to the registered iPhone.
- An App Store Connect API key, assigned to the app for EAS Submit.

**CI builds with `--non-interactive`, so it cannot log in to Apple.** It signs with what EAS
already holds. That breaks in one case: a new **capability** in `app.json` (push notifications, App
Groups, iCloud…) needs the App ID changed at Apple and a new provisioning profile. Once per new
capability, after it is merged, run `npx eas build --profile production --platform ios` from a
terminal and answer **yes** to the Apple login; EAS updates the App ID and stores the new profile,
and CI builds work again from the next one. A native module that adds no capability needs none of
this.

## Not yet recorded

- Play Console account and its `eas submit` service account
- Whether a CI iOS build really needs no Apple login: unconfirmed until the first one runs
