import { describe, expect, it } from "vitest";

import { sharedLinkOf } from "../sharedLinkOf";

describe("sharedLinkOf", () => {
  it("takes the link the platform extracted, when it has one", () => {
    expect(sharedLinkOf({ webUrl: "https://www.instagram.com/reel/DcTtz3Ftj9I/", text: null })).toBe(
      "https://www.instagram.com/reel/DcTtz3Ftj9I/",
    );
  });

  it("reads the link out of shared text when none was extracted, as TikTok's share text carries it", () => {
    expect(sharedLinkOf({ webUrl: null, text: "Check out this video! https://vm.tiktok.com/ZMabc123/" })).toBe(
      "https://vm.tiktok.com/ZMabc123/",
    );
  });

  it("is null for a share with no link in it", () => {
    expect(sharedLinkOf({ webUrl: null, text: "poulet au curry" })).toBeNull();
    expect(sharedLinkOf({ webUrl: null })).toBeNull();
  });
});
