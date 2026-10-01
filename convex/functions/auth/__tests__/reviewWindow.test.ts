import { describe, expect, test } from "vitest";

import { REVIEW_ACCOUNT } from "../reviewAccount";
import { reviewWindow } from "../reviewWindow";

describe("functions/auth/reviewWindow", () => {
  test("live 0.1.0, no review version: closed to every build", () => {
    expect(reviewWindow({ liveVersion: "0.1.0" }, "0.1.0")).toBeNull();
    expect(reviewWindow({ liveVersion: "0.1.0" }, "0.2.0")).toBeNull();
  });

  test("live 0.1.0, review 0.2.0: the build in review gets the credentials", () => {
    expect(reviewWindow({ liveVersion: "0.1.0", reviewVersion: "0.2.0" }, "0.2.0")).toEqual(REVIEW_ACCOUNT);
  });

  test("live 0.1.0, review 0.2.0: a person on the store version gets nothing", () => {
    expect(reviewWindow({ liveVersion: "0.1.0", reviewVersion: "0.2.0" }, "0.1.0")).toBeNull();
  });

  test("a build newer than the one in review is still inside the window", () => {
    expect(reviewWindow({ liveVersion: "0.1.0", reviewVersion: "0.2.0" }, "0.2.1")).toEqual(REVIEW_ACCOUNT);
  });

  test("releasing shuts the window: live reaches the review version, nobody clears a field", () => {
    expect(reviewWindow({ liveVersion: "0.2.0", reviewVersion: "0.2.0" }, "0.2.0")).toBeNull();
  });

  test("a review version behind the live one is closed", () => {
    expect(reviewWindow({ liveVersion: "0.3.0", reviewVersion: "0.2.0" }, "0.3.0")).toBeNull();
  });

  test("0.10.0 is ahead of 0.9.0: the comparison is numeric", () => {
    expect(reviewWindow({ liveVersion: "0.9.0", reviewVersion: "0.10.0" }, "0.10.0")).toEqual(REVIEW_ACCOUNT);
  });

  test("no config row yet: closed", () => {
    expect(reviewWindow(null, "0.2.0")).toBeNull();
  });

  test("a version that does not parse closes the window, whichever side it is on", () => {
    const open = { liveVersion: "0.1.0", reviewVersion: "0.2.0" };
    expect(reviewWindow(open, "")).toBeNull();
    expect(reviewWindow(open, "latest")).toBeNull();
    expect(reviewWindow({ liveVersion: "0.1.0", reviewVersion: "soon" }, "9.9.9")).toBeNull();
    expect(reviewWindow({ liveVersion: "oops", reviewVersion: "0.2.0" }, "0.2.0")).toBeNull();
  });

  test("the account is long enough for the password provider, which refuses under 8", () => {
    expect(REVIEW_ACCOUNT.password.length).toBeGreaterThanOrEqual(8);
    expect(REVIEW_ACCOUNT.email).toContain("@");
  });

  test("a caller cannot change the account by mutating what it was handed", () => {
    const handed = reviewWindow({ liveVersion: "0.1.0", reviewVersion: "0.2.0" }, "0.2.0")!;
    handed.password = "tampered";

    expect(reviewWindow({ liveVersion: "0.1.0", reviewVersion: "0.2.0" }, "0.2.0")).toEqual(REVIEW_ACCOUNT);
  });
});
