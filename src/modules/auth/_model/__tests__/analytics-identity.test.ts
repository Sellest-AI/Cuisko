import { describe, expect, it } from "vitest";

import { identityStep } from "../analytics-identity";

/** The visitor id analytics minted for this device, before anyone signed in. */
const VISITOR = "0192f3a4-visitor";

describe("identityStep", () => {
  it("identifies a cook who signs in on a device analytics knows only as a visitor", () => {
    expect(identityStep({ userId: "camille", distinctId: VISITOR, anonymousId: VISITOR })).toBe("identify");
  });

  it("does nothing while the signed-in cook is the one already held", () => {
    expect(identityStep({ userId: "camille", distinctId: "camille", anonymousId: VISITOR })).toBe("none");
  });

  /** Merging would file Camille's screens and costs under Hugo's person. */
  it("resets before identifying a different cook, rather than merging the two", () => {
    expect(identityStep({ userId: "camille", distinctId: "hugo", anonymousId: VISITOR })).toBe("reset-and-identify");
  });

  it("resets when nobody is signed in and a cook is still held", () => {
    expect(identityStep({ userId: null, distinctId: "hugo", anonymousId: VISITOR })).toBe("reset");
  });

  it("does nothing when nobody is signed in and analytics holds only the visitor", () => {
    expect(identityStep({ userId: null, distinctId: VISITOR, anonymousId: VISITOR })).toBe("none");
  });
});
