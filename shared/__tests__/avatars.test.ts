import { describe, expect, it } from "vitest";

import { ANONYMOUS_AVATAR_SEED, avatarSeed } from "../avatars";

/** Convex ids are opaque strings of this shape; nothing here depends on the shape beyond that. */
const ID_A = "jd7f9k2m4n6p8q1r3s5t7v9w";
const ID_B = "jd7f9k2m4n6p8q1r3s5t7v9x";

describe("avatarSeed", () => {
  it("gives one id the same seed every time", () => {
    expect(avatarSeed(ID_A)).toBe(avatarSeed(ID_A));
  });

  /**
   * The whole reason the seed is derived from the id rather than the name. Two ids differing in
   * their last character only, because that is the case a weak hash gets wrong — and the case two
   * ids created a moment apart actually look like.
   */
  it("gives two ids different seeds", () => {
    expect(avatarSeed(ID_A)).not.toBe(avatarSeed(ID_B));
  });

  /** A fixed expectation, so a change to the algorithm fails here rather than on someone's screen. */
  it("is stable across builds", () => {
    expect(avatarSeed("user-1")).toBe("f5537974fee53bbd7c7bf85e666ee477");
  });

  it("returns 32 hex characters", () => {
    expect(avatarSeed(ID_A)).toMatch(/^[0-9a-f]{32}$/);
  });

  /**
   * Not a sampling check: `avatarSeed` emits hex and this does not, so no id can ever produce it.
   * The collision is ruled out by the alphabet rather than by not having found one.
   */
  it("cannot collide with the anonymous seed", () => {
    expect(ANONYMOUS_AVATAR_SEED).not.toMatch(/^[0-9a-f]{32}$/);
  });
});
