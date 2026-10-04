"use node";
import { ConvexError } from "convex/values";

import { httpsGet } from "./httpsGet";
import { socialShortLinkOf, socialVideoSourceOf } from "./sources";
import type { SocialVideoSource } from "./types";

/** A short link redirects once, sometimes twice (`vm.tiktok.com` → `/v/<id>.html` → the video). */
const MAX_HOPS = 3;

/**
 * The video a short link names, found by following its redirects.
 *
 * Only redirects to another short link are followed, and only while `MAX_HOPS` allows: each hop's
 * host is an adapter's constant, so a link can never walk us to a host the caller chose (the same
 * no-SSRF reasoning as `httpsGet.ts`). The first address an adapter claims as a video is the answer.
 *
 * - a redirect anywhere else (TikTok sends an unknown code to its home page), or to an address that
 *   does not parse → `NOT_FOUND`.
 * - a 5xx → `EXTERNAL_SERVICE_ERROR`: worth a retry later.
 * - any other answer that is not a redirect → `NOT_FOUND`.
 */
export const resolveShortLink = async (text: string): Promise<SocialVideoSource> => {
  let request = socialShortLinkOf(text);

  for (let hop = 0; request && hop < MAX_HOPS; hop++) {
    const { status, location } = await httpsGet(request.host, request.path, request.headers);

    if (status >= 500) {
      throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR" as const, message: `${request.host} answered ${status}` });
    }
    const base = `https://${request.host}`;
    if (status < 300 || status >= 400 || !location || !URL.canParse(location, base)) break;

    const target = new URL(location, base).href;
    const source = socialVideoSourceOf(target);
    if (source) return source;

    request = socialShortLinkOf(target);
  }

  throw new ConvexError({ code: "NOT_FOUND" as const, message: "This link leads to no video" });
};
