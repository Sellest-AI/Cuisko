import { describe, expect, test } from "vitest";

import { addBase64Header, bufferToBase64, removeBase64Header } from "../image.base64";

/**
 * The data-URI header is added and stripped at every boundary: Replicate wants one, `sharp` and
 * `Buffer.from` want it gone. Getting it wrong does not throw — the header decodes as garbage
 * bytes and the image is simply corrupt.
 */

describe("lib/media/image.base64", () => {
  test("encodes a buffer", () => {
    expect(bufferToBase64(Buffer.from("hello"))).toBe("aGVsbG8=");
  });

  describe("removeBase64Header", () => {
    test("strips a webp header", () => {
      expect(removeBase64Header("data:image/webp;base64,AAAA")).toBe("AAAA");
    });

    test("strips a png header", () => {
      expect(removeBase64Header("data:image/png;base64,AAAA")).toBe("AAAA");
    });

    test("leaves bare base64 alone", () => {
      expect(removeBase64Header("AAAA")).toBe("AAAA");
    });

    test("trims trailing whitespace", () => {
      expect(removeBase64Header("data:image/png;base64,AAAA\n")).toBe("AAAA");
    });

    /**
     * The header pattern is anchored at `^` and the `.trim()` only runs AFTER the replace, so a
     * payload with leading whitespace keeps its header — the strip silently does nothing and the
     * decoded bytes are the header text. No caller passes one today; pinned so that if one starts
     * to, this says what happens rather than the corruption showing up in an uploaded image.
     */
    test("does not strip a header preceded by whitespace", () => {
      expect(removeBase64Header("  data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    });

    /** Only the leading header is matched, so base64 padding and body are never touched. */
    test("does not disturb the payload", () => {
      expect(removeBase64Header("data:image/png;base64,iVBORw0KGgo=")).toBe("iVBORw0KGgo=");
    });
  });

  describe("addBase64Header", () => {
    test("prefixes bare base64 with the requested type", () => {
      expect(addBase64Header("AAAA", "png")).toBe("data:image/png;base64,AAAA");
      expect(addBase64Header("AAAA", "webp")).toBe("data:image/webp;base64,AAAA");
    });

    /** Idempotent, so a value that has been round-tripped is not double-prefixed. */
    test("leaves an already-headed string alone", () => {
      const headed = "data:image/webp;base64,AAAA";

      expect(addBase64Header(headed, "png")).toBe(headed);
    });

    test("round-trips with removeBase64Header", () => {
      const raw = bufferToBase64(Buffer.from("some image bytes"));

      expect(removeBase64Header(addBase64Header(raw, "png"))).toBe(raw);
    });
  });
});
