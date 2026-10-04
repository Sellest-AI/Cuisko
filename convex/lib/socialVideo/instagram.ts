import { ConvexError } from "convex/values";

import { isRecord, type Json, parsedJsonOrNull } from "./json";
import type { SocialVideo, SocialVideoAdapter, SocialVideoSource } from "./types";

/**
 * Instagram posts, read from the page a logged-out visitor is served. No login, no cookie, no key.
 *
 * Ported from yt-dlp's extractor (2026.08.19), the reference to diff against when this breaks: it
 * fetches the same page with the same headers and reads the same object. Instagram changes this
 * markup without notice, which is what `IMPORT_UNAVAILABLE` is for.
 */

const HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);

/**
 * A shortcode under every path a share sheet produces: `/p/x`, `/reel/x`, `/reels/x`, `/tv/x`, and
 * the same four behind the author's name (`/nicomerco/reel/x`). Stories and profiles have none.
 */
const POST_PATH = /^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)\/?$/;

/**
 * What yt-dlp sends, header for header. The page is served whole to these through `node:https`,
 * and only through it: see `httpsGet.ts`. `Accept-Encoding` is limited to what `httpsGet` decodes.
 */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/148.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-us,en;q=0.5",
  "Sec-Fetch-Mode": "navigate",
  "Accept-Encoding": "gzip, deflate",
  Connection: "close",
};

/** `media_type` 2 is a video. 1 is a photo and 8 a carousel. */
const VIDEO_MEDIA_TYPE = 2;

const JSON_SCRIPT = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;

/** The first `xig_polaris_media` in the tree whose `code` is this post's, depth first. */
const _polarisMediaIn = (node: unknown, id: string): Json | undefined => {
  if (!isRecord(node)) return undefined;

  const media = node.xig_polaris_media;
  if (isRecord(media) && media.code === id) return media;

  for (const child of Object.values(node)) {
    const found = _polarisMediaIn(child, id);
    if (found) return found;
  }
  return undefined;
};

const _unavailable = (message: string) => new ConvexError({ code: "IMPORT_UNAVAILABLE" as const, message });

/**
 * The post out of the page, or why not.
 *
 * **It reads `xig_polaris_media` whose `code` is the shortcode, and nothing else.** The page also
 * lists the author's other posts, each with its own `caption`, and this same post appears among them
 * as a short entry with a caption but no video. "The first `video_versions` on the page" happens to
 * be right today and imports the wrong reel the day the order changes.
 *
 * The caption is `caption.text` from that object, not the `<meta name="description">` tag. The tag
 * holds the same text behind "81K likes, 167 comments - author on August 21, 2026:", a prefix
 * written in whatever language the page was served in.
 *
 * Three ways to fail, and they mean different things to the cook:
 * - no post data at all → `IMPORT_UNAVAILABLE`: Instagram changed, every import fails until we adapt.
 * - the post is there but gated (private, age-restricted) → `NOT_FOUND`.
 * - the post is a photo or a carousel → `NOT_A_VIDEO`.
 *
 * @limitation A carousel whose slides include a video is refused as `NOT_A_VIDEO`. Its videos sit in
 * `carousel_media`, and which slide holds the recipe is a question this slice does not answer.
 */
export const parseInstagramPost = (html: string, source: SocialVideoSource): SocialVideo => {
  let media: Json | undefined;

  for (const [, script = ""] of html.matchAll(JSON_SCRIPT)) {
    if (!script.includes("xig_polaris_media")) continue;
    media = _polarisMediaIn(parsedJsonOrNull(script), source.id);
    if (media) break;
  }

  if (!media) throw _unavailable("Instagram did not send the post");

  const post = media.if_not_gated_logged_out;
  if (!isRecord(post)) {
    throw new ConvexError({ code: "NOT_FOUND" as const, message: "This post is private or restricted" });
  }

  const [version] = Array.isArray(post.video_versions) ? (post.video_versions as unknown[]) : [];
  const videoUrl = isRecord(version) && typeof version.url === "string" ? version.url : undefined;

  if (post.media_type !== VIDEO_MEDIA_TYPE || !videoUrl) {
    throw new ConvexError({ code: "NOT_A_VIDEO" as const, message: "This post has no video" });
  }

  const caption = isRecord(post.caption) && typeof post.caption.text === "string" ? post.caption.text : "";

  return { ...source, caption, videoUrl };
};

export const instagram: SocialVideoAdapter = {
  platform: "instagram",

  /** Canonical as `/p/<shortcode>/`, the path every post type answers on, video or not. */
  sourceOf: (url) => {
    if (!HOSTS.has(url.hostname.toLowerCase())) return null;

    const id = POST_PATH.exec(url.pathname)?.[1];
    if (!id) return null;

    return { platform: "instagram", id, canonicalUrl: `https://www.instagram.com/p/${id}/` };
  },

  pageOf: ({ id }) => ({ host: "www.instagram.com", path: `/p/${id}`, headers: HEADERS }),

  // No `videoHeaders`: Instagram's CDN serves the signed URL to anyone, the model's fetcher included.
  parse: ({ html }, source) => parseInstagramPost(html, source),
};
