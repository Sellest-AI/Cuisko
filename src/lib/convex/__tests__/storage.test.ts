import { beforeEach, describe, expect, it, vi } from "vitest";

/** The Keystore faked as a map, so a read answers what the last write left. */
const state = vi.hoisted(() => ({ store: new Map<string, string>(), reads: [] as string[] }));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("env", () => ({ env: { EXPO_PUBLIC_CONVEX_URL: "https://cuisko-dev.convex.cloud" } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => {
    state.reads.push(key);
    return state.store.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => void state.store.set(key, value),
  deleteItemAsync: async (key: string) => void state.store.delete(key),
}));

const JWT = "__convexAuthJWT_cuisko-devconvexcloud";

/** A fresh module per test, the prefetch already asked for as the root layout does. */
const load = async () => {
  vi.resetModules();
  const { convexAuthStorage, prefetchAuthToken } = await import("../storage");
  prefetchAuthToken();
  return convexAuthStorage;
};

beforeEach(() => {
  state.store = new Map([[JWT, "jwt-stored-before-launch"]]);
  state.reads = [];
});

describe("convexAuthStorage — the JWT read at launch", () => {
  it("reads nothing when it loads: the root layout says when", async () => {
    vi.resetModules();
    await import("../storage");

    expect(state.reads).toEqual([]);
  });

  it("asks the Keystore for the JWT once prefetched, before anyone reads it", async () => {
    await load();

    expect(state.reads).toEqual([JWT]);
  });

  it("prefetches once, however many times it is asked to", async () => {
    vi.resetModules();
    const { prefetchAuthToken } = await import("../storage");
    prefetchAuthToken();
    prefetchAuthToken();

    expect(state.reads).toEqual([JWT]);
  });

  it("serves that read to Convex Auth's first ask, without a second trip", async () => {
    const storage = await load();

    expect(await storage.getItem(JWT)).toBe("jwt-stored-before-launch");
    expect(state.reads).toEqual([JWT]);
  });

  it("serves it once: the next ask reads the Keystore again", async () => {
    const storage = await load();
    await storage.getItem(JWT);
    state.store.set(JWT, "jwt-refreshed");

    expect(await storage.getItem(JWT)).toBe("jwt-refreshed");
  });

  it("drops it when a sign-in writes a new JWT first", async () => {
    const storage = await load();
    await storage.setItem(JWT, "jwt-from-sign-in");

    expect(await storage.getItem(JWT)).toBe("jwt-from-sign-in");
  });

  it("drops it when a sign-out clears the session first", async () => {
    const storage = await load();
    await storage.clear();

    expect(await storage.getItem(JWT)).toBeNull();
  });
});
