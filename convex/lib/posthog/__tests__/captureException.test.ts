import { beforeEach, describe, expect, test, vi } from "vitest";

import { captureException } from "../captureException";

const captureExceptionMock = vi.hoisted(() => vi.fn());
vi.mock("../client", () => ({ posthog: { captureException: captureExceptionMock } }));

const ctx = { scheduler: {} as never };

/** Marmiton redesigned its search page while Camille asked for a tartiflette. */
const SEARCH_FAILED = { source: "marmiton", reason: "parse", feature: "web recipe search" } as const;

beforeEach(() => captureExceptionMock.mockReset());

describe("captureException", () => {
  test("sends the error itself and its properties, under the cook", async () => {
    const error = new Error("A Marmiton search card has a rating block this parser cannot read");

    await captureException(ctx, { error, distinctId: "camille", properties: SEARCH_FAILED });

    expect(captureExceptionMock.mock.calls[0]![1]).toEqual({
      error,
      distinctId: "camille",
      additionalProperties: SEARCH_FAILED,
    });
  });

  /** The message stays fixed per cause, so one redesign is one issue; the card it broke on rides along. */
  test("sends a plain-object cause as properties, the caller's winning a clash", async () => {
    const error = Object.assign(new Error("A Marmiton search card has a rating block this parser cannot read"), {
      cause: { url: "https://www.marmiton.org/recettes/recette_tartiflette_1.aspx", reason: "from the cause" },
    });

    await captureException(ctx, { error, distinctId: "camille", properties: SEARCH_FAILED });

    expect(captureExceptionMock.mock.calls[0]![1].additionalProperties).toEqual({
      url: "https://www.marmiton.org/recettes/recette_tartiflette_1.aspx",
      ...SEARCH_FAILED,
    });
  });

  /** A column a chart can group by, as on an event: a nested object or a list never reaches PostHog. */
  test("sends only a cause's flat values", async () => {
    const error = Object.assign(new Error("A Marmiton search card has a rating block this parser cannot read"), {
      cause: { rating: 4.6, reviewed: true, card: { title: "Tartiflette" }, ingredients: ["reblochon"] },
    });

    await captureException(ctx, { error, distinctId: "camille", properties: SEARCH_FAILED });

    expect(captureExceptionMock.mock.calls[0]![1].additionalProperties).toEqual({ rating: 4.6, reviewed: true, ...SEARCH_FAILED });
  });

  test("leaves a cause that is itself an error out of the properties", async () => {
    const error = Object.assign(new Error("Marmiton could not be searched"), { cause: new Error("socket hang up") });

    await captureException(ctx, { error, distinctId: "camille", properties: SEARCH_FAILED });

    expect(captureExceptionMock.mock.calls[0]![1].additionalProperties).toEqual(SEARCH_FAILED);
  });

  /** The caller is already failing: reporting it must not replace its error with PostHog's. */
  test("logs a scheduling failure instead of throwing it", async () => {
    captureExceptionMock.mockRejectedValueOnce(new Error("scheduler unavailable"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      captureException(ctx, { error: new Error("Marmiton could not be searched"), distinctId: "camille", properties: SEARCH_FAILED }),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledOnce();

    logged.mockRestore();
  });
});
