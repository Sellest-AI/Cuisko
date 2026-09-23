import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import schema from "../../../schema";
import {
  generateInviteCode,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  normalizeInviteCode,
} from "../inviteCode";

// Root-anchored so every key shares one `/convex/` prefix — see users/getAccount.test.ts for why.
const modules = import.meta.glob("/convex/**/*.*s");

describe("functions/households/inviteCode", () => {
  test("the alphabet has none of the glyphs that read as another", () => {
    for (const ambiguous of ["I", "L", "O", "0", "1"]) expect(INVITE_CODE_ALPHABET).not.toContain(ambiguous);
  });

  test("draws 8 characters from the alphabet only", async () => {
    const t = convexTest(schema, modules);

    const codes = await t.run((ctx) => Promise.all(Array.from({ length: 50 }, () => generateInviteCode(ctx))));

    for (const code of codes) {
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      expect([...code].every((character) => INVITE_CODE_ALPHABET.includes(character))).toBe(true);
    }
  });

  test("normalizes what a cook types into what the index stores", () => {
    expect(normalizeInviteCode(" h3k8 9pqr ")).toBe("H3K89PQR");
    expect(normalizeInviteCode("")).toBe("");
  });
});
