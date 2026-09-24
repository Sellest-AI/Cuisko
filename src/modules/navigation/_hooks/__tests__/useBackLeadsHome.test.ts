import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBackLeadsHome } from "../useBackLeadsHome";

type NavigationTree = { index?: number; routes: { name: string; state?: NavigationTree }[] };

/** The container the hook reads. `undefined` stands for a navigator that is not ready yet. */
const container = vi.hoisted(() => ({ root: undefined as unknown }));

vi.mock("expo-router", () => ({
  usePathname: () => "/groceries",
  useNavigationContainerRef: () => ({
    isReady: () => container.root !== undefined,
    getRootState: () => container.root,
  }),
}));

/** The container state Expo Router builds: the app's stack inside its `__root` slot. */
const inSlot = (stack: NavigationTree): NavigationTree => ({ index: 0, routes: [{ name: "__root", state: stack }] });

const stack = (...names: string[]): NavigationTree => ({ index: names.length - 1, routes: names.map((name) => ({ name })) });

const leadsHome = (root: NavigationTree | undefined) => {
  container.root = root;
  return renderHook(() => useBackLeadsHome()).result.current;
};

describe("useBackLeadsHome", () => {
  beforeEach(() => {
    container.root = undefined;
  });

  it("is true when the page behind is home", () => {
    expect(leadsHome(inSlot(stack("index", "groceries")))).toBe(true);
  });

  it("is false when the page behind is another page", () => {
    expect(leadsHome(inSlot(stack("index", "recipes", "groceries")))).toBe(false);
  });

  it("is true when nothing is behind, because the button dismisses to home", () => {
    expect(leadsHome(inSlot(stack("groceries")))).toBe(true);
  });

  it("is false when a nested navigator absorbs the back", () => {
    const nested: NavigationTree = {
      index: 1,
      routes: [{ name: "index" }, { name: "recipe/[id]", state: stack("index", "ingredients") }],
    };
    expect(leadsHome(inSlot(nested))).toBe(false);
  });

  it("reads a nested state that leaves its index out as focused on its last route", () => {
    const nested: NavigationTree = { index: 1, routes: [{ name: "index" }, { name: "planning", state: { routes: [{ name: "index" }, { name: "new" }] } }] };
    expect(leadsHome(inSlot(nested))).toBe(false);
  });

  it("reads a state without the `__root` slot as the app's stack itself", () => {
    expect(leadsHome(stack("index", "groceries"))).toBe(true);
    expect(leadsHome(stack("index", "recipes", "groceries"))).toBe(false);
  });

  it("is true before the navigator is ready", () => {
    expect(leadsHome(undefined)).toBe(true);
  });
});
