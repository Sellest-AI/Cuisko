import { makeFunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The device store against the bundle it runs in. `expo-updates` is faked so each test can name
 * the bundle; the module is re-imported per test because the bundle id is read once, at load.
 */
const bundle = vi.hoisted(() => ({ runtimeVersion: "rt1", updateId: "u1" as string | null, version: "1.4.0" }));

vi.mock("expo-updates", () => ({
  get runtimeVersion() {
    return bundle.runtimeVersion;
  },
  get updateId() {
    return bundle.updateId;
  },
}));

vi.mock("~/lib/appVersion", () => ({
  get APP_VERSION() {
    return bundle.version;
  },
}));

const getMany = makeFunctionReference<"query">("planning/getMany:authed");
const getMe = makeFunctionReference<"query">("users/getMe:authed");

const load = async () => {
  vi.resetModules();
  return import("../deviceCache");
};

beforeEach(() => {
  bundle.runtimeVersion = "rt1";
  bundle.updateId = "u1";
  bundle.version = "1.4.0";
  localStorage.clear();
});

describe("deviceKey", () => {
  it("is the same whatever order the args come in", async () => {
    const { deviceKey } = await load();
    expect(deviceKey(getMany, { from: "2026-10-26", to: "2026-11-01" })).toBe(
      deviceKey(getMany, { to: "2026-11-01", from: "2026-10-26" }),
    );
  });

  it("leaves loose args out, so yesterday's window and today's are one entry", async () => {
    const { deviceKey } = await load();
    const household = "h1";
    expect(deviceKey(getMany, { householdId: household, from: "2026-10-26" }, ["from"])).toBe(
      deviceKey(getMany, { householdId: household, from: "2026-10-27" }, ["from"]),
    );
    expect(deviceKey(getMany, { householdId: "h1" }, ["from"])).not.toBe(
      deviceKey(getMany, { householdId: "h2" }, ["from"]),
    );
  });

  it("changes with the bundle, so an OTA update never reads the previous bundle's answers", async () => {
    const before = (await load()).deviceKey(getMe, {});
    bundle.updateId = "u2";
    expect((await load()).deviceKey(getMe, {})).not.toBe(before);
  });

  /** A dev build on Metro, or the web: no update id to tell one bundle from the next. */
  it("changes with the app version when the bundle has no update id", async () => {
    bundle.updateId = null;
    const before = (await load()).deviceKey(getMe, {});
    expect((await load()).deviceKey(getMe, {})).toBe(before);

    bundle.version = "1.5.0";
    expect((await load()).deviceKey(getMe, {})).not.toBe(before);
  });
});

describe("the store", () => {
  it("reads back what it wrote", async () => {
    const { deviceKey, readDevice, writeDevice } = await load();
    const key = deviceKey(getMe, {});
    writeDevice(key, { data: { name: "Camille" } });
    expect(readDevice(key)).toEqual({ data: { name: "Camille" } });
  });

  it("does not rewrite an entry whose JSON is unchanged", async () => {
    const { deviceKey, writeDevice } = await load();
    const key = deviceKey(getMe, {});
    writeDevice(key, { data: { name: "Camille" } });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    writeDevice(key, { data: { name: "Camille" } });
    expect(setItem).not.toHaveBeenCalled();
    writeDevice(key, { data: { name: "Sacha" } });
    expect(setItem).toHaveBeenCalledOnce();
  });

  it("reads a corrupt entry as a miss, and drops it", async () => {
    const { deviceKey, readDevice, writeDevice } = await load();
    const key = deviceKey(getMe, {});
    writeDevice(key, { data: 1 });
    const stored = Object.keys(localStorage).find((name) => name.endsWith(key))!;
    localStorage.setItem(stored, '{"args":{},"da');
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(readDevice(key)).toBeUndefined();
    expect(localStorage.getItem(stored)).toBeNull();
  });

  it("prunes the keys of other bundles at load, and keeps its own", async () => {
    const old = await load();
    const oldKey = old.deviceKey(getMe, {});
    old.writeDevice(oldKey, { data: "old" });

    bundle.updateId = "u2";
    const next = await load();
    const nextKey = next.deviceKey(getMe, {});
    next.writeDevice(nextKey, { data: "new" });
    expect(next.readDevice(oldKey)).toBeUndefined();

    const again = await load();
    expect(again.readDevice(nextKey)).toEqual({ data: "new" });
  });

  it("clears every entry", async () => {
    const { clearDeviceCache, deviceKey, readDevice, writeDevice } = await load();
    const me = deviceKey(getMe, {});
    const plan = deviceKey(getMany, { householdId: "h1" });
    writeDevice(me, { data: 1 });
    writeDevice(plan, { data: 2 });

    clearDeviceCache();
    expect(readDevice(me)).toBeUndefined();
    expect(readDevice(plan)).toBeUndefined();
  });
});
