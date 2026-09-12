import { describe, expect, test } from "vitest";

import { nanoid, randomShuffleKey } from "../nanoid";

/** Every S3 object key is built on one of these, so a collision is a silently overwritten upload. */

const DEFAULT_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

describe("lib/nanoid", () => {
  test("defaults to 21 characters", () => {
    expect(nanoid()).toHaveLength(21);
  });

  test("honours a requested length", () => {
    expect(nanoid(8)).toHaveLength(8);
    expect(nanoid(64)).toHaveLength(64);
  });

  test("is empty at length zero rather than throwing", () => {
    expect(nanoid(0)).toBe("");
  });

  test("draws only from the default alphabet", () => {
    // No separator, dot or slash can appear — the result is spliced straight into an S3 key.
    expect(nanoid(200)).toMatch(/^[0-9A-Za-z]+$/);
  });

  test("draws only from a custom alphabet", () => {
    expect(nanoid(100, { alphabet: "ab" })).toMatch(/^[ab]+$/);
  });

  /** An empty custom alphabet falls back to the default rather than producing `undefined`s. */
  test("falls back to the default when the custom alphabet is empty", () => {
    const id = nanoid(30, { alphabet: "" });

    expect(id).toHaveLength(30);
    expect(id).toMatch(/^[0-9A-Za-z]+$/);
    expect(id).not.toContain("undefined");
  });

  test("never repeats across many draws", () => {
    const ids = new Set(Array.from({ length: 500 }, () => nanoid()));

    expect(ids.size).toBe(500);
  });

  test("uses more than a handful of the alphabet", () => {
    // A broken index would collapse the output onto one or two characters while still
    // satisfying every length and charset assertion above.
    const used = new Set(nanoid(1000).split(""));

    expect(used.size).toBeGreaterThan(DEFAULT_ALPHABET.length / 2);
  });
});

describe("lib/nanoid > randomShuffleKey", () => {
  /** The key is an ordering key, not a probability: a float's precision is wasted on it, and
   * an integer is what the database displays. This asserts the shape rather than the value. */
  test("returns an integer, never a float", () => {
    for (let i = 0; i < 100; i++) {
      const key = randomShuffleKey();
      expect(key).toBeTypeOf("number");
      expect(Number.isInteger(key)).toBe(true);
    }
  });

  test("is not always zero", () => {
    const keys = new Set(Array.from({ length: 100 }, () => randomShuffleKey()));
    expect(keys.size).toBeGreaterThan(1);
  });
});
