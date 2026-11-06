import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above this by the transform, so the helper still loads against the mocks.
import { askForReview } from "../askForReview";

/**
 * What this file pins: the system's few sheets are not spent in a burst, and a request that shows
 * nothing does not use up the wait. The store is a map, and the native module a counter.
 */
const device = vi.hoisted(() => ({
  stored: new Map<string, number>(),
  isAvailable: true,
  fails: false,
  storeFails: false,
  requests: 0,
}));

vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getNumber: (key: string) => {
      if (device.storeFails) throw new Error("store unreadable");
      return device.stored.get(key);
    },
    set: (key: string, value: number) => device.stored.set(key, value),
  }),
}));

vi.mock("expo-store-review", () => ({
  isAvailableAsync: () => Promise.resolve(device.isAvailable),
  requestReview: () => {
    device.requests += 1;
    return device.fails ? Promise.reject(new Error("no foreground scene")) : Promise.resolve();
  },
}));

const DAY_MS = 24 * 60 * 60_000;
const SETTLE_MS = 1_500;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  device.stored.clear();
  device.isAvailable = true;
  device.fails = false;
  device.storeFails = false;
  device.requests = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("askForReview", () => {
  it("waits for the screen to settle before it asks", async () => {
    askForReview();

    await vi.advanceTimersByTimeAsync(SETTLE_MS - 1);
    expect(device.requests).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(device.requests).toBe(1);
  });

  it("makes one ask of two successes in the same moment", async () => {
    askForReview();
    askForReview();

    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(device.requests).toBe(1);
  });

  it("does not ask again until the wait is over", async () => {
    askForReview();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    await vi.advanceTimersByTimeAsync(121 * DAY_MS);
    askForReview();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(device.requests).toBe(1);

    await vi.advanceTimersByTimeAsync(DAY_MS);
    askForReview();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(device.requests).toBe(2);
  });

  it("gives the ask back when the request fails", async () => {
    device.fails = true;
    askForReview();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    device.fails = false;
    askForReview();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(device.requests).toBe(2);
  });

  it("starts the wait only once the request went out, so an app killed before it spends nothing", async () => {
    askForReview();

    await vi.advanceTimersByTimeAsync(SETTLE_MS - 1);
    expect(device.stored.size).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(device.stored.size).toBe(1);
  });

  it("does not throw into its caller when the store fails", async () => {
    device.storeFails = true;

    expect(() => askForReview()).not.toThrow();

    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(device.requests).toBe(0);
  });

  it("does not request on a device that has no review sheet", async () => {
    device.isAvailable = false;
    askForReview();

    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(device.requests).toBe(0);
  });
});
