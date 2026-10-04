import { describe, expect, it } from "vitest";

import { codeOf } from "../../__tests__/convexError.fixtures";

import { parseTiktokPost, tiktok } from "../tiktok";
import type { SocialVideoSource } from "../types";

import post from "./fixtures/tiktok-post.json";

/**
 * `tiktok-post.json` is a REAL page, captured on 2026-10-04 from a logged-out `node:https` fetch of
 * `/@iramsfoodstory/video/7690673524758924557` and trimmed to what the parser reads: the
 * rehydration script's video-detail, the creator's caption as posted, and the list of encoded
 * versions with their real sizes and codecs (signed CDN addresses replaced). One H.264 version is
 * hand-added, a heavier one listed before the real one, so "the smallest H.264" is a choice the
 * test can see rather than "the first one".
 */
const SOURCE: SocialVideoSource = {
  platform: "tiktok",
  id: "7690673524758924557",
  canonicalUrl: "https://www.tiktok.com/@/video/7690673524758924557",
};

const COOKIES = ["ttwid=1%7Ctest", "tt_csrf_token=test", "tt_chain_token=test"];

const sourceOf = (href: string) => tiktok.sourceOf(new URL(href));

type _Json = Record<string, unknown>;

/** The fixture with one edit applied to its video-detail, for the shapes no real page held still on. */
const withDetail = (edit: (detail: _Json) => void): string => {
  const SCRIPT = /(<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>)([\s\S]*?)(<\/script>)/;
  const [, open = "", json = "", close = ""] = SCRIPT.exec(post.html) ?? [];
  const data = JSON.parse(json) as { __DEFAULT_SCOPE__: Record<string, _Json> };
  edit(data.__DEFAULT_SCOPE__["webapp.video-detail"]!);
  return post.html.replace(SCRIPT, `${open}${JSON.stringify(data)}${close}`);
};

const itemOf = (detail: _Json) => (detail.itemInfo as { itemStruct: _Json }).itemStruct;

describe("tiktok.sourceOf", () => {
  it.each([
    "https://www.tiktok.com/@iramsfoodstory/video/7690673524758924557?is_from_webapp=1&sender_device=pc&web_id=7692919480594466326",
    "https://www.tiktok.com/@iramsfoodstory/video/7690673524758924557",
    "tiktok.com/@iramsfoodstory/video/7690673524758924557/",
    "https://m.tiktok.com/@iramsfoodstory/video/7690673524758924557?lang=fr",
    "https://www.tiktok.com/@renamed_creator/video/7690673524758924557",
    "https://www.tiktok.com/@/video/7690673524758924557?_r=1",
    "https://m.tiktok.com/v/7690673524758924557.html",
  ])("reads %s as the one canonical video, by its id alone", (href) => {
    expect(sourceOf(href.startsWith("http") ? href : `https://${href}`)).toEqual(SOURCE);
  });

  it.each([
    "https://www.tiktok.com/@iramsfoodstory",
    "https://www.tiktok.com/@iramsfoodstory/photo/7690673524758924557",
    "https://vm.tiktok.com/ZMabc123/",
    "https://www.tiktok.com/t/ZTabc123/",
    "https://www.instagram.com/p/DcTtz3Ftj9I/",
  ])("claims nothing in %s", (href) => {
    expect(sourceOf(href)).toBeNull();
  });

  it("builds the page request from the id, not the shared address", () => {
    expect(tiktok.pageOf(SOURCE)).toMatchObject({ host: "www.tiktok.com", path: "/@/video/7690673524758924557" });
  });
});

describe("tiktok.shortLinkOf", () => {
  const shortLinkOf = (href: string) => tiktok.shortLinkOf?.(new URL(href)) ?? null;

  it.each([
    ["https://vm.tiktok.com/ZMabc123/", "vm.tiktok.com", "/ZMabc123/"],
    ["https://vt.tiktok.com/ZSabc-123?_t=8x&_r=1", "vt.tiktok.com", "/ZSabc-123/"],
    ["https://www.tiktok.com/t/ZTabc123/", "www.tiktok.com", "/t/ZTabc123/"],
    ["https://tiktok.com/t/ZTabc123", "www.tiktok.com", "/t/ZTabc123/"],
  ])("opens the app's share link %s at %s%s, its query dropped", (href, host, path) => {
    expect(shortLinkOf(href)).toMatchObject({ host, path });
  });

  it.each([
    "https://www.tiktok.com/@iramsfoodstory/video/7690673524758924557",
    "https://www.tiktok.com/ZMabc123/",
    "https://vm.tiktok.com/ZMabc123/extra",
    "https://vm.tiktok.com.evil.test/ZMabc123/",
  ])("opens nothing for %s", (href) => {
    expect(shortLinkOf(href)).toBeNull();
  });
});

describe("parseTiktokPost", () => {
  it("reads the creator's full caption", () => {
    const video = parseTiktokPost({ html: post.html, cookies: COOKIES }, SOURCE);

    expect(video).toMatchObject(SOURCE);
    expect(video.caption.startsWith("Crispy cheeseburger wraps")).toBe(true);
    expect(video.caption).toContain("1 lb ground beef");
  });

  it("picks the smallest H.264 version, not the first one listed nor a smaller H.265", () => {
    const video = parseTiktokPost({ html: post.html, cookies: COOKIES }, SOURCE);

    expect(video.videoUrl).toContain("/h264-720.mp4");
  });

  it("hands on the page's cookies and a Referer, without which the CDN answers 403", () => {
    const { videoHeaders } = parseTiktokPost({ html: post.html, cookies: COOKIES }, SOURCE);

    expect(videoHeaders).toMatchObject({
      Referer: "https://www.tiktok.com/",
      Cookie: "ttwid=1%7Ctest; tt_csrf_token=test; tt_chain_token=test",
    });
  });

  it("falls back to the default play address when no H.264 version is listed", () => {
    const html = withDetail((detail) => {
      const video = itemOf(detail).video as _Json;
      video.bitrateInfo = (video.bitrateInfo as _Json[]).filter((version) => version.CodecType !== "h264");
    });

    expect(parseTiktokPost({ html, cookies: COOKIES }, SOURCE).videoUrl).toContain("/play.mp4");
  });

  describe("why it cannot", () => {
    it("is IMPORT_UNAVAILABLE when the page holds no rehydration data", () => {
      expect(codeOf(() => parseTiktokPost({ html: "<html>Log in</html>", cookies: [] }, SOURCE))).toBe(
        "IMPORT_UNAVAILABLE",
      );
    });

    it("is IMPORT_UNAVAILABLE, not a SyntaxError, when that data is not JSON", () => {
      const html = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT</script>';

      expect(codeOf(() => parseTiktokPost({ html, cookies: [] }, SOURCE))).toBe("IMPORT_UNAVAILABLE");
    });

    it("is NOT_FOUND for TikTok's 'item doesn't exist' (10204), as a missing video answers", () => {
      const html = withDetail((detail) => {
        detail.statusCode = 10204;
        detail.statusMsg = "item doesn't exist";
        delete detail.itemInfo;
      });

      expect(codeOf(() => parseTiktokPost({ html, cookies: [] }, SOURCE))).toBe("NOT_FOUND");
    });

    it("is NOT_A_VIDEO for a photo carousel", () => {
      const html = withDetail((detail) => {
        itemOf(detail).imagePost = { images: [] };
      });

      expect(codeOf(() => parseTiktokPost({ html, cookies: [] }, SOURCE))).toBe("NOT_A_VIDEO");
    });
  });
});
