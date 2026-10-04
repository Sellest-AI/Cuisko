"use node";
import { request } from "node:https";
import type { Readable } from "node:stream";
import { createGunzip, createInflate } from "node:zlib";
import { ConvexError } from "convex/values";

/**
 * GETs to a host an adapter names, through `node:https`, never `fetch`: the post page as text, and
 * a video as bytes.
 *
 * **`node:https` is the whole reason the file exists.** Instagram tells clients apart below the
 * headers: Node's `fetch` (undici) is served a ~627 KB shell with no post in it, and `node:https`
 * sending byte-identical headers is served the full post. Measured on 2026-10-04 from a home
 * connection and from the Convex deployment alike. Swapping this for `fetch` breaks every import
 * silently: the request succeeds, and the adapter finds nothing to read.
 *
 * The host is an adapter's constant (or the CDN its own page pointed at) and the path is built from
 * a parsed id, never from the caller's text, which is why there is no SSRF guard here (compare
 * `lib/scraping/fetchPage.ts`, whose host the caller chooses). Redirects are returned rather than
 * followed, for the same reason: where a platform sends us is for the caller to judge.
 */

/** A post page answers in about a second; ten is a platform having a bad day. */
const PAGE_TIMEOUT_MS = 10_000;

/** A post page is ~400–800 KB of markup. Four times that is not a post page. */
const PAGE_MAX_BYTES = 4 * 1024 * 1024;

/** Long enough for 50 MB on a slow CDN edge, short enough to leave the model its minutes. */
const VIDEO_TIMEOUT_MS = 60_000;

type _Raw = { status: number; location?: string; cookies: string[]; contentType: string; body: Buffer };

export type HttpsPage = { status: number; location?: string; cookies: string[]; body: string };

const _unreachable = (message: string) => new ConvexError({ code: "EXTERNAL_SERVICE_ERROR" as const, message });

/** The body decoded from whichever of the two encodings we offer the server chose. */
const _decoded = (response: Readable, encoding: string | undefined): Readable => {
  if (encoding === "gzip") return response.pipe(createGunzip());
  if (encoding === "deflate") return response.pipe(createInflate());
  return response;
};

/**
 * One GET, capped and timed out. `tooLarge` is what to throw past the cap, because the two callers
 * mean different things by it: a page that big is a broken page, a video that big is one we refuse.
 *
 * Once the cap fires, its error is the answer whichever stream reports first: destroying the request
 * also aborts the response, whose own error would otherwise blame the network for our refusal.
 */
const _get = (
  url: URL,
  headers: Record<string, string>,
  { timeoutMs, maxBytes, tooLarge }: { timeoutMs: number; maxBytes: number; tooLarge: () => Error },
): Promise<_Raw> =>
  new Promise((resolve, reject) => {
    let refused: Error | undefined;
    const refuse = () => {
      refused = tooLarge();
      req.destroy(refused);
    };

    const req = request(
      { host: url.host, path: url.pathname + url.search, method: "GET", headers, timeout: timeoutMs },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        // Only the `name=value` of each: the attributes are for a browser's jar, and we have none.
        const cookies = (response.headers["set-cookie"] ?? []).map((cookie) => cookie.split(";")[0] ?? "");
        const contentType = response.headers["content-type"] ?? "";

        if (status >= 300 && status < 400) {
          response.resume();
          resolve({ status, location, cookies, contentType, body: Buffer.alloc(0) });
          return;
        }

        // A declared length past the cap is refused before a single byte is read.
        if (Number(response.headers["content-length"] ?? 0) > maxBytes) {
          refuse();
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        const body = _decoded(response, response.headers["content-encoding"]);

        body.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > maxBytes) {
            refuse();
            return;
          }
          chunks.push(chunk);
        });
        body.on("end", () => resolve({ status, location, cookies, contentType, body: Buffer.concat(chunks) }));
        body.on("error", (caught: Error) => reject(refused ?? _unreachable(caught.message)));
      },
    );

    req.on("timeout", () => req.destroy(_unreachable(`${url.host} took too long to answer`)));
    req.on("error", (caught: Error) =>
      reject(refused ?? (caught instanceof ConvexError ? caught : _unreachable(caught.message))),
    );
    req.end();
  });

/** A post page as text, with the cookies it set: TikTok's video files are refused without them. */
export const httpsGet = async (host: string, path: string, headers: Record<string, string>): Promise<HttpsPage> => {
  const { status, location, cookies, body } = await _get(new URL(`https://${host}${path}`), headers, {
    timeoutMs: PAGE_TIMEOUT_MS,
    maxBytes: PAGE_MAX_BYTES,
    tooLarge: () => _unreachable(`${host} answered more than a page`),
  });
  return { status, location, cookies, body: body.toString("utf8") };
};

/**
 * A video's bytes, for a platform whose CDN the model cannot fetch on its own (TikTok refuses any
 * request without the page's cookies and a `Referer`). Refused as `VIDEO_TOO_LARGE` past `maxBytes`,
 * and as `EXTERNAL_SERVICE_ERROR` when the answer is not a video at all.
 */
export const httpsDownloadVideo = async (
  url: string,
  headers: Record<string, string>,
  { maxBytes }: { maxBytes: number },
): Promise<{ bytes: Buffer; mediaType: string }> => {
  const target = new URL(url);
  if (target.protocol !== "https:") {
    throw new ConvexError({ code: "INVALID_INPUT" as const, message: "Not an https video address" });
  }

  const { status, contentType, body } = await _get(target, headers, {
    timeoutMs: VIDEO_TIMEOUT_MS,
    maxBytes,
    tooLarge: () =>
      new ConvexError({ code: "VIDEO_TOO_LARGE" as const, message: `The video is over ${maxBytes / 1_000_000} MB` }),
  });

  if (status !== 200) throw _unreachable(`The video host answered ${status}`);

  const mediaType = contentType.split(";")[0]?.trim() ?? "";
  if (!mediaType.startsWith("video/")) throw _unreachable(`That address is not a video (${mediaType || "no type"})`);

  return { bytes: body, mediaType };
};
