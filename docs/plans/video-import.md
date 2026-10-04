---
slice: video-import
branch: feat/recipes-video-import
status: active
---

> **Intent before implementation.** This file describes what we agreed to build, not what exists.
> If it disagrees with the code, **the code is right and this file should already be gone** —
> see [README.md](./README.md).

# Video import

A cook taps Share on an Instagram reel (TikTok next, or any recipe web page), picks Cuisko, and
lands on a complete recipe built from the video, its audio and its caption, translated and
illustrated like any created recipe.

Two halves: the backend (§1–§4, built) and the share target with its modal (§5, agreed 2026-10-04).

---

## 1. Problem

**What is missing.** Recipes now live in short videos as much as on blogs, and a video is not a
page: `importOne` reads JSON-LD and markup, and a reel has neither. Half the recipe is spoken or
shown, never written. In the test reel, the caption says 20 minutes in the air fryer and the cook
says 18.

**How we would know it worked.**
- `importVideo.authed` on `instagram.com/p/DcTtz3Ftj9I/` returns a `recipeId` in about 60–90 s,
  with ingredients linked. Translations and images arrive afterwards, as on `createOne`.
- The same link a second time returns the same `recipeId` at once, with no model call.
- A page without the embedded post data comes back as `IMPORT_UNAVAILABLE` (the screen says the
  platform changed something), not as a stack trace.

**Product fit.** "Writing a recipe is not a form" (PRODUCT.md): a third way in, after pasting text
and importing a page. The source is kept (`sourceUrl`). It creates rather than drafts, which is
the agreed choice for a share sheet. The row is `status: "generated"`, the same as one from
`createOne`, so the cook can still correct it.

---

## 2. Architecture

**Tables.** No new table: the cook waits on the call itself, so no status row is needed. One new
index on `recipes`: `by_is_archived_and_source_url`, which answers "does any cook have a live
recipe from this video" (`findBySource`, slice 4d). The existing `by_user_and_source_url` has no
`isArchived`, so reading it would break ADR 0017 or hand back a recipe the cook deleted.

**Operations**

```
router/recipes/importVideo.ts      authed            authActionI18n + withRateLimit("recipeVideoImport")
                                                     → Id<"recipes">
router/recipes/importVideoNode.ts  _internal         "use node": url + locale + userId → { recipe, links }
```

**Flow:** one call; the cook waits about 60 s behind a progress bar.

```
app ──authed(url)──▶ importVideo.authed                               (Convex runtime)
                      ├─ socialVideoSourceOf(url) → { platform, canonicalUrl } | INVALID_INPUT
                      │                                                (before any fetch, free)
                      ├─ runQuery: does the caller own a recipe with this canonicalUrl? → return its id
                      ├─ runAction importVideoNode._internal                (Node runtime, ~60–90 s)
                      │     ├─ fetchSocialVideo(canonicalUrl)  → { caption, videoUrl }   (~1 s)
                      │     └─ generateRecipeFromVideo(ctx, { locale, caption, videoUrl })
                      │           ├─ extractVideoRecipe tool: caption + the CDN URL as a video_url
                      │           │     part → MiMo (Xiaomi) fetches the reel itself → SanitizedRecipe
                      │           └─ resolveRecipeIngredients                (unchanged)
                      └─ createGeneratedRecipe(ctx, { …, sourceUrl: canonicalUrl })   (extracted from createOne)
                            ├─ runMutation createOne._internal_persist
                            ├─ schedule translateOne._internal
                            └─ schedule generateImages._internal
                      → recipeId
```

The rules this flow obeys, all checked in the 2026-10-04 spike:

- **The video never enters Convex.** The model is handed the signed CDN URL and fetches the reel
  itself. Only the URL and the caption move between functions. (Revised 2026-10-04: the first build
  downloaded the video and sent it inline as base64 to Muse Spark, and crashed at Node's 512 MB.)
- **Instagram is read with `node:https`, never `fetch`.** Instagram serves `fetch` an empty shell
  from both home and AWS, and serves `node:https` the full post with the same headers.
- **The URL stays a URL only because `models.videoRecipes` says so.** The OpenRouter provider does
  not declare video URLs, and the AI SDK downloads any URL its provider does not declare. The
  `video/*` override in `wrapLanguageModel` is what keeps the request at 34 KB instead of 17 MB.
- **If a future model refuses the URL**, the inline-bytes fallback and its three traps are written
  in `extractVideoRecipe`'s JSDoc. The download code was never committed, so that note is the record.

**Cascade.** None: no new table, no new foreign key.

---

## 3. Program design

**Platform-neutral at every name.** The platform appears once, in its adapter file. TikTok is
then one new adapter plus one line in the registry, and nothing above `lib/socialVideo/` changes.

**Files created or changed:**

```
convex/lib/socialVideo/types.ts             SocialVideoAdapter · SocialVideo                       pure
convex/lib/socialVideo/instagram.ts         the Instagram adapter: sourceOf, pageOf, parse          pure
convex/lib/socialVideo/tiktok.ts            the TikTok adapter, with videoHeaders                   pure
convex/lib/socialVideo/json.ts              isRecord · parsedJsonOrNull, shared by the adapters     pure
convex/lib/socialVideo/sources.ts           the registry: socialVideoSourceOf(text) · adapterFor    pure
convex/lib/socialVideo/httpsGet.ts          one GET through node:https                              "use node"
convex/lib/socialVideo/fetchSocialVideo.ts  request + status judgement + adapter.parse              "use node"
convex/lib/socialVideo/__tests__/instagram.test.ts   + fixtures/instagram-post.json (trimmed real page)
convex/lib/socialVideo/__tests__/sources.test.ts
convex/agent/config/models.ts               + videoRecipes: xiaomi/mimo-v2.6-pro, Xiaomi only, video/* URLs declared
convex/agent/agents.ts                      + videoRecipesAgent
convex/agent/config/prompts/extractVideoRecipe.ts
convex/agent/tools/extractVideoRecipe.ts    reuses modelRecipeSchema + toSanitizedRecipe
convex/agent/tools/__tests__/extractVideoRecipe.manual.test.ts
convex/functions/recipes/generateRecipeFromVideo.ts
convex/functions/recipes/createGeneratedRecipe.ts      extracted from createOne
convex/functions/recipes/findBySource.ts               the dedupe read, on the new index
convex/schema/recipes.ts                    + by_is_archived_and_source_url
convex/functions/rateLimits/enforceRateLimit.ts        RateLimitCtx exported (importVideo's ctx type)
shared/errors.ts                            + IMPORT_UNAVAILABLE · NOT_A_VIDEO
convex/router/recipes/createOne.ts          handler calls createGeneratedRecipe
convex/router/recipes/importVideo.ts
convex/router/recipes/importVideoNode.ts
convex/router/recipes/__tests__/importVideo.test.ts
convex/lib/rateLimits.ts                    + recipeVideoImport: 5 a day
```

**Signatures**

```ts
// lib/socialVideo/types.ts — an adapter is pure; the request lives in the one "use node" file,
// because importVideo.authed (default runtime) must call socialVideoSourceOf.
type SocialPlatform = "instagram";                         // "tiktok" joins here
type SocialVideoSource = { platform: SocialPlatform; id: string; canonicalUrl: string };
type SocialVideo = SocialVideoSource & { caption: string; videoUrl: string };
type SocialVideoAdapter = {
  platform: SocialPlatform;
  sourceOf(url: URL): SocialVideoSource | null;
  pageOf(source): { host; path; headers };
  parse(html: string, source): SocialVideo;
};

// lib/socialVideo/sources.ts — pure, any runtime
socialVideoSourceOf(text: string): SocialVideoSource | null
// lib/socialVideo/fetchSocialVideo.ts — "use node"
fetchSocialVideo(source: SocialVideoSource): Promise<SocialVideo>
//   EXTERNAL_SERVICE_ERROR timeout, non-200
//   IMPORT_UNAVAILABLE     a login redirect, or no post data for this video → "the platform changed"
//   NOT_FOUND              404, or the post is gated (private, age-restricted)
//   NOT_A_VIDEO            a photo, or a carousel (even one holding a video: @limitation)

// agent/tools/extractVideoRecipe.ts
extractVideoRecipe.run(ctx, { locale: Locale; caption: string; videoUrl: string }): Promise<SanitizedRecipe>

// functions/recipes/generateRecipeFromVideo.ts
generateRecipeFromVideo(ctx, { locale, caption, videoUrl }): Promise<{ recipe: SanitizedRecipe; links: RecipeLink[] }>

// functions/recipes/createGeneratedRecipe.ts
createGeneratedRecipe(ctx, { userId?, locale, recipe, links, sourceUrl? }): Promise<Id<"recipes">>

// router/recipes/importVideo.ts — what the screen calls
authed({ url }) → Id<"recipes">
```

**The Instagram adapter must select the media whose `code` equals the shortcode.** The page also
carries other posts from the same account, each with its own `caption` and `video_versions`, so
"the first `video_versions` on the page" can silently import the wrong reel. It parses the
`<script type="application/json">` that holds `xig_polaris_media` rather than slicing strings. The
caption comes from that object's `caption.text`, not from the `<meta>` tag, whose
"81K likes, … on August 21, 2026:" prefix depends on the language. Its canonical URL is
`https://www.instagram.com/p/<shortcode>/`, so a `/p/`, a `/reel/` and a `/<user>/reel/` link
with `?igsh=` trackers all dedupe to one recipe.

**Tests**

```
sources.test.ts              a url no adapter claims → null / INVALID_INPUT before any network
instagram.test.ts            sourceOf on /p/, /reel/, /<user>/reel/, with ?igsh= → one canonical url ·
                             a profile or story url → null · the fixture parses to the right post
                             among several · emoji and accents decoded · no post data →
                             IMPORT_UNAVAILABLE · a photo post → NOT_A_VIDEO
importVideo.test.ts          anon rejected · rate limit enforced · existing sourceUrl returns its id
                             without the Node action · a bad url → INVALID_INPUT, nothing fetched
createOne.test.ts            unchanged and still green after the extraction (its proof)
extractVideoRecipe.manual.test.ts   paid; you run it, I never launch it
```

**Decisions I am least confident about**

- **The synchronous call.** The cook's request stays open about 60–90 s. Convex allows it (a Node
  action may run 10 min), and it removes a whole status table. If the app is backgrounded and the
  socket drops, the server work still finishes and the recipe exists, and the dedupe means a retry
  returns it instead of paying twice. The screen should say that.
- **The rate limit is charged on attempts, not successes**, like `recipeImport`: a reel that fails
  mid-generation still uses one of the five. The alternative (refund on failure) is more code for a
  rare case.
- **MiMo as the video model** (switched from Muse Spark on 2026-10-04, after the 512 MB crash). It
  fetches the CDN URL itself, hears the audio, and returned a complete recipe in our schema at low
  effort; it is one provider deep (Xiaomi), so a Xiaomi outage is an import outage.

---

## 4. Slices

- [x] 1. `lib/socialVideo/` (registry + Instagram adapter) + fixture + tests → `fetchSocialVideo` works from a test
- [x] 2. `extractVideoRecipe` tool + model + prompt + manual test → you run it on the reel
      (2026-10-04 on Muse Spark: 49 s, $0.059, "air fry 18 min at 180°C" taken from the video over the caption's 20.
      Then switched to MiMo with the URL: $0.008, schema accepted at low effort, the request 34 KB instead of 17 MB)
- [x] 3. `createGeneratedRecipe` extracted, `createOne` on it, its tests unchanged and green
- [x] 4. `importVideo` + `importVideoNode` + rate limit + rejection tests → callable end to end from the dashboard
- [x] 4b. TikTok adapter (`lib/socialVideo/tiktok.ts`) + fixture + tests. Its CDN answers 403 without the page's
      cookies and a Referer (measured from home and from Convex), so the post carries `videoHeaders` and the tool
      downloads the smallest H.264 version and sends it inline as a base64 string (MiMo: 42 s, $0.009 for 10.4 MB).
      Short links (`vm.tiktok.com`, `tiktok.com/t/`) are not claimed yet: `@limitation` in the adapter.
- [x] 4c. TikTok short links: `shortLinkOf` on the adapter, `resolveShortLink` (Node, follows redirects between
      short-link hosts only, 3 hops), `importVideoNode._internal_resolve` called by `importVideo` before the dedupe.
      Saved address is now `https://www.tiktok.com/@/video/<id>`: TikTok ignores the handle (measured), so the id
      alone decides a duplicate (user's choice, 2026-10-04). Still to confirm against a real short link.
- [x] 4d. Dedupe across cooks: `findBySource` on `by_is_archived_and_source_url` (replaces `by_user_and_is_archived_and_source_url`;
      `by_user_and_source_url` stays, `findCatalogBySource` reads it);
      `importVideo` returns `{ recipeId, isOwned }` (never the owner's id, as `getOne`); the app favorites a
      recipe that is not the cook's before opening it. `httpUrlOf` reads the first address out of share text.
      Short links are held to `videoLinkResolve` (token bucket, 10 burst, 60/hour) before they are resolved.
- [x] 4e. A video that teaches no dish is refused: `videoRecipeSchema` asks `teachesRecipe` first, `toVideoRecipe`
      throws `NOT_A_RECIPE` unless it is `true`, so no row is written (and none served by the global dedupe).
      `createOne` drops a `sourceUrl` naming a social video, so only `importVideo` writes that key.

---

## 5. Frontend: the share target and the import modal

**What the cook sees.** Share → Cuisko. The app opens on a sheet ("Importing recipe"): an
Instagram, a TikTok and a globe tile orbiting a share glyph, "This can take up to 3 minutes. You can
safely close the app and come back later.", and Close. No progress bar.
- **Video link** (`importVideo`): if it succeeds while the sheet is open, the sheet is replaced by the
  saved recipe. Closed earlier, nothing navigates; the server finishes, and the recipe is in the list.
- **Web page** (`importOne`, unchanged): the same sheet, then the editor prefilled with the draft,
  as the paste-a-link screen does today.
- **Failure**: the orbit stops where it is, each tile leaves with an anticipation (it swells, then
  collapses to nothing as it fades), the share glyph in the middle turns into an X, and the title
  and text say what happened. Close stays.

**The animation**, measured from the reference video (frames at 30 fps):

```
0 ms        sheet slides up (native formSheet); outer disc fades in with it
0–170       top tile scales 0 → 1
130–230     inner disc fades in
170–270     bottom-right tile pops in (scale 0 → 1, slight overshoot)
230–330     share glyph and left tile pop in
then        the three tiles orbit clockwise, ~12°/s (a turn every 30 s), until the import ends

on failure  the orbit freezes at its current angle
0–120       each tile swells to scale 1.15 (the anticipation)
120–300     each tile collapses to scale 0 while its opacity goes to 0, staggered ~60 ms apart
0–300       the share glyph crossfades into an X (scale-out / scale-in at the centre)
```

**Files created or changed:**

```
package.json · app.json                     + expo-share-intent 8.0.1 and its config plugin   (new dev build)
src/ui/components/icons.logos.tsx           + InstagramTile · TikTokTile · WebTile  (SVG, beside Google/Apple)
src/ui/components/orbit.tsx                 <Orbit center satellites size />: the entrance + endless orbit
src/modules/recipes/_model/importFailure.ts failureOf(error) → { title, body } keys   extracted from import-screen
src/modules/recipes/_model/__tests__/importFailure.test.ts
src/modules/recipes/_hooks/useImportSharedLink.ts
src/modules/recipes/share-import-screen.tsx the sheet's content
src/modules/recipes/share-intent-listener.tsx   mounted in app/_layout: a share arrives → open the sheet
app/(modals)/share-import.tsx               route, param `url`
app/_layout.tsx · src/modules/auth/native-intent.ts   the share intent's link routed alongside OAuth's
translations/{en,fr}/…                      Import.sharing_* and the new failure sentences
```

**Signatures**

```ts
// Video or web page, decided in the hook by the host alone: a link whose host mentions instagram or
// tiktok goes to importVideo, anything else to importOne. The server's adapters remain the real
// judge (a TikTok link answers INVALID_INPUT until its adapter exists, and the sheet says so).

// src/ui/components/orbit.tsx: pure, no backend type
type OrbitProps = {
  center: ReactNode;          // the screen swaps share glyph → X; Orbit animates the swap
  satellites: ReactNode[];
  size: number;
  state: "orbiting" | "dismissed";   // dismissed: freeze, anticipate, collapse
};

// src/modules/recipes/_hooks/useImportSharedLink.ts
useImportSharedLink(url: string): { status: "importing" | "failed"; failure?: ImportFailure }
//   starts once on mount; video → importVideo.authed → router.replace(recipeRoute(id)) if still mounted
//   web page → useImportRecipe().importFrom(url) (its own navigation to the editor)
```

**Decisions I am least confident about**

- **Extracting `failureOf` from `import-screen.tsx`** into `_model/`, because the new sheet needs the
  same four sentences plus `NOT_A_VIDEO`, `IMPORT_UNAVAILABLE` and `NOT_FOUND`.
  The alternative is a second copy. `import-screen` changes nothing visible.
- **Closing does not cancel.** A Convex action runs to the end once called, so Close only stops the
  screen from listening. That is what the sheet's copy promises, and it is true.
- **Signed out when a share arrives**: the auth gate wins and the share is lost. Holding it across
  sign-in is a later slice (`@limitation`).

**Tests**

```
importFailure.test.ts        every code → its sentence · an unknown code → "unreachable" · rate limit
importPath.test.ts           instagram / tiktok hosts → video · any other host → web page
```

**Slices**

- [x] 5. The dedupe index restored (per cook at the time; now `findBySource` on `by_is_archived_and_source_url`, slice 4d, C15 green)
- [x] 6. `Orbit` + the three tiles in `src/ui`, with the measured entrance and orbit
- [x] 7. `importFailure` extracted + test; `useImportSharedLink`; `share-import-screen`; the route; copy
- [ ] 8. `expo-share-intent` + listener + native-intent routing → you rebuild the dev client and share a reel

---

## Landing

- [ ] `pnpm verify` green
- [ ] Reviewer subagent clean, or its findings approved
- [ ] The spike's rules (node:https, the video/* URL override, the inline-bytes fallback) in the JSDoc of the files that obey them
- [ ] **This file deleted** — the slice is not done while it exists
