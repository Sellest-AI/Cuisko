import { beforeEach, describe, expect, it, vi } from "vitest";

import { rejectionCodeOf } from "../../__tests__/convexError.fixtures";

import { resolveShortLink } from "../resolveShortLink";

/**
 * The redirects are TikTok's as measured on 2026-10-04: an unknown code is sent to the home page
 * (`302 https://www.tiktok.com/?_r=1`), and `/v/<id>.html` to `/@/video/<id>`. A real short link's
 * first hop, to the video, is the shape every TikTok short link is documented to take.
 */
const httpsGet = vi.hoisted(() => vi.fn());
vi.mock("../httpsGet", () => ({ httpsGet }));

const redirect = (location: string) => ({ status: 302, location, cookies: [], body: "" });

const CANONICAL = "https://www.tiktok.com/@/video/7690673524758924557";

beforeEach(() => httpsGet.mockReset());

describe("resolveShortLink", () => {
  it("answers the video a short link redirects to, by its canonical address", async () => {
    httpsGet.mockResolvedValueOnce(
      redirect("https://www.tiktok.com/@iramsfoodstory/video/7690673524758924557?_t=8x&_r=1"),
    );

    await expect(resolveShortLink("https://vm.tiktok.com/ZMabc123/")).resolves.toMatchObject({
      platform: "tiktok",
      canonicalUrl: CANONICAL,
    });
    expect(httpsGet).toHaveBeenCalledWith("vm.tiktok.com", "/ZMabc123/", expect.any(Object));
  });

  it("reads a redirect to the older /v/<id>.html address as the video too", async () => {
    httpsGet.mockResolvedValueOnce(redirect("https://m.tiktok.com/v/7690673524758924557.html?_r=1"));

    await expect(resolveShortLink("https://www.tiktok.com/t/ZTabc123/")).resolves.toMatchObject({
      canonicalUrl: CANONICAL,
    });
  });

  it("follows a short link that redirects to another short link", async () => {
    httpsGet
      .mockResolvedValueOnce(redirect("https://www.tiktok.com/t/ZTabc123/"))
      .mockResolvedValueOnce(redirect("https://www.tiktok.com/@/video/7690673524758924557"));

    await expect(resolveShortLink("https://vm.tiktok.com/ZMabc123/")).resolves.toMatchObject({
      canonicalUrl: CANONICAL,
    });
    expect(httpsGet).toHaveBeenLastCalledWith("www.tiktok.com", "/t/ZTabc123/", expect.any(Object));
  });

  describe("why it cannot", () => {
    it("is NOT_FOUND for an unknown code, which TikTok sends to its home page", async () => {
      httpsGet.mockResolvedValueOnce(redirect("https://www.tiktok.com/?_r=1"));

      expect(await rejectionCodeOf(resolveShortLink("https://vm.tiktok.com/ZMabc123/"))).toBe("NOT_FOUND");
    });

    it("is NOT_FOUND, without a request, for a redirect to a host no adapter owns", async () => {
      httpsGet.mockResolvedValueOnce(redirect("https://evil.test/ZMabc123/"));

      expect(await rejectionCodeOf(resolveShortLink("https://vm.tiktok.com/ZMabc123/"))).toBe("NOT_FOUND");
      expect(httpsGet).toHaveBeenCalledTimes(1);
    });

    it("is NOT_FOUND, not a TypeError, for a redirect address that does not parse", async () => {
      httpsGet.mockResolvedValueOnce(redirect("http://[bad"));

      expect(await rejectionCodeOf(resolveShortLink("https://vm.tiktok.com/ZMabc123/"))).toBe("NOT_FOUND");
    });

    it("is NOT_FOUND after three hops between short links, rather than looping", async () => {
      httpsGet.mockResolvedValue(redirect("https://vm.tiktok.com/ZMabc123/"));

      expect(await rejectionCodeOf(resolveShortLink("https://vm.tiktok.com/ZMabc123/"))).toBe("NOT_FOUND");
      expect(httpsGet).toHaveBeenCalledTimes(3);
    });

    it("is NOT_FOUND when the short link answers a page instead of a redirect", async () => {
      httpsGet.mockResolvedValueOnce({ status: 200, cookies: [], body: "<html></html>" });

      expect(await rejectionCodeOf(resolveShortLink("https://vm.tiktok.com/ZMabc123/"))).toBe("NOT_FOUND");
    });

    it("is EXTERNAL_SERVICE_ERROR when TikTok is down, worth a retry", async () => {
      httpsGet.mockResolvedValueOnce({ status: 503, cookies: [], body: "" });

      expect(await rejectionCodeOf(resolveShortLink("https://vm.tiktok.com/ZMabc123/"))).toBe("EXTERNAL_SERVICE_ERROR");
    });

    it("is NOT_FOUND, without a request, for a link that is no short link", async () => {
      expect(await rejectionCodeOf(resolveShortLink("https://www.tiktok.com/@iramsfoodstory"))).toBe("NOT_FOUND");
      expect(httpsGet).not.toHaveBeenCalled();
    });
  });
});
