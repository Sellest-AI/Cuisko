/**
 * Turning what someone pasted into a web address, or refusing it.
 *
 * Lives in `shared/` because both runtimes ask the same question for different reasons: the import
 * screen asks so it can refuse without spending a round trip, and `importOne` asks again because a
 * client is not a gate — the action is callable without the screen, and it is the half that makes
 * our servers fetch a host the caller named.
 */

/**
 * What a paste drags in behind the address. A URL may legally end in most of these, so trimming
 * them is a guess — but the guess is right far more often than not for text a human copied out of
 * a sentence, and the cost of being wrong is a link that still resolves on nearly every site.
 */
const TRAILING_PASTE_ARTEFACTS = /[.,;:!?)\]}'"»<>]+$/;

/** An explicit scheme, and its authority. The `//` is what separates it from a `host:port`. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** The first `http(s)://` address inside a sentence: what a share sheet sends when it adds words. */
const LINK_IN_TEXT = /https?:\/\/\S+/i;

/**
 * The pasted text as an absolute `http(s)` URL, or `undefined` if it is not one.
 *
 * A bare host is completed rather than refused: someone pasting `marmiton.org/recettes/x` typed a
 * web address by any reading that matters, and answering "that does not look like a web address"
 * would be pedantry. It is completed to **https**, never http — the downgrade is not ours to pick.
 *
 * Everything that is not `http(s)` is refused, `javascript:` included. It reaches here without a
 * `//` so it is not seen as a scheme at all: prefixing turns it into `https://javascript:alert(1)`,
 * whose port is not a number, and `URL` throws. The refusal is the same either way, which is the
 * point — there is no arm of this function that returns a non-http URL.
 *
 * Text with words around an address ("Check out this video! https://vm.tiktok.com/…", as some
 * share sheets send it) is read as the first `http(s)://` address in it. Only a full address is
 * picked out of a sentence: a bare host among words is too likely to be prose.
 *
 * A hostname with no dot is refused, which also takes out `localhost`. That is deliberate but it is
 * NOT the SSRF guard: an address literal like `169.254.169.254` has dots and passes here. The guard
 * is `fetchPage`, next to the fetch it protects, because this function is also called by the UI and
 * the UI has no business owning that policy.
 */
export const httpUrlOf = (text: string): string | undefined => {
  const link = /\s/.test(text.trim()) ? (LINK_IN_TEXT.exec(text)?.[0] ?? text) : text;
  const trimmed = link.trim().replace(TRAILING_PASTE_ARTEFACTS, "");
  if (!trimmed) return undefined;

  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (!url.hostname.includes(".")) return undefined;

  return url.href;
};

/**
 * The query parameters a share button adds and a page never reads: campaign tags and the click
 * ids each ad network appends on the way out. A recipe page with them stripped is the same page,
 * which is what makes them noise a canonical spelling has to drop. `utm_*` is matched by prefix
 * because the set is open-ended; the rest are named because each is one network's fixed key.
 */
const TRACKING_PARAMS = new Set(["fbclid", "gclid", "msclkid", "dclid", "twclid", "sclid", "igshid"]);

const _isTrackingParam = (name: string): boolean =>
  name.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(name.toLowerCase());

/**
 * The pasted text as the ONE spelling this app stores for a web page, or `undefined`.
 *
 * `httpUrlOf` first — refusal, paste artefacts and bare-host completion are its business — and
 * then two strips on top: the tracking params above, and the fragment always, since `#comments`
 * names a place on the page rather than a different page. Every other param is KEPT: a site's own
 * params (`?id=1234`, `?page=2`) are what make its URL resolve, and guessing which ones matter is
 * how a canonical URL stops pointing at the recipe.
 *
 * Idempotent, so a caller can apply it again without checking whether it already was — which is
 * what lets the persist re-canonicalize what a client hands it rather than trust the client did.
 */
export const canonicalUrlOf = (text: string): string | undefined => {
  const href = httpUrlOf(text);
  if (!href) return undefined;

  const url = new URL(href);
  url.hash = "";

  for (const name of [...url.searchParams.keys()]) {
    if (_isTrackingParam(name)) url.searchParams.delete(name);
  }

  // Re-serialized ALWAYS, not only when a delete happened to: a delete rewrites the whole query in
  // `URLSearchParams`' encoding, so without this a page pasted with a tracker would be stored as
  // `?q=1+2` and the same page pasted without one as `?q=1%202` — two spellings, one page. It also
  // drops a bare trailing `?`.
  url.search = url.searchParams.toString();

  return url.href;
};
