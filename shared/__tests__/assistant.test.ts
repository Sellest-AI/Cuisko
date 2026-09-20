import { describe, expect, test } from "vitest";

import { ASSISTANT_IDLE_MS, isConversationStale } from "../assistant";

/** An arbitrary instant to measure from. Nothing here depends on which one. */
const NOW = 1_700_000_000_000;

const agedBy = (ms: number) => NOW - ms;

describe("isConversationStale", () => {
  test("a conversation touched a moment ago is warm", () => {
    expect(isConversationStale(agedBy(0), NOW)).toBe(false);
    expect(isConversationStale(agedBy(1000), NOW)).toBe(false);
  });

  test("a conversation touched an hour ago is stale", () => {
    expect(isConversationStale(agedBy(60 * 60 * 1000), NOW)).toBe(true);
  });

  /**
   * The assertion this file exists for. One millisecond either side of the window is the only place
   * the two callers could disagree, and they must not: the screen decides whether to DRAW a held
   * conversation and the server decides whether to CONTINUE it. A boundary read one way on the
   * phone and the other on the deployment shows a shopper an empty screen whose next message is
   * silently appended to the thread they were just told they no longer had.
   */
  test("the boundary belongs to the cold side", () => {
    expect(isConversationStale(agedBy(ASSISTANT_IDLE_MS - 1), NOW)).toBe(false);
    expect(isConversationStale(agedBy(ASSISTANT_IDLE_MS), NOW)).toBe(true);
  });

  /**
   * A phone whose clock is behind the server's produces a negative age. It must read as warm rather
   * than wrap round to stale — losing context over a clock skew is the wrong failure.
   */
  test("a timestamp in the future is warm, not stale", () => {
    expect(isConversationStale(NOW + 60_000, NOW)).toBe(false);
  });
});
