import { describe, expect, it } from "vitest";

import { importKeyOf, importPathOf } from "../importPath";

describe("importKeyOf", () => {
  it("gives two shares of the same reel, each with its own tracker, one key", () => {
    const first = importKeyOf("https://www.instagram.com/reel/DcTtz3Ftj9I/?igsh=MWZ0eGx5bGRzZ3Z5aQ==");
    const second = importKeyOf("https://instagram.com/reel/DcTtz3Ftj9I?igsh=Yjk4bTF2eTRxa2Zm#comments");

    expect(first).toBe("instagram.com/reel/DcTtz3Ftj9I");
    expect(second).toBe(first);
  });

  it("drops every query param a TikTok share adds, so a web share and a bare link are one video", () => {
    const shared = importKeyOf(
      "https://www.tiktok.com/@iramsfoodstory/video/7690673524758924557?is_from_webapp=1&sender_device=pc&web_id=7692919480594466326",
    );

    expect(shared).toBe("tiktok.com/@iramsfoodstory/video/7690673524758924557");
    expect(importKeyOf("https://www.tiktok.com/@iramsfoodstory/video/7690673524758924557")).toBe(shared);
  });

  it("keeps the shortcode's case, because two cases are two posts", () => {
    expect(importKeyOf("https://www.instagram.com/p/DcTtz3Ftj9I/")).not.toBe(
      importKeyOf("https://www.instagram.com/p/dcttz3ftj9i/"),
    );
  });

  it("tells two different reels apart", () => {
    expect(importKeyOf("https://www.instagram.com/p/DcTtz3Ftj9I/")).not.toBe(
      importKeyOf("https://www.instagram.com/p/DeCpypAD0FG/"),
    );
  });

  it("reads the mobile host as the same site", () => {
    expect(importKeyOf("https://m.instagram.com/p/DcTtz3Ftj9I/")).toBe(importKeyOf("instagram.com/p/DcTtz3Ftj9I"));
  });
});

describe("importPathOf", () => {
  it.each([
    "https://www.instagram.com/reel/DcTtz3Ftj9I/?igsh=MWZ0eGx5bGRzZ3Z5aQ==",
    "instagram.com/p/DcTtz3Ftj9I",
    "https://m.instagram.com/nicomerco/reel/DcTtz3Ftj9I/",
    "https://www.tiktok.com/@cook/video/7412345678901234567",
    "https://vm.tiktok.com/ZMabc123/",
  ])("sends %s down the video path", (link) => {
    expect(importPathOf(link)).toBe("video");
  });

  it.each([
    "https://www.marmiton.org/recettes/recette_poulet-croustillant.aspx",
    "https://www.bbcgoodfood.com/recipes/crispy-chicken",
    // A host that only mentions the name is not the platform.
    "https://instagram.com.recipes.example/p/x",
    "https://www.notinstagram.com/p/x",
    "not a link at all",
    "",
  ])("sends %j down the web path", (link) => {
    expect(importPathOf(link)).toBe("web");
  });
});
