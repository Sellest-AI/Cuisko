import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { adapterFor, SOCIAL_VIDEO_ADAPTERS, socialVideoSourceOf } from "../sources";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "../types";

describe("socialVideoSourceOf", () => {
  it("reads what a share sheet hands over: a trailing period, no scheme, trackers", () => {
    expect(socialVideoSourceOf("instagram.com/reel/DcTtz3Ftj9I/?igsh=abc.")).toEqual({
      platform: "instagram",
      id: "DcTtz3Ftj9I",
      canonicalUrl: "https://www.instagram.com/p/DcTtz3Ftj9I/",
    });
  });

  it.each(["", "not a link", "https://www.marmiton.org/recettes/recette_crousty.aspx", "javascript:alert(1)"])(
    "claims nothing in %j",
    (text) => {
      expect(socialVideoSourceOf(text)).toBeNull();
    },
  );
});

describe("the adapter registry", () => {
  it("has exactly one adapter per platform", () => {
    expect(SOCIAL_VIDEO_ADAPTERS.map(({ platform }) => platform).sort()).toEqual([...SOCIAL_PLATFORMS].sort());
  });

  it("refuses a platform nothing is registered for as INTERNAL", () => {
    const source = { platform: "myspace" as SocialPlatform, id: "x", canonicalUrl: "https://myspace.com/x" };

    expect(() => adapterFor(source)).toThrow(ConvexError);
  });
});
