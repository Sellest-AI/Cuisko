"use node";
import { ConvexError } from "convex/values";

import { httpsGet } from "./httpsGet";
import { adapterFor } from "./sources";
import type { SocialVideo, SocialVideoSource } from "./types";

/**
 * The post behind a source `socialVideoSourceOf` accepted: one request, then the adapter's parser.
 *
 * Status codes are judged here, the same way for every platform:
 * - a redirect is the platform walling logged-out visitors off (a login page), which fails every
 *   import alike → `IMPORT_UNAVAILABLE`.
 * - 404 → `NOT_FOUND`: the post was deleted, or never existed.
 * - anything else that is not 200 → `EXTERNAL_SERVICE_ERROR`: worth a retry later.
 */
export const fetchSocialVideo = async (source: SocialVideoSource): Promise<SocialVideo> => {
  const adapter = adapterFor(source);
  const { host, path, headers } = adapter.pageOf(source);

  const { status, body, cookies } = await httpsGet(host, path, headers);

  if (status >= 300 && status < 400) {
    throw new ConvexError({ code: "IMPORT_UNAVAILABLE" as const, message: `${source.platform} asked us to log in` });
  }
  if (status === 404) {
    throw new ConvexError({ code: "NOT_FOUND" as const, message: "This post does not exist" });
  }
  if (status !== 200) {
    throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR" as const, message: `${source.platform} answered ${status}` });
  }

  return adapter.parse({ html: body, cookies }, source);
};
