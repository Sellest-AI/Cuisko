---
slice: offline-start
branch: feat/offline-start
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# Offline start

A cook who has opened Cuisko before sees Home on the first frame, with or without signal, and can
open the grocery list and Cuisko while the network is gone.

---

## 1. Problem

**What is broken or missing.** A cold start shows the splash for several seconds. `AuthGate` holds it
until auth settles *and* the cook's row arrives, and that is a chain of round trips: the stored JWT
confirmed over the socket (a refresh call first when it has expired), then `users.getMe`, then
`households.getMine`, then the household-scoped queries Home draws. The font is a bundled asset and
is not the wait. Offline, the chain never ends: the socket never connects, auth never settles, and
the splash never lifts.

**How we would know it worked.**
- A cold start online with a stored session draws Home from the device on the first settled frame,
  before any round trip lands: no splash wait beyond the token read from the keychain, and no cover
  or loading state between the device copy and the live one.
- A cold start in airplane mode, after one online session, shows Home, the grocery list (to buy and
  cellar), the quantity sheet and Cuisko with the last data seen — including on the morning after
  (the week strip's window moved, §3 loose args).
- Offline, opening any other route lands on the no-network page, pushed screens and sheets alike;
  its button lands on Home. A route already open when signal drops stays open.
- A session the server refuses still ends on `/auth`, and nothing of the last cook is left on disk.

**Product fit.** PRODUCT.md's roadmap row "The list works offline in the shop" — this is its read
half. The *Do the shopping* beat ("standing in a shop, one-handed") is the one with the worst signal.
Close to its anti-goal, "a list that silently diverges from the household's": a tick made offline is
held in memory by the Convex client and sent on reconnect, and lost silently if the app is killed
first. Accepted for this slice (Q6, the user's call): the cook can tick and add in the shop, and the
next slice makes those writes survive a kill.

**Out of scope.**
- **Writes made offline** persisted across a kill and replayed when signal returns: the next slice.
- Cuisko answering offline: it opens; a text question is a mutation and waits for signal (§4).
- Device-caching any query other than the ones listed in §3. Recipe detail, the catalog, planning,
  search suggestions stay live-only and are blocked offline.
- An offline marker anywhere but the grocery list's header (Q3 puts a chip there), and a "data from
  10:42" timestamp anywhere.

---

## 2. Architecture

**Tables** — none. **Operations** — none: no router change, no server change.

**Flow** — a cold start with a stored session:

```
keychain read (@convex-dev/auth)  ─▶ token present            = hasSession
        │
        ├─ device has getMe ─▶ AuthGate settles on hasSession, splash hides, Home draws from the
        │                      device (getMine → householdId → household queries: sync reads)
        │
        ├─ socket confirms ──▶ isAuthenticated: each device query subscribes; the device copy stays
        │                      served until its first live answer, which replaces it and is written
        ├─ refresh refused ──▶ token cleared → !hasSession → device cache wiped → /auth
        └─ no socket ────────▶ hasSession, never isAuthenticated: allowed routes draw,
                               the others get the offline page
```

**The gate decides on the session, not on Convex's confirmation.** Today `AuthGate` sends anyone
`!isAuthenticated` to `/auth`. With a stored token that Convex has not confirmed (offline, or the
first beats of an online start, or a refresh failing on a weak network mid-session) that would bounce
a signed-in cook. After this slice: `/auth` is for `!hasSession` only, settled as
`!hasSession && !isAuthenticating`; the onboarding redirect off `/auth` still requires
`isAuthenticated`.

**Cascade** — none.

**Existing data** — none on the server. On the device: the first launch after this ships has an empty
cache, so it waits like today, once. The key prefix is the JS bundle's identity, not `APP_VERSION`:
`Updates.runtimeVersion` + `Updates.updateId ?? "embedded"` (expo-updates is installed;
`runtimeVersion: fingerprint`). An OTA with new mapping code therefore never reads the previous
bundle's values. A server deploy that changes a query's shape for a published bundle already breaks
that bundle live; the project's old-client rule (template §2) covers it, not this cache. On the dev
deployment, shapes change under one bundle: a shape mismatch there is a dev-only stale read until the
next live answer replaces it.

**Cost and limits** — no paid call. Storage is bounded by construction: **one entry per (query,
strict args)**, loose args stored inside the entry rather than in the key (§3), so a moving window or
a growing id list overwrites its entry instead of adding one. At boot, every key whose prefix is not
the current bundle's is removed. The largest entry is the grocery list, tens of KB. One write per live
answer whose JSON differs from the stored one.

**New native dependency** — `react-native-mmkv` (with `react-native-nitro-modules`): synchronous
reads let each hook read its entry while it renders, with no boot step to load entries first (Q1,
answered). Native: needs a new dev build and a store build, not an OTA update. Web: MMKV v4
falls back to `localStorage` itself. Q1.

---

## 3. Program design

**Reuses**
- `useQueryCached` (`src/lib/convex/client.ts`) — `useQueryDevice` wraps it; it and `useQueryHeld`
  stay unchanged for every existing caller.
- `useAuthenticated` (moved from `src/lib/convex/auth.ts` to `session.ts`) — gains `hasSession`.
- `EmptyState` (`@ui/empty-state`) — the offline page, as the recipe catalog's empty list uses it
  (`icon`, `title`, `body`, `actions`).
- `useConvexConnectionState` from `convex/react` — `isWebSocketConnected`, `hasEverConnected`; no
  NetInfo dependency.
- `AuthGate` (`src/modules/auth/auth-gate.tsx`) — keeps owning the splash.

**Files created or changed:**

```
src/lib/convex/deviceCache.ts                   MMKV store, keys, prune at boot, clear
src/lib/convex/client.ts                        useQueryDevice (useQueryHeld shares its hold)
src/lib/convex/session.ts                       useAuthenticated, moved out of auth.ts, gains hasSession
src/lib/convex/auth.ts                          re-exports useAuthenticated; signOut wipes the cache
src/lib/convex/__tests__/deviceCache.test.ts
src/lib/convex/__tests__/client.test.tsx
src/modules/auth/_hooks/useAuth.ts              getMe on the device; exposes hasSession; isLoading below
src/modules/auth/auth-gate.tsx                  decides on hasSession; wipes the cache when settled signed out
src/modules/auth/__tests__/auth-gate.test.tsx   new cases only
src/modules/home/screen/header.tsx              avatar branches on hasSession; disabled while offline
src/modules/households/_hooks/useHousehold.ts   getMine on the device; isLoading below
src/modules/households/__tests__/…              useHousehold isLoading cases (existing folder)
src/modules/planning/_hooks/useWeeklyPlan.ts    device, loose ["from", "to"]
src/modules/planning/_hooks/useWeekIdeas.ts     device, strict
src/modules/recipes/_hooks/useFavoriteRecipes.ts device
src/modules/health/_hooks/useWeekSummary.ts     device
src/modules/groceries/_hooks/useSnapshot.ts     four queries device; ingredients.list device, loose ["ids"]
src/modules/network/_hooks/atoms.ts             isOfflineAtom, the one app-wide reading
src/modules/network/_hooks/useWatchConnection.ts the 2 s grace timer; writes the atom; OfflineGate alone calls it
src/modules/network/_hooks/useConnection.ts     reads the atom, plus the socket's isConnected / hasEverConnected
src/modules/network/_hooks/useIsOffline.ts      useConnection().isOffline
src/modules/network/offline-page.tsx            the no-network page; returns to `from` on reconnect
src/modules/network/offline-gate.tsx            resets the root stack to [index, offline] on a blocked route
src/modules/network/hooks.ts                    re-exports useIsOffline (new module: home, households read it)
src/modules/network/constants.ts                OFFLINE_ROUTES, OFFLINE_GRACE_MS
src/modules/network/__tests__/offline-gate.test.tsx
src/modules/network/__tests__/offline-page.test.tsx
app/offline.tsx                                 the route: renders OfflinePage
app/_layout.tsx                                 mounts <OfflineGate /> after <AuthGate />
src/ui/components/icons.tsx                     re-export WifiOff
src/modules/households/household-select.tsx     offline → Badge chip instead of the Select
translations/{fr,en}/network.json               new namespace, beside navigation.json: offline_title / _body / _home / _chip
```

**Signatures**

```ts
// src/lib/convex/deviceCache.ts
type DeviceEntry = { args: Record<string, unknown>; data: unknown };
/** `${bundleId}:${getFunctionName(query)}:${stableStringify(args minus loose)}` */
deviceKey(query, args, loose?: readonly string[]): string
readDevice(key: string): DeviceEntry | undefined   // sync; corrupt JSON logs, deletes, returns undefined
writeDevice(key: string, entry: DeviceEntry): void // skips the write when the JSON is unchanged
deleteDevice(key: string): void
pruneOtherBundles(): void                          // called once at module load
clearDeviceCache(): void

// src/lib/convex/client.ts — useQueryCached and useQueryHeld unchanged
type DeviceOptions = { loose?: readonly (keyof Q["_args"])[]; hold?: boolean };
useQueryDevice(query, args: Q["_args"] | "skip", options?: DeviceOptions):
  QueryStatus<Q> & { isStale: boolean; isFromDevice: boolean }
// A hook of its own rather than an option on useQueryCached (the user's call): no hook that runs
// different hooks depending on an argument, so no rules-of-hooks suppression.
```

`useQueryDevice`'s states, one row each:

| Live state | Device entry | Returned |
| --- | --- | --- |
| `args === "skip"` | — | pending, nothing read, nothing subscribed (unchanged meaning) |
| not authenticated (no subscription opened) | present | `success`, device data, `isFromDevice: true` |
| not authenticated | absent | `pending` |
| authenticated, first answer in flight | present | **still** `success`, device data, `isFromDevice: true` |
| authenticated, first answer in flight | absent | `pending` |
| live `success` | any | live data, `isFromDevice: false`; entry written (args + data) |
| live `error` | any | `error`, no data (as today); entry deleted |

`loose` names args left out of the key: the entry is served when the strict args match, whatever its
loose args were, and `isFromDevice` stays true until the live answer lands. Used for the week strip's
`from`/`to` (yesterday's window still holds today's and the coming days' meals) and the catalog's
`ids` (names for the rows already on screen). Never for `householdId`, `locale` or `weekKey`.

Callers gate their args on `hasSession` instead of `isAuthenticated` — *whether there is a subject*;
the lib decides *whether the server can be asked yet*.

```ts
// src/lib/convex/session.ts (re-exported by auth.ts)
useAuthenticated(): {
  isAuthenticated: boolean;   // unchanged: confirmed by Convex
  isAuthenticating: boolean;  // unchanged
  hasSession: boolean;        // NEW: a token is stored and no sign-in/out is in flight
  setAuthenticating(...): void;
}

// src/modules/auth/_hooks/useAuth.ts — adds hasSession to the return
isLoading = (isAuthenticating && !isSubmitting && !(hasSession && user)) || (isAuthenticated && isPending)
// isPending is false while the device copy is served (table above), so a confirmation never
// turns isLoading back on.

// src/modules/auth/auth-gate.tsx
destination = isLoading ? null
  : !hasSession && !isAuthenticating && !isOnAuth ? AUTH
  : isAuthenticated && isOnAuth ? ONBOARDING
  : null
// device cache cleared when !hasSession && !isAuthenticating

// src/modules/home/screen/header.tsx
isOffline ? <HouseholdSelect />            // offline: the chip in place of the avatar (Q5)
  : avatar, onPress = hasSession ? push("/account")   // signed in: the drawer
                                 : dismissTo("/auth") // no session at all: unchanged

// src/modules/households/_hooks/useHousehold.ts
isLoading = householdId === undefined && (isAuthenticating || (hasSession && isPending))

// src/modules/network/_hooks/useIsOffline.ts
useIsOffline(): boolean
// true once !isWebSocketConnected has lasted OFFLINE_GRACE_MS (2 s): a blip under that is nothing.
// On a cold start the 2 s run from mount, so `hasEverConnected === false` counts the same way.
// Measured once (useWatchConnection, in OfflineGate) into isOfflineAtom: a screen mounted while
// offline reads offline at once, rather than starting its own 2 s.
```

**Blocking a route offline: a redirect to `/offline`** (Q2). `OFFLINE_ROUTES` = `/`, `/groceries`,
`/assistant`, `/quantity`, `/auth`, `/offline`. `/quantity` is allowed because writes stay enabled
offline (Q6): it is the sheet the list adds and edits through.

`OfflineGate`, beside the root Stack, is the one place that decides. **It blocks arriving, never
staying:** a route already on screen when the connection drops stays up (a half-typed recipe in
`recipe/new`, the step the cook is on in `step-by-step`, a planning run). The gate acts when, while
`useIsOffline()`, the pathname *changes* to one not in `OFFLINE_ROUTES`, or when the route a cold
start opened on (a deep link) is one and the socket has never connected (`hasEverConnected` false)
by the time `useIsOffline()` turns true. A cold start is never "offline" before the 2 s grace: a
deep link opened online connects well within it and opens normally; the gate never sees it.

**Arriving means a route not already in the stack.** Going back to a route that stayed mounted is
staying: offline on `/groceries` over `[Home, /recipes]`, a back press to `/recipes` does not reset,
and closing a sheet opened from `recipe/new` or `step-by-step` returns to the editor or the cooking
screen untouched. The gate compares the focused route's `key` against the keys in the root
navigation state before the change; a key that was already there is staying.

It waits for `navigation.isReady()` and for `AuthGate` to have settled — read as
`!useAuth().isLoading && useAuth().hasSession` through `~/modules/auth/hooks`, the same values the gate
decides on, so no new export and no second copy of its condition
on a session, so it never races the reset to `/auth`. Then it resets the root navigator to
`[index, offline]` with the blocked route as a `from` param.

**`from` carries the query, not just the path.** `usePathname()` drops it (`/recipe/123`, not
`?servings=4`), so `from` is built from the route template and every param, dynamic and query alike:

```ts
type BlockedRoute = { pathname: string; params: Record<string, string | string[]> };
// pathname from useSegments() joined ("/recipe/[id]"), params from useGlobalSearchParams()
// ({ id: "123", servings: "4" }). Sent as JSON in the one string param `from`, since route params
// are strings; parsed back by OfflinePage, which replaces itself with router.replace(blockedRoute):
// expo-router fills [id] from params and writes the rest back as the query.
```

A `from` that fails to parse is treated as no `from` (Home). The reset itself:

```ts
navigation.reset({ index: 1, routes: [{ name: "index" }, { name: "offline", params: { from } }] })
```

A reset of the root stack, not a push: the presented routes (`(modals)/*` sheets, `account`,
`recipe/step-by-step/[id]`) are root-stack routes, so the reset closes them as well, and no view has to
draw over a natively presented screen. Back, or the page's "Back to home", lands on Home.

`app/offline.tsx` renders `OfflinePage` (module `network`): `EmptyState` with `WifiOff`, title, body,
one action "Back to home" → `router.dismissTo("/")`. When the connection returns while it is up, it
replaces itself with `from` (the route the cook asked for, params included); with no `from`, with Home.
A route of its own is what makes it trackable: `AnalyticsTracking` already sends a screen event per
pathname, so `/offline` shows up in PostHog with no extra code — **mid-session only.** On a cold start
offline the cook is never confirmed, `useSignedInUserId` stays deciding, and nothing is sent: the
dashboard undercounts offline starts. Registered in the root `Stack` as a plain card.

**The offline chip replaces the avatar** (Q5). `header.tsx` reads `useIsOffline()` from the network
module's `hooks.ts` and draws `HouseholdSelect` (the offline chip) in the avatar's place: the drawer
switches households and signs out, and neither can reach the server.

**The household selector becomes an offline chip** (Q3). `HouseholdSelect`
(`src/modules/households/household-select.tsx`, drawn in the grocery list's header) renders, while
`useIsOffline()`, a disabled neutral `Button` with `WifiOff` and `Network.offline_chip` in
place of the `Select`. **The offline branch comes first**, before the `!currentId` early return:
`useHouseholds` asks `getMine` only once `isAuthenticated` and is not device-cached, so offline it has
no household and the existing return would hide the chip. It says the list is the last one seen, and it takes the household switch away while the
switch cannot reach the server (as Q5 does for the drawer). Home has no selector, so no chip there.

**Writes stay enabled offline** (Q6). Nothing gates `useStockActions` or `useRemoveItem`: the Convex
client holds a mutation fired offline in memory and sends it on reconnect, and loses it if the app is
killed first. Persisting them is the next slice.

**Which queries go to the device** — what Home, the grocery list and Cuisko draw on open:

| Hook | Query | Loose |
| --- | --- | --- |
| `useAuth` | `users.getMe` | — |
| `useHousehold` | `households.getMine` | — |
| `useWeeklyPlan` | `planning.getMany` | `from`, `to` |
| `useWeekIdeas` | `planning.getWeekIdeas` | — |
| `useFavoriteRecipes` | `recipes.getFavorites` | — |
| `useWeekSummary` | the week-summary query | — |
| `useSnapshot` | `cellars.getGroceryList`, `getCellar`, `getRecentlyUsed`, `getPlatesOnList` | — |
| `useSnapshot` | `ingredients.list` (held) | `ids` |

Cuisko's screen issues no query on open.

**`useSignedInUserId` stays live-only, on purpose.** `AnalyticsTracking` and `RestartOnSignOut` read
it, and both must follow the session the server confirmed. Offline it stays `isDeciding`: no identify
and no screen event until signal, and no restart. Its JSDoc gets a line saying so, so nobody points it
at the device copy.

**UI props** — none new.

**Tests** — no MMKV mock: under jsdom MMKV resolves to its web build, which stores in jsdom's
`localStorage`; each test file that touches it clears it in `beforeEach`.

```
deviceCache.test.ts     key stable across arg order · key ignores loose args · key changes with the
                        bundle id · prune removes other bundles' keys only · write then read
                        round-trips · unchanged JSON not rewritten · corrupt JSON reads undefined
                        and is deleted · clear removes every key
client.test.tsx         one test per row of the device-option table · loose arg changed → entry
                        served, then overwritten (one key) · no option → behaviour unchanged
auth-gate.test.tsx      stored session + cached cook, Convex unconfirmed → splash hides, no redirect,
                        cache kept · stored session, no cached cook → waits as today ·
                        no session settled → /auth and cache cleared ·
                        Convex confirms after the device draw → no cover raised
useHousehold test       household from the device, Convex unconfirmed → isLoading false ·
                        no device entry, unconfirmed → isLoading true
offline-gate.test.tsx   already on /recipe/new when the socket drops → no reset ·
                        offline, navigates to /recipes → reset to [index, offline] with from=/recipes ·
                        navigator not ready / AuthGate unsettled → no reset until both ·
                        offline, back from a sheet to /recipe/new → no reset ·
                        offline, back from /groceries to /recipes (already mounted) → no reset ·
                        cold start on /recipe/x, socket connects at 1 s → no reset ·
                        cold start on /recipe/x, never connected at 2 s → reset, from=/recipe/x ·
                        offline, opens /meal (a sheet) → same reset · offline on /, /groceries,
                        /assistant, /quantity, /offline → no navigation · blip under the grace →
                        nothing · online → nothing
offline-page.test.tsx   "Back to home" → dismissTo("/") · connection returns with from =
                        /recipe/[id] {id:"123", servings:"4"} → replace({ pathname: "/recipe/[id]",
                        params: { id: "123", servings: "4" } }) · array param kept as an array ·
                        no `from`, or unparsable → replaced by Home
offline-gate.test.tsx   (also) blocked /recipe/123?servings=4 → `from` holds id and servings
households __tests__    HouseholdSelect offline, useHouseholds with no household → chip, no Select ·
                        online → Select
header test             offline → avatar disabled, press does not navigate (existing home tests, or
                        new in src/modules/home/__tests__)
```

**Decisions I am least confident about**
1. **Gating on `hasSession` in each hook — agreed with the user.** Each device-cached hook switches
   its skip condition from `isAuthenticated` to `hasSession`. `isAuthenticated` exists to keep an
   `authed` query from reaching the server before the token is confirmed, where it would be
   rejected; reading the device copy sends nothing, so a stored session is enough for it. The lib
   keeps the server-side guard: it opens the live subscription only once `isAuthenticated`. The
   rejected alternative, the lib ignoring the caller's `"skip"`, would make `"skip"` lie.
2. **`useAuth` reports the cook from the device.** The header and the gate read `user`; they read the
   device copy until the live one lands. Analytics and the restart do not (they read
   `useSignedInUserId`, live-only, above).
3. **No ADR.** The rule worth keeping ("a query on a screen allowed offline is device-cached") has no
   mechanical check. It goes in JSDoc on `useQueryCached` and `OFFLINE_ROUTES` instead.

---

## 4. What can go wrong

| Case | What happens | What the cook sees | Pinned by |
| --- | --- | --- | --- |
| Cold start offline, cache present | `hasSession`, never confirmed; device values served | Home with last data; other routes → offline page | `auth-gate.test.tsx`, `offline-gate.test.tsx` |
| Cold start online, cache present | device copy until each live answer, then live | Home at once, values update in place, no cover | `auth-gate.test.tsx`, `client.test.tsx` |
| Morning after, offline | week strip served from yesterday's entry (loose `from`/`to`) | Today's and coming meals; ideas miss if the week turned | `client.test.tsx` |
| Cold start offline, no cache (first launch after install or update) | nothing to serve; gate waits | Splash until signal, as today. Q4 | `auth-gate.test.tsx` |
| JWT expired, refresh fails on network | @convex-dev/auth keeps the tokens (it clears them only on a non-network error) → `hasSession` | Same as offline | device check, slice 6 |
| Refresh fails mid-session on a weak network | `hasSession` stays true → no redirect | The screen stays | `auth-gate.test.tsx` |
| Server refuses the refresh token (revoked, account deleted) | token cleared → `!hasSession` → cache wiped, reset to `/auth` | Sign-in screen, nothing of the last cook | `auth-gate.test.tsx` |
| Sign-out button | `signOut` wipes the cache before `RestartOnSignOut` reloads | Sign-in screen | `auth.test.ts` |
| A live query errors (household left, row gone) | `error` returned, entry deleted | What the screen shows on an error today | `client.test.tsx` |
| OTA update changes a query's mapping | bundle id in the key → miss; old keys pruned at boot | One cold start waits like today | `deviceCache.test.ts` |
| Corrupt or truncated stored JSON | read returns undefined, entry deleted, logged | Waits like a miss | `deviceCache.test.ts` |
| Signal drops while on a blocked route (editor, cooking, a recipe, a planning run) | nothing: the gate blocks arriving, not staying | The screen stays, draft and step kept; its own saves and loads wait for signal | `offline-gate.test.tsx` |
| Offline, the cook opens a blocked route (card or sheet) | after the grace, root stack reset to [Home, offline{from}] | Offline page; on reconnect, the route they asked for | `offline-gate.test.tsx`, `offline-page.test.tsx` |
| Cold start online onto a deep link | socket connects inside the 2 s grace; `useIsOffline` never turns true | The linked screen, as today | `offline-gate.test.tsx` |
| Cold start offline onto a blocked deep link | after 2 s, never connected → gate waits for the navigator and `AuthGate`, then resets with `from` = the link | Offline page; the linked screen when signal returns | `offline-gate.test.tsx` |
| Cold start on a slow network, socket connects after 2 s | same reset, then `/offline` replaces itself with `from` on connect | Offline page briefly, then the linked screen | `offline-page.test.tsx` |
| A share, cold or warm | `+native-intent.tsx` lands shares on `/` (allowed); `ShareIntentListener` pushes `/share-import` only once `isAuthenticated`, so the socket is up and the gate has nothing to block | Online: the import sheet, as today. Offline: Home, then the sheet when signal returns | device check |
| Socket blips under 2 s | nothing | nothing | `offline-gate.test.tsx` |
| Avatar tapped offline | disabled | Nothing happens | header test |
| Tick / add on the list offline | held in memory by the Convex client, sent on reconnect; lost if the app is killed first | The list as the mutation's optimistic update draws it, or unchanged until signal | next slice persists them |
| Cuisko asked offline | `sendMessage` is a mutation: held in memory, sent on reconnect. A photo goes through `uploadOne`, an action: it fails offline | Text: question shown, answer on signal. Photo: the existing upload error | device check |
| Household switched on another device while offline | cached `getMine` names the old one until live | Old kitchen until reconnect, then the switch (ADR 0016 resets atoms) | — |
| Two cooks on one phone | cache wiped at every session end | — | `auth-gate.test.tsx` |
| Recipe photos offline | `expo-image` disk cache serves the ones already seen | Seen photos; others blank | — |
| Web | localStorage; same flow; same reset | Same | `offline-gate.test.tsx` |

---

## 5. Slices

- [x] 1. `deviceCache.ts` + `react-native-mmkv` + its tests → entries readable, keyed, pruned, wiped
- [x] 2. `useQueryDevice` + `hasSession` (in `session.ts`) + `client.test.tsx` → nothing calls it yet
- [x] 3. `useAuth` + `AuthGate` + `useHousehold` → the splash lifts on a cached cook; the gate
      decides on the session
- [x] 4. Home's queries and `useSnapshot` on the device → Home and the list draw offline
- [x] 5. `useIsOffline` + `/offline` + `OfflineGate` + strings + icon + header avatar (`hasSession`,
      disabled offline) + offline chip → every blocked route redirects
- [ ] 6. Device check, dev build, iOS and Android: airplane-mode cold start; morning-after start;
      expired-JWT cold start offline; revoked session online; `quantity` offline works, `meal`
      offline redirects; signal cut while typing a recipe and while cooking (both stay); a share
      offline, warm and cold; sign-out then sign-in as another account. A dev build loads its JS
      from Metro, so a cold start "offline" breaks name lookup instead (Wi-Fi DNS set to 127.0.0.1):
      Convex is unreachable, Metro on the LAN IP is not; mid-session cuts use airplane mode

---

## Open questions

None left. Answered: Q1 `react-native-mmkv` · Q2 redirect to `/offline` (trackable as a screen) ·
Q3 an offline chip in place of the household selector · Q4 splash until signal · Q5 avatar disabled
offline · Q6 writes stay enabled.

---

## Review log

```
round 1   REVISE   13 findings: 12 fixed, 1 question (Q6)
round 2   REVISE   3 findings: 3 fixed
round 3   READY
user      Q2 → B (redirect), Q4 → A, Q5 → A (avatar disabled), Q6 → B (writes enabled)
round 4   REVISE   4 findings: 4 fixed (4.1 → the gate blocks arriving, never staying; this also
                   settles 4.5 as A). Loop stops at round 4 per README; the change goes to the user.
user      Q1 → MMKV, Q3 → offline chip in place of the household selector; network module;
          avatar disabled offline; hasSession gate agreed
round 5   REVISE   4 findings: 4 fixed (chip before the early return · arriving = not in the stack ·
                   stale text · AuthGate signal named). Requested as a last pass; not re-run.
```

---

## Landing

- [x] Plan review loop ended READY, and the user agreed the plan
- [ ] `pnpm verify` green
- [ ] `architecture-reviewer` clean, or its findings approved
- [ ] Decisions worth keeping promoted to an ADR or to [CONVENTIONS.md](../CONVENTIONS.md)
- [ ] **This file deleted** — the slice is not done while it exists
