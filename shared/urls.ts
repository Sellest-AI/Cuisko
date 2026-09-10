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
 * A hostname with no dot is refused, which also takes out `localhost`. That is deliberate but it is
 * NOT the SSRF guard: an address literal like `169.254.169.254` has dots and passes here. The guard
 * is `fetchPage`, next to the fetch it protects, because this function is also called by the UI and
 * the UI has no business owning that policy.
 */
export const httpUrlOf = (text: string): string | undefined => {
  const trimmed = text.trim().replace(TRAILING_PASTE_ARTEFACTS, "");
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
