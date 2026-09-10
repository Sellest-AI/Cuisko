import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPage } from "../fetchPage";

/**
 * `fetch` is stubbed throughout: what is under test is the policy around the request — which hosts
 * it refuses, how long it waits, how it reads the bytes — and none of that needs a network.
 */
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const page = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html", ...headers } });

const codeOf = async (promise: Promise<unknown>) => {
  const caught = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(caught).toBeInstanceOf(ConvexError);
  return (caught as ConvexError<{ code: string }>).data.code;
};

describe("fetchPage", () => {
  describe("a hostname written with its trailing dot", () => {
    it.each(["http://localhost./", "http://metadata.google.internal./computeMetadata/v1/"])(
      "refuses %s before connecting",
      async (url) => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        expect(await codeOf(fetchPage(url))).toBe("INVALID_INPUT");
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it("refuses it on a redirect hop too", async () => {
      const fetchMock = vi.fn(
        async () => new Response(null, { status: 302, headers: { location: "http://localhost./admin" } }),
      );
      vi.stubGlobal("fetch", fetchMock);

      expect(await codeOf(fetchPage("https://example.com/recipe"))).toBe("INVALID_INPUT");
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  });

  /**
   * `_isPrivateAddress` has no IPv6 arm, and this is the test that makes that safe: every IPv6
   * literal must be refused upstream of it, including the IPv4-mapped spelling of the metadata
   * service. If `httpUrlOf` ever starts accepting bracketed hosts, this goes red before a hole ships.
   */
  it.each(["http://[::1]/", "http://[::ffff:169.254.169.254]/", "http://[::]/"])(
    "refuses the IPv6 literal %s before connecting",
    async (url) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      expect(await codeOf(fetchPage(url))).toBe("INVALID_INPUT");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("releases a redirect's body rather than leaving its connection open", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(new ReadableStream({ cancel }), { status: 301, headers: { location: "/recipe" } }),
        )
        .mockResolvedValueOnce(page("<html></html>")),
    );

    await fetchPage("https://example.com/old");

    expect(cancel).toHaveBeenCalledOnce();
  });

  it("gives up on a body that stalls after the headers arrived", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const signal = init.signal!;
        // Headers now, then nothing — until the abort, which is what a real body stream does.
        const stalled = new ReadableStream<Uint8Array>({
          start: (controller) => signal.addEventListener("abort", () => controller.error(signal.reason)),
        });
        return page(stalled);
      }),
    );

    const pending = codeOf(fetchPage("https://example.com/recipe"));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await pending).toBe("EXTERNAL_SERVICE_ERROR");
  });

  describe("the body's charset", () => {
    /** "crème" in ISO-8859-1, where `è` is the single byte 0xE8 — invalid on its own as UTF-8. */
    const CREME_LATIN1 = new Uint8Array([0x63, 0x72, 0xe8, 0x6d, 0x65]);

    it("decodes with the charset the header declares", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => page(CREME_LATIN1, { "content-type": "text/html; charset=ISO-8859-1" })));

      expect(await fetchPage("https://example.com/recipe")).toBe("crème");
    });

    it("reads UTF-8 when no charset is declared", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => page("crème")));

      expect(await fetchPage("https://example.com/recipe")).toBe("crème");
    });

    it("keeps a character the body ends partway through, as a replacement rather than nothing", async () => {
      // "cr" and then 0xC3, the first of the two bytes UTF-8 spends on `è`.
      vi.stubGlobal("fetch", vi.fn(async () => page(new Uint8Array([0x63, 0x72, 0xc3]))));

      expect(await fetchPage("https://example.com/recipe")).toBe("cr�");
    });

    it("falls back to UTF-8 on a label it does not know, rather than failing the import", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => page("crème", { "content-type": "text/html; charset=not-a-charset" })));

      expect(await fetchPage("https://example.com/recipe")).toBe("crème");
    });
  });
});
