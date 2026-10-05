/**
 * The contract every video platform's adapter fills, so nothing above `lib/socialVideo/` ever names
 * a platform. Adding one is a new adapter file and one line in `sources.ts`'s registry.
 *
 * An adapter is pure: it says which page to read and how to read it, and `fetchSocialVideo.ts` does
 * the one request. That split is forced by the runtimes rather than chosen: the request needs
 * `node:https` (see `httpsGet.ts`), while `importVideo.authed` runs in the default runtime and must
 * still ask "is this a video link we can read?" before spending anything.
 */

export const SOCIAL_PLATFORMS = ["instagram", "tiktok"] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/**
 * A link a platform claims, in the one spelling we store as the recipe's `sourceUrl`.
 *
 * Canonical because the same video is shared under many addresses (`/p/`, `/reel/`, with the
 * sharer's tracking params), and a second share of the same video must find the recipe the first
 * one created. `id` is the platform's own id for the video, which the page request is built from.
 */
export type SocialVideoSource = { platform: SocialPlatform; id: string; canonicalUrl: string };

/**
 * What the model is handed: the creator's own words, and where the video is.
 *
 * `videoUrl` is a signed CDN address valid for a few days. How it can be fetched is the platform's
 * fact, carried by `videoHeaders`:
 * - **absent**: anyone may fetch it, so the model is handed the URL and downloads it itself
 *   (Instagram). The tool still downloads it too, for the transcript.
 * - **present**: the CDN refuses a request without these headers (TikTok wants the page's cookies and
 *   a `Referer`), which the model's fetcher cannot send. The tool downloads the video with them and
 *   sends it inline. They are the page's session, so they are passed on and never stored.
 */
export type SocialVideo = SocialVideoSource & {
  caption: string;
  videoUrl: string;
  videoHeaders?: Record<string, string>;
};

/** One GET an adapter asks for. Host and path are built from what the adapter parsed, never the caller's text. */
export type SocialVideoRequest = { host: string; path: string; headers: Record<string, string> };

/** The post page as the adapter receives it: its markup, and the cookies it set (`name=value`). */
export type SocialVideoPage = { html: string; cookies: string[] };

export type SocialVideoAdapter = {
  platform: SocialPlatform;
  /** The link as this platform's video, or `null` when it is not one. */
  sourceOf(url: URL): SocialVideoSource | null;
  /** The page that holds the post. Built from the source, never from the caller's text. */
  pageOf(source: SocialVideoSource): SocialVideoRequest;
  /**
   * The request that opens one of this platform's short links, or `null` when `url` is not one. A
   * short link names no video until its redirect is followed (`resolveShortLink.ts`), so it cannot
   * be a source yet. Absent on a platform whose shared links always name the video.
   */
  shortLinkOf?(url: URL): SocialVideoRequest | null;
  /** The post read out of that page, or a `ConvexError` naming why not. */
  parse(page: SocialVideoPage, source: SocialVideoSource): SocialVideo;
};
