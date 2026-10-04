import { describe, expect, it } from "vitest";

import { isShareExtensionLink } from "../isShareExtensionLink";

describe("isShareExtensionLink", () => {
  it("recognises the link iOS's share extension reopens the app on", () => {
    expect(isShareExtensionLink("cuisko://dataUrl=cuiskoShareKey")).toBe(true);
    expect(isShareExtensionLink("cuisko://dataUrl=cuiskoShareKey#weburl")).toBe(true);
    expect(isShareExtensionLink("/dataUrl=cuiskoShareKey")).toBe(true);
  });

  it("lets every other link through, an OAuth return and a page with dataUrl in its query included", () => {
    expect(isShareExtensionLink("cuisko://?code=4f2a")).toBe(false);
    expect(isShareExtensionLink("cuisko://recipes")).toBe(false);
    expect(isShareExtensionLink("/recipe/abc?dataUrl=x")).toBe(false);
  });
});
