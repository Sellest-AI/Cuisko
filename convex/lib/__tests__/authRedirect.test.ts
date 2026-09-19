import { describe, expect, test } from "vitest";

import { resolveAuthRedirect } from "../authRedirect";

/** The OAuth `code` rides on this URL, so anything accepted here is a place a sign-in can land. */

const SITE_URL = "http://localhost:8081";

describe("lib/authRedirect", () => {
  test("resolves a relative path against SITE_URL", () => {
    expect(resolveAuthRedirect("/plan", SITE_URL)).toBe("http://localhost:8081/plan");
    expect(resolveAuthRedirect("?next=1", SITE_URL)).toBe("http://localhost:8081?next=1");
  });

  test("accepts a URL on SITE_URL's origin", () => {
    expect(resolveAuthRedirect("http://localhost:8081/plan?x=1", SITE_URL)).toBe(
      "http://localhost:8081/plan?x=1",
    );
  });

  test("accepts the app's own deep-link scheme", () => {
    expect(resolveAuthRedirect("cuisko://", SITE_URL)).toBe("cuisko://");
    expect(resolveAuthRedirect("cuisko://auth/callback", SITE_URL)).toBe("cuisko://auth/callback");
  });

  test("rejects another origin", () => {
    expect(() => resolveAuthRedirect("https://evil.example/steal", SITE_URL)).toThrow(/Invalid/);
  });

  test("rejects a host that only shares SITE_URL as a string prefix", () => {
    // A `startsWith` check would let this through — the reason the origin is compared parsed.
    expect(() => resolveAuthRedirect("http://localhost:8081.evil.example/", SITE_URL)).toThrow(/Invalid/);
  });

  test("rejects SITE_URL's host on another scheme or port", () => {
    expect(() => resolveAuthRedirect("https://localhost:8081/", SITE_URL)).toThrow(/Invalid/);
    expect(() => resolveAuthRedirect("http://localhost:9999/", SITE_URL)).toThrow(/Invalid/);
  });

  test("keeps a protocol-relative path on SITE_URL's host", () => {
    // In a browser `//evil.example` means another host. Here it is a path on SITE_URL's origin.
    expect(resolveAuthRedirect("//evil.example", SITE_URL)).toBe("http://localhost:8081//evil.example");
    expect(new URL(resolveAuthRedirect("//evil.example", SITE_URL)).origin).toBe(SITE_URL);
    expect(new URL(resolveAuthRedirect("/\\evil.example", SITE_URL)).origin).toBe(SITE_URL);
  });

  test("rejects any scheme other than the app's own", () => {
    expect(() => resolveAuthRedirect("exp://192.168.1.10:8081", SITE_URL)).toThrow(/Invalid/);
    expect(() => resolveAuthRedirect("javascript:alert(1)", SITE_URL)).toThrow(/Invalid/);
  });

  test("rejects a string that is not a URL", () => {
    expect(() => resolveAuthRedirect("not a url", SITE_URL)).toThrow(/not a URL/);
  });
});
