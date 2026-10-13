import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "../../../_generated/dataModel";
import { REVIEW_ACCOUNT } from "../../auth/reviewAccount";
import { accountAgeDays, captureAccountEvent } from "../captureAccountEvent";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@convex/lib/posthog/client", () => ({ posthog: { capture } }));

const ctx = { scheduler: {} as never };
const camille = { _id: "camille" as Id<"users"> };
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => capture.mockReset());

describe("captureAccountEvent", () => {
  test("schedules one event on the cook's users id, with only the properties it was given", async () => {
    await captureAccountEvent(ctx, { user: camille, event: "account deleted", properties: { outcome: "anonymized" } });

    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0]![1]).toEqual({
      distinctId: "camille",
      event: "account deleted",
      properties: { outcome: "anonymized" },
    });
  });

  test("adds the account's age when its creation time is known, and only the id and numbers", async () => {
    const createdAt = Date.now() - 12 * DAY_MS - 1000;
    await captureAccountEvent(ctx, {
      user: { ...camille, _creationTime: createdAt, email: "camille@example.com" },
      event: "account deletion requested",
      properties: { deletionDueAt: 1 },
    });

    expect(capture.mock.calls[0]![1]).toEqual({
      distinctId: "camille",
      event: "account deletion requested",
      properties: { accountAgeDays: 12, deletionDueAt: 1 },
    });
  });

  /** App Review deletes and restores this account at every submission: counted, it reads as cooks leaving. */
  test("sends nothing for the store reviewer's shared account", async () => {
    await captureAccountEvent(ctx, {
      user: { ...camille, email: REVIEW_ACCOUNT.email },
      event: "account deletion requested",
      properties: { deletionDueAt: 1 },
    });

    expect(capture).not.toHaveBeenCalled();
  });

  /** The deletion it reports must go on: analytics is an add-on. */
  test("logs a capture that throws instead of throwing it", async () => {
    capture.mockRejectedValueOnce(new Error("scheduler unavailable"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      captureAccountEvent(ctx, { user: camille, event: "account deletion requested", properties: { deletionDueAt: 1 } }),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledOnce();

    logged.mockRestore();
  });
});

describe("accountAgeDays", () => {
  test("counts whole days, rounding down", () => {
    expect(accountAgeDays(0, 0)).toBe(0);
    expect(accountAgeDays(0, DAY_MS - 1)).toBe(0);
    expect(accountAgeDays(0, 30 * DAY_MS + 5)).toBe(30);
  });
});
