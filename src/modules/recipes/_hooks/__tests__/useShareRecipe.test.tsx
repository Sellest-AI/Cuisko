import { act, renderHook } from "@testing-library/react";
import { Share } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useShareRecipe } from "../useShareRecipe";

const state = vi.hoisted(() => ({ hasSession: true, record: vi.fn() }));

vi.mock("translations", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));
vi.mock("~/lib/convex/auth", () => ({ useAuthenticated: () => ({ hasSession: state.hasSession }) }));
vi.mock("~/lib/convex/client", () => ({ useMutation: () => ({ mutate: state.record }) }));

const RECIPE = { id: "k57abc", title: "Gratin" };

const openSheet = vi.spyOn(Share, "share");

beforeEach(() => {
  state.hasSession = true;
  state.record.mockReset().mockResolvedValue(undefined);
  openSheet.mockReset().mockResolvedValue({ action: Share.sharedAction });
});

describe("useShareRecipe", () => {
  it("records the share of a signed-in cook", async () => {
    const { result } = renderHook(() => useShareRecipe());

    await act(() => result.current.share(RECIPE));

    expect(openSheet).toHaveBeenCalledOnce();
    expect(state.record).toHaveBeenCalledExactlyOnceWith({ id: "k57abc" });
  });

  it("opens the sheet signed out, and records nothing", async () => {
    state.hasSession = false;
    const { result } = renderHook(() => useShareRecipe());

    await act(() => result.current.share(RECIPE));

    expect(openSheet).toHaveBeenCalledOnce();
    expect(state.record).not.toHaveBeenCalled();
  });
});
