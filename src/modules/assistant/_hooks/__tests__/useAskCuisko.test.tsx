import { act, render, renderHook } from "@testing-library/react";
import { createStore, Provider, useAtomValue } from "jotai";
import { type ReactNode, useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pendingQuestionAtom, refusalAtom } from "../atoms";
import { useAskCuisko } from "../useAskCuisko";
import { useCuiskoContext } from "../useCuiskoContext";

/**
 * What a question does when the server declines it, and what it carries when the assistant was
 * opened from the stove.
 *
 * A refused question leaves no message behind, so the hook is the only place that can say so: it
 * must put the refusal where the transcript will draw it, and clear the pending bubble that said
 * the question was on its way. Any other failure stays a log line, as it was before limits.
 *
 * The collaborators that need a Convex provider are mocked at their seams; what is under test is
 * this hook's branch on the error, and the context it sends.
 */
const send = vi.hoisted(() => vi.fn());
const restorePhoto = vi.hoisted(() => vi.fn());

vi.mock("~/hooks/useLocale", () => ({ useLocale: () => "fr" }));
vi.mock("~/lib/convex/client", () => ({
  useMutation: () => ({ mutate: send }),
  useAction: () => ({ action: vi.fn() }),
}));
vi.mock("~/modules/households/hooks", () => ({ useHousehold: () => ({ householdId: "household-1" }) }));
vi.mock("~/modules/navigation/hooks", () => ({
  useStagedPhoto: () => ({ unstage: () => undefined, restore: restorePhoto }),
}));

const asking = () =>
  renderHook(
    () => ({
      ask: useAskCuisko().ask,
      refusal: useAtomValue(refusalAtom),
      pending: useAtomValue(pendingQuestionAtom),
    }),
    { wrapper: Provider },
  );

/** The cooking screen's push: a gratin, on its third step, for two. */
const FROM_THE_STOVE = { recipeId: "k17gratin", step: "3", servings: "2" };

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ threadId: "thread-1" });
  restorePhoto.mockReset();
});

describe("modules/assistant useAskCuisko", () => {
  it("records a refusal, and takes the pending question down", async () => {
    send.mockRejectedValue({ data: { code: "RATE_LIMITED" } });
    const { result } = asking();

    await act(() => result.current.ask("Que faire avec des poireaux ?"));

    expect(typeof result.current.refusal?.at).toBe("number");
    expect(result.current.pending).toBeUndefined();
  });

  it("leaves any other failure as a log line, with no refusal drawn", async () => {
    send.mockRejectedValue(new Error("the network dropped"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = asking();

    await act(() => result.current.ask("Que faire avec des poireaux ?"));

    expect(result.current.refusal).toBeUndefined();
    expect(result.current.pending).toBeUndefined();
    expect(logged).toHaveBeenCalled();
  });

  it("records no refusal when the question was taken", async () => {
    const { result } = asking();

    await act(() => result.current.ask("Que faire avec des poireaux ?"));

    expect(result.current.refusal).toBeUndefined();
  });

  it("sends no recipe when the assistant was not opened from one", async () => {
    const { result } = asking();

    await act(() => result.current.ask("Que faire avec des poireaux ?"));

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ recipe: undefined }));
  });
});

describe("modules/assistant useCuiskoContext", () => {
  /** A follow-up typed in the bar: a sender beside the route, not inside it. */
  it("every question asked while the assistant is open carries the recipe it was opened with", async () => {
    const { result } = renderHook(
      () => {
        useCuiskoContext(FROM_THE_STOVE);
        return useAskCuisko();
      },
      { wrapper: Provider },
    );

    await act(() => result.current.ask("Et si je n'ai pas de crème ?"));

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ recipe: { id: "k17gratin", step: 3, servings: 2 } }));
  });

  /**
   * The screen sends the question it was opened with from its own mount effect, and a child's
   * effects run before its parent's: a context published in an effect sent that first question
   * without the recipe.
   */
  it("is in place for the question the screen sends as it mounts", async () => {
    const Screen = () => {
      const { ask } = useAskCuisko();
      useEffect(() => void ask("Combien de sel ?"), []); // eslint-disable-line react-hooks/exhaustive-deps
      return null;
    };
    const Route = () => {
      useCuiskoContext(FROM_THE_STOVE);
      return <Screen />;
    };

    await act(async () => void render(<Provider><Route /></Provider>));

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ recipe: { id: "k17gratin", step: 3, servings: 2 } }));
  });

  it("closing the assistant forgets the recipe", async () => {
    const store = createStore();
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
    const route = renderHook(() => useCuiskoContext(FROM_THE_STOVE), { wrapper });
    const bar = renderHook(() => useAskCuisko(), { wrapper });

    route.unmount();
    await act(() => bar.result.current.ask("Une idée pour demain ?"));

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ recipe: undefined }));
  });
});
