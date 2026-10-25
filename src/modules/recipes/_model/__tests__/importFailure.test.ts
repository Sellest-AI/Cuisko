import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { IMPORT_FAILURES, importFailureOf, isConnectionLost, isScrapeLost, scrapeLost } from "../importFailure";

const failed = (code: string) => new ConvexError({ code, message: "server said so" });

describe("isConnectionLost", () => {
  it("recognises the Convex client dropping an action on reconnect", () => {
    expect(isConnectionLost(new Error("Connection lost while action was in flight"))).toBe(true);
  });

  it("is false for a failure the server answered, or any other error", () => {
    expect(isConnectionLost(failed("NOT_A_RECIPE"))).toBe(false);
    expect(isConnectionLost(new Error("socket hang up"))).toBe(false);
    expect(isConnectionLost(null)).toBe(false);
  });

  /** `startImport` holds a lost call for its answer; a lost scrape has none coming, so it is not one. */
  it("is false for a scrape lost with the connection", () => {
    expect(isConnectionLost(scrapeLost())).toBe(false);
  });
});

describe("isScrapeLost", () => {
  it("is told by its tag, not by its message", () => {
    expect(isScrapeLost(scrapeLost())).toBe(true);
    expect(isScrapeLost(new Error(scrapeLost().message))).toBe(false);
    expect(isScrapeLost(new Error("Connection lost while action was in flight"))).toBe(false);
    expect(isScrapeLost(null)).toBe(false);
  });
});

describe("importFailureOf", () => {
  it("has nothing to say when nothing failed", () => {
    expect(importFailureOf(null)).toBeUndefined();
    expect(importFailureOf(undefined)).toBeUndefined();
  });

  it.each([
    ["UNREADABLE_PAGE", IMPORT_FAILURES.unreadable],
    ["NOT_A_VIDEO", IMPORT_FAILURES.notVideo],
    ["NOT_A_RECIPE", IMPORT_FAILURES.notRecipe],
    ["NOT_FOUND", IMPORT_FAILURES.notFound],
    ["IMPORT_UNAVAILABLE", IMPORT_FAILURES.unavailable],
    ["VIDEO_TOO_LARGE", IMPORT_FAILURES.tooLarge],
    ["RATE_LIMITED", IMPORT_FAILURES.limited],
    ["EXTERNAL_SERVICE_ERROR", IMPORT_FAILURES.unreachable],
  ])("words %s as its own sentence", (code, failure) => {
    expect(importFailureOf(failed(code))).toBe(failure);
  });

  it("reads INVALID_INPUT as a bad address on the web path, and an unsupported app on the video path", () => {
    expect(importFailureOf(failed("INVALID_INPUT"), "web")).toBe(IMPORT_FAILURES.invalid);
    expect(importFailureOf(failed("INVALID_INPUT"), "video")).toBe(IMPORT_FAILURES.unsupported);
  });

  it("keeps the paste-a-link screen's reading when no path is given", () => {
    expect(importFailureOf(failed("INVALID_INPUT"))).toBe(IMPORT_FAILURES.invalid);
  });

  it("words a lost scrape as the connection, never as the site", () => {
    expect(importFailureOf(scrapeLost(), "web")).toBe(IMPORT_FAILURES.scrapeLost);
  });

  it("words anything it does not recognise as the site not answering", () => {
    expect(importFailureOf(new Error("socket hang up"))).toBe(IMPORT_FAILURES.unreachable);
    expect(importFailureOf(failed("INTERNAL"))).toBe(IMPORT_FAILURES.unreachable);
  });
});
