import { httpUrlOf } from "@shared/urls";
import { ConvexError } from "convex/values";

/**
 * One outbound request to a host the cook named, and every limit that request needs.
 *
 * No `ctx`, no database, no Convex import beyond the error type: this is the only part of the
 * import that touches the network, and keeping it a plain function is what lets the action above
 * it be three calls. It is deliberately NOT generic — it fetches a web page to read a recipe out
 * of, so it caps at a page's worth of bytes and refuses anything that is not markup.
 *
 * The caller chose the URL, which is the whole of the risk here. Four guards answer it:
 *
 *   - **Address.** `httpUrlOf` allows only `http(s)`, and `_isPrivateAddress` refuses an address
 *     literal that points back inside our own network. On a Lambda that is not theoretical: the
 *     instance metadata service lives at `169.254.169.254` and answers plain unauthenticated GETs.
 *   - **Redirects**, followed by hand rather than by `fetch`. `redirect: "follow"` would apply the
 *     guards to the FIRST url only, and a page that 302s to the metadata service would sail
 *     through. Each hop is re-checked by the same code that checked the first.
 *   - **Time**, so a host that accepts a connection and then says nothing cannot hold a Convex
 *     action open until the platform kills it.
 *   - **Size**, read in chunks and abandoned at the cap, so a multi-gigabyte response costs us the
 *     cap and not the response.
 *
 * ⚠️ **A hostname that RESOLVES to a private address still gets through.** The guards read the URL,
 * and the URL is not the packet. Closing that needs resolution before connection, which `fetch`
 * does not expose. It is the known remaining hole in this function, and the reason `importOne` is
 * `authed` — a caller who does it has a name attached.
 */

/** Long enough for a slow blog, short enough that the cook is not watching a spinner. */
const TIMEOUT_MS = 10_000;

/** A recipe page is tens of kilobytes of markup; the biggest in our fixtures is under 600 KB. */
const MAX_BYTES = 4 * 1024 * 1024;

/** Enough for the `www` → apex → canonical-slug chains real sites use, and no more. */
const MAX_REDIRECTS = 5;

/**
 * Many publishers answer a bare fetch with 403, so we say what we are well enough to be served.
 * This is not a disguise — it claims a browser engine because we parse the page a browser would
 * be served, and nothing here evades a paywall, a login or a `robots.txt`.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

const unreachable = (message: string) =>
  new ConvexError({ code: "EXTERNAL_SERVICE_ERROR" as const, message });

/**
 * Addresses that mean "us" rather than "somewhere on the web".
 *
 * Written against the literal text of the hostname, so it catches exactly what it can see and
 * claims nothing more — see the warning above about names that resolve inward.
 *
 * **IPv4 only, because no IPv6 literal gets this far.** `httpUrlOf` refuses a hostname without a
 * dot, and `URL` serializes every IPv6 address in colon-hex (`[::ffff:127.0.0.1]` becomes
 * `[::ffff:7f00:1]`), so a bracketed address is refused before it is ever asked about here. The
 * IPv4 spellings that DO have dots are normalized by `URL` first — `0x7f000001` and `127.1` both
 * arrive as `127.0.0.1` — which is what lets the octet match below stand for all of them.
 */
const _isPrivateAddress = (hostname: string): boolean => {
  /**
   * The trailing dots go: `localhost.` is the fully qualified spelling of `localhost`, `URL` keeps
   * the dot in `hostname`, and the resolver treats both the same. Left on, it walks past every name
   * comparison below.
   */
  const host = hostname.toLowerCase().replace(/\.+$/, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return true;

  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!octets) return false;

  const [a, b] = [Number(octets[1]), Number(octets[2])];

  return (
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, and the instance metadata service with it
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    a >= 224 // multicast and reserved
  );
};

/** Every check a URL has to pass before we will connect to it, first hop or fifth. */
const _allowedUrlOf = (candidate: string): string => {
  const url = httpUrlOf(candidate);
  if (!url) throw new ConvexError({ code: "INVALID_INPUT" as const, message: "Not a web address" });

  if (_isPrivateAddress(new URL(url).hostname)) {
    throw new ConvexError({ code: "INVALID_INPUT" as const, message: "Not a public web address" });
  }

  return url;
};

/**
 * A decoder for the charset the response declares, or UTF-8 when it declares none.
 *
 * Older French blogs still serve `ISO-8859-1`, and reading those bytes as UTF-8 turns every accent
 * into `�` — in the title, the ingredients and the steps the cook is about to save. An unknown label
 * falls back to UTF-8 rather than failing the import, because `TextDecoder` throws on one and a
 * page with a typo in its header is still a page. A charset declared only in a `<meta>` tag is not
 * read: that needs the bytes before the decoder, and the header covers the servers that get it wrong.
 */
const _decoderFor = (contentType: string): TextDecoder => {
  const label = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType)?.[1];
  if (!label) return new TextDecoder();

  try {
    return new TextDecoder(label);
  } catch (caught) {
    if (!(caught instanceof RangeError)) throw caught;
    return new TextDecoder();
  }
};

/**
 * The response body as text, stopping at `MAX_BYTES`.
 *
 * Truncation is not treated as a failure: a page cut off mid-markup usually still carries its
 * JSON-LD, which sits in the `<head>`, and the scraper repairs ill-formed markup anyway. Refusing
 * would trade a recipe we can read for a cap we felt strongly about.
 */
const _readCapped = async (response: Response, contentType: string): Promise<string> => {
  const body = response.body;
  if (!body) return "";

  const reader = body.getReader();
  const decoder = _decoderFor(contentType);
  const chunks: string[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));

      if (total >= MAX_BYTES) break;
    }

    // `stream: true` holds back a character split across chunks until its last byte arrives. A body
    // that ends mid-character — cut at the cap, most often — would drop it silently without this.
    chunks.push(decoder.decode());
  } finally {
    /**
     * Releases the socket whether we finished the body or walked away from it at the cap. Its own
     * failure is swallowed on purpose and is not an empty catch: we are already returning the HTML,
     * and a cancel that throws on a stream we have finished reading has nothing left to report.
     */
    await reader.cancel().catch(() => undefined);
  }

  return chunks.join("");
};

/**
 * The HTML at `url`, or a `ConvexError` the screen can word an apology from.
 *
 * `INVALID_INPUT` and `EXTERNAL_SERVICE_ERROR` are both possible and they are different apologies:
 * the first is "check what you pasted", the second is "your link is fine, the site would not
 * answer". `importOne` passes both through untouched for exactly that reason.
 */
export const fetchPage = async (url: string): Promise<string> => {
  let target = _allowedUrlOf(url);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    /**
     * The timer is cleared only once the BODY is read, not when the headers arrive. `fetch` resolves
     * on the headers, so a host that answers at once and then trickles the page a byte at a time
     * would otherwise hold the action open for as long as it liked, cap or no cap.
     */
    try {
      const response = await fetch(target, {
        // Followed by hand, so every hop is re-checked. See the docblock above.
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en,fr;q=0.9",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        // Nothing reads a redirect's body, and an unread one holds its connection open until
        // garbage collection — one per hop. A cancel that fails leaves nothing to report.
        await response.body?.cancel().catch(() => undefined);

        const location = response.headers.get("location");
        if (!location) throw unreachable("The site redirected us nowhere");

        // Relative locations are legal and common, so each hop is resolved against the one before it.
        target = _allowedUrlOf(new URL(location, target).href);
        continue;
      }

      if (!response.ok) throw unreachable(`The site answered ${response.status}`);

      const contentType = response.headers.get("content-type") ?? "";
      if (!/^\s*(text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
        throw unreachable(`That address is not a web page (${contentType || "no content type"})`);
      }

      return await _readCapped(response, contentType);
    } catch (caught) {
      if (caught instanceof ConvexError) throw caught;
      if (controller.signal.aborted) throw unreachable("The site took too long to answer");
      throw unreachable(caught instanceof Error ? caught.message : "The site did not answer");
    } finally {
      clearTimeout(timer);
    }
  }

  throw unreachable("The site redirected us too many times");
};
