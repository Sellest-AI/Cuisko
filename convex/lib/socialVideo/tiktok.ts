import { ConvexError } from "convex/values";

import { isRecord, type Json, parsedJsonOrNull } from "./json";
import type { SocialVideo, SocialVideoAdapter, SocialVideoPage, SocialVideoSource } from "./types";

/**
 * TikTok videos, read from the page a logged-out visitor is served. No login, no key.
 *
 * Ported from yt-dlp's extractor (2026.08.19): the same page, the same JSON. Unlike Instagram's,
 * TikTok's video files are refused (403) unless the request carries the cookies the page just set
 * and a `Referer`, measured on 2026-10-04 from home and from the Convex deployment. The model's
 * fetcher has neither, so this adapter hands them on as `videoHeaders`, and the tool downloads the
 * file itself (see `SocialVideo`).
 */

const HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);

/** `/@author/video/<numeric id>`, the link the web app and a desktop share produce. */
const VIDEO_PATH = /^\/@[\w.-]*\/video\/(\d+)\/?$/;

/** `/v/<numeric id>.html`, the older mobile link, which a short link may still redirect to. */
const LEGACY_PATH = /^\/v\/(\d+)\.html$/;

/** The short links the TikTok app's share sheet produces: `vm.` / `vt.tiktok.com/<code>/`... */
const SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);
const SHORT_PATH = /^\/([\w-]+)\/?$/;

/** ...and `tiktok.com/t/<code>/`. */
const T_PATH = /^\/t\/([\w-]+)\/?$/;

/** As Instagram's: the header set the page is served whole to, through `node:https`. */
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

const REHYDRATION = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/;

const _unavailable = (message: string) => new ConvexError({ code: "IMPORT_UNAVAILABLE" as const, message });

/**
 * The smallest H.264 file among the versions TikTok lists, or its default `playAddr`.
 *
 * H.264 because it is the codec every video model is sure to read; the H.265 variants are smaller
 * but untested with the model. The smallest because it is the one we download and inline: the
 * model needs to see the gestures and hear the quantities, not 1080p.
 */
const _videoUrlOf = (video: Json): string | undefined => {
  const versions = Array.isArray(video.bitrateInfo) ? (video.bitrateInfo as unknown[]) : [];

  const h264 = versions
    .filter(isRecord)
    .filter((version) => version.CodecType === "h264" && isRecord(version.PlayAddr))
    .map((version) => version.PlayAddr as Json)
    .filter((play) => Array.isArray(play.UrlList) && typeof play.UrlList[0] === "string")
    .sort((a, b) => Number(a.DataSize) - Number(b.DataSize));

  const smallest = h264[0]?.UrlList as string[] | undefined;
  if (smallest?.[0]) return smallest[0];

  return typeof video.playAddr === "string" && video.playAddr ? video.playAddr : undefined;
};

/**
 * The video out of the page, or why not.
 *
 * - no rehydration data, or no video-detail in it → `IMPORT_UNAVAILABLE`: TikTok changed its page.
 * - a `statusCode` other than 0 (10204 "item doesn't exist", private, removed) → `NOT_FOUND`.
 * - a photo carousel (`imagePost`), or no video file at all → `NOT_A_VIDEO`.
 *
 * The page's cookies become the video's headers: without them its CDN answers 403.
 */
export const parseTiktokPost = ({ html, cookies }: SocialVideoPage, source: SocialVideoSource): SocialVideo => {
  const script = REHYDRATION.exec(html)?.[1];
  const data = script ? parsedJsonOrNull(script) : null;

  const scope = isRecord(data) ? data.__DEFAULT_SCOPE__ : undefined;
  const detail = isRecord(scope) ? scope["webapp.video-detail"] : undefined;
  if (!isRecord(detail)) throw _unavailable("TikTok did not send the video");

  const item = isRecord(detail.itemInfo) ? detail.itemInfo.itemStruct : undefined;
  if (detail.statusCode !== 0 || !isRecord(item)) {
    throw new ConvexError({ code: "NOT_FOUND" as const, message: "This video is private, removed or never existed" });
  }

  const videoUrl = !item.imagePost && isRecord(item.video) ? _videoUrlOf(item.video) : undefined;
  if (!videoUrl) throw new ConvexError({ code: "NOT_A_VIDEO" as const, message: "This post has no video" });

  return {
    ...source,
    caption: typeof item.desc === "string" ? item.desc : "",
    videoUrl,
    videoHeaders: {
      "User-Agent": HEADERS["User-Agent"],
      Referer: "https://www.tiktok.com/",
      Cookie: cookies.join("; "),
    },
  };
};

export const tiktok: SocialVideoAdapter = {
  platform: "tiktok",

  /**
   * Canonical as `https://www.tiktok.com/@/video/<id>`: the id alone, with no handle and no query.
   *
   * TikTok ignores the handle: `@iramsfoodstory/video/<id>`, `@anything/video/<id>` and
   * `@/video/<id>` serve the same video (measured on 2026-10-04), and `@/video/<id>` is where its own
   * `/v/<id>.html` redirects. Keeping the handle would make a renamed creator's video, shared again,
   * a second address and a second import. The query goes for the reason it goes everywhere: a web
   * share's `?is_from_webapp=1&sender_device=pc&web_id=…` and a bare link are one video.
   */
  sourceOf: (url) => {
    if (!HOSTS.has(url.hostname.toLowerCase())) return null;

    const id = (VIDEO_PATH.exec(url.pathname) ?? LEGACY_PATH.exec(url.pathname))?.[1];
    if (!id) return null;

    return { platform: "tiktok", id, canonicalUrl: `https://www.tiktok.com/@/video/${id}` };
  },

  pageOf: ({ id }) => ({ host: "www.tiktok.com", path: `/@/video/${id}`, headers: HEADERS }),

  /** A short link's code, requested without its query: the redirect is all we read from it. */
  shortLinkOf: (url) => {
    const host = url.hostname.toLowerCase();

    const code = SHORT_HOSTS.has(host) ? SHORT_PATH.exec(url.pathname)?.[1] : undefined;
    if (code) return { host, path: `/${code}/`, headers: HEADERS };

    const tCode = HOSTS.has(host) ? T_PATH.exec(url.pathname)?.[1] : undefined;
    if (tCode) return { host: "www.tiktok.com", path: `/t/${tCode}/`, headers: HEADERS };

    return null;
  },

  parse: parseTiktokPost,
};
