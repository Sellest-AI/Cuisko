import { afterEach, describe, expect, test, vi } from "vitest";

import { imageBufferFromUrl } from "../image.buffer";

/**
 * The single entry point for "give me the bytes", called with whatever the caller happens to hold
 * — a Replicate URL, a data URI, or bare base64 from the background remover. Misreading a base64
 * string as a URL is the failure that matters: `fetch` would be handed a megabyte of base64 as a
 * path, and the error would name a URL nobody wrote.
 */

const asResponse = (body: Uint8Array, ok = true) =>
  ({ ok, arrayBuffer: async () => body.buffer }) as unknown as Response;

afterEach(() => vi.unstubAllGlobals());

describe("lib/media/image.buffer", () => {
  test("fetches an https URL", async () => {
    const fetchMock = vi.fn(async () => asResponse(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchMock);

    const buffer = await imageBufferFromUrl("https://example.com/a.webp");

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/a.webp");
    expect([...buffer]).toEqual([1, 2, 3]);
  });

  test("fetches a plain http URL too", async () => {
    const fetchMock = vi.fn(async () => asResponse(new Uint8Array([9])));
    vi.stubGlobal("fetch", fetchMock);

    await imageBufferFromUrl("http://example.com/a.webp");

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("raises a named error when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => asResponse(new Uint8Array(), false)));

    await expect(imageBufferFromUrl("https://example.com/gone.webp")).rejects.toThrow(
      "Failed to fetch the image",
    );
  });

  test("decodes a data URI without touching the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const buffer = await imageBufferFromUrl(
      `data:image/png;base64,${Buffer.from("bytes").toString("base64")}`,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(buffer.toString()).toBe("bytes");
  });

  test("decodes bare base64, which is what the background remover returns", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const buffer = await imageBufferFromUrl(Buffer.from("bytes").toString("base64"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(buffer.toString()).toBe("bytes");
  });

  /**
   * The URL test is `startsWith`, so a base64 payload that happens to begin with "http" is still
   * decoded as base64 only if the prefix is not a real scheme. Pinned to show the discrimination
   * is by scheme prefix and nothing else.
   */
  test("treats a non-scheme string as base64", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await imageBufferFromUrl("httpsomething");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
