import { renderHook } from "@testing-library/react";
import { makeFunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryCached, useQueryDevice } from "../client";
import { deviceKey, readDevice, writeDevice } from "../deviceCache";

/**
 * The device option against each state the live query passes through. The Convex side is faked at
 * `useQueries`, the one hook the wrapper calls: `server.answer` is what the subscription holds
 * (`undefined` in flight, an `Error` when it threw), `server.asked` the args it was opened with.
 */
const server = vi.hoisted(() => ({
  isAuthenticated: false,
  answer: undefined as unknown,
  asked: [] as unknown[],
}));

vi.mock("../session", () => ({ useAuthenticated: () => ({ isAuthenticated: server.isAuthenticated }) }));

vi.mock("convex-helpers/react/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex-helpers/react/cache")>()),
  useQueries: (queries: { data?: { args: unknown } }) => {
    if (!queries.data) return {};
    server.asked.push(queries.data.args);
    return { data: server.answer };
  },
}));

const getMany = makeFunctionReference<"query", { householdId: string; from: string; to: string }>(
  "planning/getMany:authed",
);
const getMine = makeFunctionReference<"query", Record<string, never>>("households/getMine:authed");
const ingredients = makeFunctionReference<"query", { ids: string[]; locale: string }>("ingredients/list:anon");

const WEEK = { householdId: "h1", from: "2026-10-26", to: "2026-11-01" };
const NEXT_MORNING = { householdId: "h1", from: "2026-10-27", to: "2026-11-02" };
const MEALS = [{ day: "2026-10-27", recipe: "Œufs cocotte" }];

const store = (args: Record<string, unknown>, data: unknown, loose?: readonly string[]) =>
  writeDevice(deviceKey(getMany, args, loose), { data });

beforeEach(() => {
  server.isAuthenticated = false;
  server.answer = undefined;
  server.asked = [];
  localStorage.clear();
});

describe("useQueryDevice", () => {
  it('reads nothing and asks nothing on "skip"', () => {
    store(WEEK, MEALS);
    server.isAuthenticated = true;
    const { result } = renderHook(() => useQueryDevice(getMany, "skip"));

    expect(result.current).toMatchObject({ status: "pending", data: undefined, isFromDevice: false });
    expect(server.asked).toEqual([]);
  });

  it("serves the stored answer before Convex has confirmed the cook, and asks nothing", () => {
    store(WEEK, MEALS);
    const { result } = renderHook(() => useQueryDevice(getMany, WEEK));

    expect(result.current).toMatchObject({ status: "success", data: MEALS, isFromDevice: true });
    expect(server.asked).toEqual([]);
  });

  /** An `anon` query needs no token: waiting for one only delays what any visitor may read. */
  it("asks an anon query before Convex has confirmed the cook", () => {
    const names = { ids: ["egg"], locale: "fr" };
    renderHook(() => useQueryDevice(ingredients, names, { loose: ["ids"] }));

    expect(server.asked).toContainEqual(names);
  });

  it("is pending before Convex has confirmed the cook when nothing is stored", () => {
    const { result } = renderHook(() => useQueryDevice(getMany, WEEK));
    expect(result.current).toMatchObject({ status: "pending", isFromDevice: false });
  });

  it("keeps serving the stored answer while the first live one is in flight", () => {
    store(WEEK, MEALS);
    server.isAuthenticated = true;
    const { result } = renderHook(() => useQueryDevice(getMany, WEEK));

    expect(result.current).toMatchObject({ status: "success", data: MEALS, isFromDevice: true });
    expect(server.asked).toContainEqual(WEEK);
  });

  it("is pending while the first live answer is in flight when nothing is stored", () => {
    server.isAuthenticated = true;
    const { result } = renderHook(() => useQueryDevice(getMany, WEEK));
    expect(result.current).toMatchObject({ status: "pending", isFromDevice: false });
  });

  it("returns the live answer once it lands, and writes it through", () => {
    store(WEEK, MEALS);
    server.isAuthenticated = true;
    const fresh = [{ day: "2026-10-27", recipe: "Gratin dauphinois" }];
    server.answer = fresh;
    const { result } = renderHook(() => useQueryDevice(getMany, WEEK));

    expect(result.current).toMatchObject({ status: "success", data: fresh, isFromDevice: false });
    expect(readDevice(deviceKey(getMany, WEEK))).toEqual({ data: fresh });
  });

  it("returns the error when the live query throws, and drops the stored answer", () => {
    store(WEEK, MEALS);
    server.isAuthenticated = true;
    server.answer = new Error("household left");
    const { result } = renderHook(() => useQueryDevice(getMany, WEEK));

    expect(result.current).toMatchObject({ status: "error", data: undefined, isFromDevice: false });
    expect(readDevice(deviceKey(getMany, WEEK))).toBeUndefined();
  });

  it("serves yesterday's window the next morning, then overwrites that one entry", () => {
    const loose = ["from", "to"] as const;
    store(WEEK, MEALS, loose);
    const { result, rerender } = renderHook(() =>
      useQueryDevice(getMany, NEXT_MORNING, { loose }),
    );
    expect(result.current).toMatchObject({ status: "success", data: MEALS, isFromDevice: true });

    const fresh = [{ day: "2026-11-02", recipe: "Soupe au potiron" }];
    server.isAuthenticated = true;
    server.answer = fresh;
    rerender();

    const entries = Object.keys(localStorage).filter((name) => name.includes("planning/getMany"));
    expect(entries).toHaveLength(1);
    expect(readDevice(deviceKey(getMany, NEXT_MORNING, loose))).toEqual({ data: fresh });
  });
});

describe("useQueryCached", () => {
  it("is the live query, unchanged: it asks before any confirmation and never touches the device", () => {
    writeDevice(deviceKey(getMine, {}), { data: ["stored"] });
    const { result } = renderHook(() => useQueryCached(getMine, {}));

    expect(result.current).toMatchObject({ status: "pending", data: undefined });
    expect(result.current).not.toHaveProperty("isFromDevice");
    expect(server.asked).toEqual([{}]);
  });
});

describe("useQueryDevice with hold", () => {
  it("keeps the last answer while the next args load, and holds nothing on skip", () => {
    const fresh = [{ day: "2026-10-27", recipe: "Gratin dauphinois" }];
    server.isAuthenticated = true;
    server.answer = fresh;
    let args: typeof WEEK | "skip" = WEEK;
    const { result, rerender } = renderHook(() => useQueryDevice(getMany, args, { hold: true }));

    server.answer = undefined;
    args = NEXT_MORNING;
    rerender();
    expect(result.current).toMatchObject({ data: fresh, isStale: true, isFromDevice: false });

    args = "skip";
    rerender();
    expect(result.current).toMatchObject({ data: undefined, isStale: false });
  });
});
