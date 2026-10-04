import { httpUrlOf } from "@shared/urls";

/**
 * Which import a shared link goes down: the video one (`importVideo`: watch the reel, create the
 * recipe) or the web one (`importOne`: scrape the page, hand the editor a draft).
 *
 * Decided by the host alone, and loosely on purpose: anything on an Instagram or TikTok host is a
 * video. The server's adapters are the real judge of what they can read, and a link they refuse
 * comes back `INVALID_INPUT` with a sentence that says so (an Instagram profile, a TikTok photo).
 * Text that is not a link at all goes the web way, whose own check refuses it before any request.
 */
export type ImportPath = "video" | "web";

const VIDEO_HOSTS = /(^|\.)(instagram|tiktok)\.com$/i;

export const importPathOf = (text: string): ImportPath => {
  const href = httpUrlOf(text);
  if (!href) return "web";

  return VIDEO_HOSTS.test(new URL(href).hostname) ? "video" : "web";
};

/**
 * The one spelling of a shared video link that tells "the same reel again" from "another reel":
 * its host without `www.` / `m.`, and its path, with the query and the fragment dropped.
 *
 * The query goes because a share sheet adds a fresh tracker every time (`?igsh=…` on each Instagram
 * share), so two shares of one reel would otherwise never match. The path keeps its case, because
 * Instagram shortcodes are case-sensitive: `DcTtz3Ftj9I` and `dcttz3ftj9i` are different posts.
 *
 * @limitation `/p/x` and `/reel/x` are one post under two keys here, and so are a TikTok's web link
 * and the `vm.tiktok.com/…` short link its app shares (only a server-side redirect ties those). Shared
 * once each while the first is still importing, both import; the server's own dedupe
 * (`findBySource`) answers every share after the first one finished. Matching the paths is the server adapter's knowledge, and
 * copying it here would make two places to fix when Instagram changes its links.
 */
export const importKeyOf = (text: string): string => {
  const href = httpUrlOf(text);
  if (!href) return text.trim();

  const url = new URL(href);
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const path = url.pathname.replace(/\/+$/, "");

  return `${host}${path}`;
};
