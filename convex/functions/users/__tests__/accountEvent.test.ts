import { describe, expect, test } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import { REVIEW_ACCOUNT } from "../../auth/reviewAccount";
import { accountAgeDays, accountEventOf } from "../accountEvent";

const camille = { _id: "camille" as Id<"users"> };
const DAY_MS = 24 * 60 * 60 * 1000;

/** Builds the event an entry point sends; sending it, and never throwing, is `captureEvent`'s. */
describe("accountEventOf", () => {
  test("files one event on the cook's users id, with only the properties it was given", () => {
    expect(accountEventOf(camille, "account deleted", { outcome: "anonymized" })).toEqual({
      distinctId: "camille",
      event: "account deleted",
      properties: { outcome: "anonymized" },
    });
  });

  test("adds the account's age when its creation time is known, and only the id and numbers", () => {
    const createdAt = Date.now() - 12 * DAY_MS - 1000;

    expect(
      accountEventOf(
        { ...camille, _creationTime: createdAt, email: "camille@example.com" },
        "account deletion requested",
        { deletionDueAt: 1 },
      ),
    ).toEqual({
      distinctId: "camille",
      event: "account deletion requested",
      properties: { accountAgeDays: 12, deletionDueAt: 1 },
    });
  });

  /** App Review deletes and restores this account at every submission: counted, it reads as cooks leaving. */
  test("builds nothing for the store reviewer's shared account", () => {
    expect(
      accountEventOf({ ...camille, email: REVIEW_ACCOUNT.email }, "account deletion requested", { deletionDueAt: 1 }),
    ).toBeNull();
  });
});

describe("accountAgeDays", () => {
  test("counts whole days, rounding down", () => {
    expect(accountAgeDays(0, 0)).toBe(0);
    expect(accountAgeDays(0, DAY_MS - 1)).toBe(0);
    expect(accountAgeDays(0, 30 * DAY_MS + 5)).toBe(30);
  });
});
