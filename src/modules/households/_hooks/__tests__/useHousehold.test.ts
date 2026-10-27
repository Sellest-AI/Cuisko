import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "~/lib/convex/api";
import { deviceKey, writeDevice } from "~/lib/convex/deviceCache";

import { useHousehold } from "../useHousehold";

/**
 * `useHousehold` on a cold start, before Convex has confirmed the stored session: whether the
 * household on the device lets the screens below it draw. The live query is held in flight.
 */
const session = vi.hoisted(() => ({ isAuthenticated: false, isAuthenticating: true, hasSession: true }));

vi.mock("~/lib/convex/auth", () => ({ useAuthenticated: () => session }));
vi.mock("~/lib/convex/session", () => ({ useAuthenticated: () => session }));

vi.mock("convex-helpers/react/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex-helpers/react/cache")>()),
  useQueries: () => ({}),
}));

beforeEach(() => {
  localStorage.clear();
});

describe("useHousehold before Convex confirms the session", () => {
  it("is not loading when the household is on the device", () => {
    writeDevice(deviceKey(api.router.households.getMine.authed, {}), {
      data: [{ _id: "h1", name: "Rue des Lilas", isCurrent: true }],
    });

    expect(renderHook(() => useHousehold()).result.current).toEqual({ householdId: "h1", isLoading: false });
  });

  it("is loading when nothing is on the device", () => {
    expect(renderHook(() => useHousehold()).result.current).toEqual({ householdId: undefined, isLoading: true });
  });
});
