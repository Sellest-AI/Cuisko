import { describe, expect, it } from "vitest";

import { canonicalUrlOf, httpUrlOf } from "../urls";

describe("httpUrlOf", () => {
  it("keeps an address that already says https", () => {
    expect(httpUrlOf("https://www.marmiton.org/recettes/gateau.aspx")).toBe(
      "https://www.marmiton.org/recettes/gateau.aspx",
    );
  });

  it("keeps http rather than upgrading it, since the page is the one that chose", () => {
    expect(httpUrlOf("http://example.com/recipe")).toBe("http://example.com/recipe");
  });

  it("completes a bare host to https", () => {
    expect(httpUrlOf("marmiton.org/recettes/gateau")).toBe("https://marmiton.org/recettes/gateau");
  });

  it("reads a host and port as a host and port, not as a scheme", () => {
    expect(httpUrlOf("example.com:8080/recipe")).toBe("https://example.com:8080/recipe");
  });

  it("refuses a scheme that is not http", () => {
    expect(httpUrlOf("ftp://example.com/recipe")).toBeUndefined();
    expect(httpUrlOf("file:///etc/passwd")).toBeUndefined();
  });

  it("refuses javascript, which never reaches the scheme arm at all", () => {
    expect(httpUrlOf("javascript:alert(1)")).toBeUndefined();
    expect(httpUrlOf("javascript://example.com/%0aalert(1)")).toBeUndefined();
  });

  it("refuses a hostname with no dot in it", () => {
    expect(httpUrlOf("localhost:3000/recipe")).toBeUndefined();
    expect(httpUrlOf("dinner")).toBeUndefined();
  });

  it("trims the whitespace and the punctuation a paste drags in", () => {
    expect(httpUrlOf("  https://example.com/tarte.  ")).toBe("https://example.com/tarte");
    expect(httpUrlOf("(https://example.com/tarte)")).toBeUndefined();
    expect(httpUrlOf("https://example.com/tarte,")).toBe("https://example.com/tarte");
  });

  it("reads the address out of the sentence a share sheet wraps it in", () => {
    expect(httpUrlOf("Check out this video! https://vm.tiktok.com/ZMabc123/ #tiktok")).toBe(
      "https://vm.tiktok.com/ZMabc123/",
    );
    expect(httpUrlOf("Regarde cette recette : https://www.marmiton.org/recettes/gateau.aspx.")).toBe(
      "https://www.marmiton.org/recettes/gateau.aspx",
    );
  });

  it("refuses a sentence with no address in it", () => {
    expect(httpUrlOf("poulet au curry rapide")).toBeUndefined();
  });

  it("refuses nothing at all", () => {
    expect(httpUrlOf("")).toBeUndefined();
    expect(httpUrlOf("   ")).toBeUndefined();
  });
});

describe("canonicalUrlOf", () => {
  it("strips utm_* and the click-id params a share button appends", () => {
    expect(
      canonicalUrlOf(
        "https://example.com/tarte?utm_source=fb&utm_medium=social&fbclid=abc&gclid=123",
      ),
    ).toBe("https://example.com/tarte");
  });

  it("strips the fragment, which names a place on the page and not a page", () => {
    expect(canonicalUrlOf("https://example.com/tarte#comments")).toBe("https://example.com/tarte");
  });

  it("keeps a site's own params, since they are what make its URL resolve", () => {
    expect(canonicalUrlOf("https://example.com/recette?id=1234&utm_campaign=x&page=2")).toBe(
      "https://example.com/recette?id=1234&page=2",
    );
  });

  it("spells the kept params the same way whether or not a tracker was stripped beside them", () => {
    expect(canonicalUrlOf("https://example.com/r?q=1%202&utm_source=x")).toBe(
      canonicalUrlOf("https://example.com/r?q=1%202"),
    );
    expect(canonicalUrlOf("https://example.com/r?")).toBe("https://example.com/r");
  });

  it("is idempotent", () => {
    const once = canonicalUrlOf("https://example.com/tarte?utm_source=fb&id=1#top")!;

    expect(canonicalUrlOf(once)).toBe(once);
  });

  it("is undefined for anything that is not a web address", () => {
    expect(canonicalUrlOf("javascript:alert(1)")).toBeUndefined();
    expect(canonicalUrlOf("dinner")).toBeUndefined();
    expect(canonicalUrlOf("")).toBeUndefined();
  });

  it("completes a bare host to https, as httpUrlOf does", () => {
    expect(canonicalUrlOf("marmiton.org/recettes/gateau?utm_source=x")).toBe(
      "https://marmiton.org/recettes/gateau",
    );
  });
});
