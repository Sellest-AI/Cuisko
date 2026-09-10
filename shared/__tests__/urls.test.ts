import { describe, expect, it } from "vitest";

import { httpUrlOf } from "../urls";

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

  it("refuses nothing at all", () => {
    expect(httpUrlOf("")).toBeUndefined();
    expect(httpUrlOf("   ")).toBeUndefined();
  });
});
