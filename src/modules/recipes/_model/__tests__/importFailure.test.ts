import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { IMPORT_FAILURES, importFailureOf } from "../importFailure";

const failed = (code: string) => new ConvexError({ code, message: "server said so" });

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

  it("words anything it does not recognise as the site not answering", () => {
    expect(importFailureOf(new Error("socket hang up"))).toBe(IMPORT_FAILURES.unreachable);
    expect(importFailureOf(failed("INTERNAL"))).toBe(IMPORT_FAILURES.unreachable);
  });
});
