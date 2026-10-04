import { httpUrlOf } from "@shared/urls";
import { ConvexError } from "convex/values";

import { instagram } from "./instagram";
import { tiktok } from "./tiktok";
import type { SocialVideoAdapter, SocialVideoRequest, SocialVideoSource } from "./types";

/** Every platform we import videos from. A new one is an adapter file and a line here. */
export const SOCIAL_VIDEO_ADAPTERS: readonly SocialVideoAdapter[] = [instagram, tiktok];

export const adapterFor = (source: SocialVideoSource): SocialVideoAdapter => {
  const adapter = SOCIAL_VIDEO_ADAPTERS.find(({ platform }) => platform === source.platform);
  if (!adapter) {
    throw new ConvexError({ code: "INTERNAL" as const, message: `No adapter registered for ${source.platform}` });
  }
  return adapter;
};

/** The shared text as a URL, asked of each adapter in turn: the first one to claim it answers. */
const _firstClaim = <Claim>(text: string, claim: (adapter: SocialVideoAdapter, url: URL) => Claim | null): Claim | null => {
  const href = httpUrlOf(text);
  if (!href) return null;

  const url = new URL(href);
  for (const adapter of SOCIAL_VIDEO_ADAPTERS) {
    const claimed = claim(adapter, url);
    if (claimed) return claimed;
  }
  return null;
};

/**
 * What the cook shared, as a video one of our platforms claims, or `null`.
 *
 * Pure and runtime-free, so the router can refuse a link before it spends a fetch, a rate-limit
 * token or a model call on it. `httpUrlOf` first: share sheets hand over text with a trailing
 * period, or a host with no scheme.
 */
export const socialVideoSourceOf = (text: string): SocialVideoSource | null =>
  _firstClaim(text, (adapter, url) => adapter.sourceOf(url));

/**
 * What the cook shared, as a short link one of our platforms makes (the TikTok app's
 * `vm.tiktok.com/…`), or `null`. Pure, like `socialVideoSourceOf`: it says which request would
 * name the video, and `resolveShortLink.ts` makes it.
 */
export const socialShortLinkOf = (text: string): SocialVideoRequest | null =>
  _firstClaim(text, (adapter, url) => adapter.shortLinkOf?.(url) ?? null);

/**
 * Whether the text names a video one of our platforms hosts, as a full link or a short one.
 *
 * Such an address is the key `importVideo` answers every cook's share with, so only the video
 * import may write it: `createOne` drops it rather than let a typed recipe claim a video.
 */
export const isSocialVideoLink = (text: string): boolean =>
  socialVideoSourceOf(text) !== null || socialShortLinkOf(text) !== null;
