import { describe, expect, test } from "vitest";

import {
  getFileExtension,
  getFileExtensionFromMime,
  getFileName,
  getFileNameWithoutExtension,
  getFilePath,
  normalizeSlash,
} from "../path";

/**
 * These helpers exist because storage keys are assembled from them, and a key is not a value
 * anything validates: a wrong separator or a doubled slash produces a bucket path that uploads
 * happily and 404s on read. Windows-style separators are the case that matters — they arrive from
 * the local dev machine, never from CI.
 */
describe("lib/path", () => {
  describe("normalizeSlash", () => {
    test("turns backslashes into forward slashes", () => {
      expect(normalizeSlash("public\\images\\a.webp")).toBe("public/images/a.webp");
    });

    test("collapses doubled separators", () => {
      expect(normalizeSlash("public//images//a.webp")).toBe("public/images/a.webp");
    });

    test("collapses a mixed doubled separator", () => {
      expect(normalizeSlash("public\\/images/a.webp")).toBe("public/images/a.webp");
    });

    test("leaves an already-clean path alone", () => {
      expect(normalizeSlash("public/images/a.webp")).toBe("public/images/a.webp");
    });
  });

  describe("getFilePath", () => {
    test("drops the file name", () => {
      expect(getFilePath("public/images/a.webp")).toBe("public/images");
    });

    test("normalises separators on the way", () => {
      expect(getFilePath("public\\images\\a.webp")).toBe("public/images");
    });

    test("is empty for a bare file name", () => {
      expect(getFilePath("a.webp")).toBe("");
    });
  });

  describe("getFileName", () => {
    test("takes the last segment", () => {
      expect(getFileName("public/images/a.webp")).toBe("a.webp");
    });

    test("handles backslashes", () => {
      expect(getFileName("public\\images\\a.webp")).toBe("a.webp");
    });

    test("returns a bare name unchanged", () => {
      expect(getFileName("a.webp")).toBe("a.webp");
    });
  });

  describe("getFileNameWithoutExtension", () => {
    test("drops the extension", () => {
      expect(getFileNameWithoutExtension("public/images/a.webp")).toBe("a");
    });

    /** A hashed key can carry dots of its own — only the last segment is the extension. */
    test("keeps the dots inside the name", () => {
      expect(getFileNameWithoutExtension("public/images/a.b.c.webp")).toBe("a.b.c");
    });

    test("is empty for a name with no extension", () => {
      expect(getFileNameWithoutExtension("public/images/README")).toBe("");
    });
  });

  describe("getFileExtension", () => {
    test("takes the last dotted segment", () => {
      expect(getFileExtension("public/images/a.webp")).toBe("webp");
    });

    test("takes the last of several", () => {
      expect(getFileExtension("archive.tar.gz")).toBe("gz");
    });

    /**
     * No dot means the whole string comes back — worth pinning because the caller appends it to a
     * key, so the fallback is a silently malformed name rather than a throw.
     */
    test("returns the input when there is no extension", () => {
      expect(getFileExtension("README")).toBe("README");
    });
  });

  describe("getFileExtensionFromMime", () => {
    test("takes the subtype", () => {
      expect(getFileExtensionFromMime("image/webp")).toBe("webp");
      expect(getFileExtensionFromMime("image/png")).toBe("png");
    });

    test("returns the input when there is no slash", () => {
      expect(getFileExtensionFromMime("webp")).toBe("webp");
    });
  });
});
