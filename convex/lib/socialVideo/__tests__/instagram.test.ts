import { describe, expect, it } from "vitest";

import { codeOf } from "../../__tests__/convexError.fixtures";

import { instagram, parseInstagramPost } from "../instagram";
import type { SocialVideoSource } from "../types";

import post from "./fixtures/instagram-post.json";

/**
 * `instagram-post.json` is a REAL page, captured on 2026-10-04 from a logged-out `node:https` fetch
 * of `/p/DcTtz3Ftj9I` and trimmed to what the parser reads: the one script holding
 * `xig_polaris_media`, without its DASH manifest and image variants, with the signed CDN addresses
 * replaced. Kept from the real page on purpose: the author's timeline, where this same post appears
 * again with a caption and no video, and one other video. A decoy script carrying the shortcode and
 * a caption, with no polaris data around it, is the one hand-written part.
 */
const SOURCE: SocialVideoSource = {
  platform: "instagram",
  id: "DcTtz3Ftj9I",
  canonicalUrl: "https://www.instagram.com/p/DcTtz3Ftj9I/",
};

const sourceOf = (href: string) => instagram.sourceOf(new URL(href));

type _Json = Record<string, unknown>;

/**
 * The fixture with one edit applied to its `xig_polaris_media`, for the shapes no real page held
 * still on. Edited as parsed JSON, not by string replacement: the timeline is serialized before the
 * post's own fields, so a textual match would edit a timeline entry first.
 */
const withPolaris = (edit: (media: _Json) => void): string => {
  const SCRIPT = /(<script type="application\/json"[^>]*>)([\s\S]*?xig_polaris_media[\s\S]*?)(<\/script>)/;
  const [, open = "", json = "", close = ""] = SCRIPT.exec(post.html) ?? [];
  const tree = JSON.parse(json) as unknown;

  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const media = (node as _Json).xig_polaris_media;
    if (typeof media === "object" && media !== null) return edit(media as _Json);
    Object.values(node).forEach(visit);
  };
  visit(tree);

  return post.html.replace(SCRIPT, `${open}${JSON.stringify(tree)}${close}`);
};

const postOf = (media: _Json) => media.if_not_gated_logged_out as _Json;

describe("instagram.sourceOf", () => {
  it.each([
    "https://www.instagram.com/p/DcTtz3Ftj9I/",
    "https://www.instagram.com/reel/DcTtz3Ftj9I/?igsh=MWZ0eGx5bGRzZ3Z5aQ==",
    "https://instagram.com/reels/DcTtz3Ftj9I",
    "https://m.instagram.com/tv/DcTtz3Ftj9I/",
    "https://www.instagram.com/nicomerco/reel/DcTtz3Ftj9I/?utm_source=ig_web_copy_link",
  ])("reads %s as the one canonical post", (href) => {
    expect(sourceOf(href)).toEqual(SOURCE);
  });

  it.each([
    "https://www.instagram.com/nicomerco/",
    "https://www.instagram.com/stories/nicomerco/3968717172581482312/",
    "https://www.instagram.com/explore/tags/recette/",
    "https://www.instagram.com.evil.example/p/DcTtz3Ftj9I/",
    "https://www.tiktok.com/@nicomerco/video/7412345678901234567",
  ])("claims nothing in %s", (href) => {
    expect(sourceOf(href)).toBeNull();
  });

  it("builds the page request from the shortcode alone", () => {
    expect(instagram.pageOf(SOURCE)).toMatchObject({ host: "www.instagram.com", path: "/p/DcTtz3Ftj9I" });
  });
});

describe("parseInstagramPost", () => {
  it("reads this post's video and full caption, not another post's", () => {
    const video = parseInstagramPost(post.html, SOURCE);

    expect(video).toMatchObject(SOURCE);
    expect(video.videoUrl).toBe(
      "https://scontent-test.cdninstagram.com/o1/v/t2/f2/m86/video-101.mp4?_nc_ht=scontent-test.cdninstagram.com&oe=6AC49CEA",
    );
    expect(video.caption.startsWith("Tasty Crousty 🍗🍚🔥")).toBe(true);
    expect(video.caption).toContain("100 g de cornflakes");
    expect(video.caption).toContain("6️⃣ Coupe ton poulet croustillant");
  });

  it("does not carry the meta tag's likes-and-date prefix", () => {
    expect(parseInstagramPost(post.html, SOURCE).caption).not.toContain("likes");
  });

  it("refuses another post of the same author's timeline it was not asked for", () => {
    expect(codeOf(() => parseInstagramPost(post.html, { ...SOURCE, id: "Ddb0CqXt48T" }))).toBe(
      "IMPORT_UNAVAILABLE",
    );
  });

  it("reads an empty caption as an empty string", () => {
    const html = withPolaris((media) => {
      postOf(media).caption = null;
    });

    expect(parseInstagramPost(html, SOURCE).caption).toBe("");
  });

  describe("why it cannot", () => {
    it("is IMPORT_UNAVAILABLE when the page holds no post data", () => {
      expect(codeOf(() => parseInstagramPost("<html><body>Log in</body></html>", SOURCE))).toBe("IMPORT_UNAVAILABLE");
    });

    it("is IMPORT_UNAVAILABLE, not a SyntaxError, when the post script is not JSON", () => {
      const html = '<script type="application/json">{"xig_polaris_media": </script>';

      expect(codeOf(() => parseInstagramPost(html, SOURCE))).toBe("IMPORT_UNAVAILABLE");
    });

    it("is NOT_FOUND when the post is gated", () => {
      const html = withPolaris((media) => {
        media.if_not_gated_logged_out = null;
      });

      expect(codeOf(() => parseInstagramPost(html, SOURCE))).toBe("NOT_FOUND");
    });

    it("is NOT_A_VIDEO for a photo post", () => {
      const html = withPolaris((media) => {
        postOf(media).media_type = 1;
        delete postOf(media).video_versions;
      });

      expect(codeOf(() => parseInstagramPost(html, SOURCE))).toBe("NOT_A_VIDEO");
    });
  });
});
