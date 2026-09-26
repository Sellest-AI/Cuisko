import { describe, expect, it, vi } from "vitest";

import { downloadImage } from "../downloadImage";

const URL_OF_IMAGE = "https://cdn.test/cover.webp";

describe("downloadImage", () => {
  it("returns the bytes of a successful download", async () => {
    const fetchUrl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));

    expect(await downloadImage(URL_OF_IMAGE, vi.fn(), fetchUrl)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("leaves out an image the bucket answers with an error status, with a warning", async () => {
    const warn = vi.fn();

    const bytes = await downloadImage(URL_OF_IMAGE, warn, async () => new Response(null, { status: 404 }));

    expect(bytes).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(`404 downloading ${URL_OF_IMAGE}, exported without it`);
  });

  it("leaves out an image whose request never completed, rather than throwing", async () => {
    const warn = vi.fn();

    const bytes = await downloadImage(URL_OF_IMAGE, warn, async () => {
      throw new TypeError("fetch failed");
    });

    expect(bytes).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(`fetch failed downloading ${URL_OF_IMAGE}, exported without it`);
  });
});
