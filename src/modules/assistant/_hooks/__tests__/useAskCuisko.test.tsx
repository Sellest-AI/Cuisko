import { act, renderHook } from "@testing-library/react";
import { Provider, useAtomValue } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pendingQuestionAtom, refusalAtom } from "../atoms";
import { useAskCuisko } from "../useAskCuisko";

/**
 * What a question does when the server declines it.
 *
 * A refused question leaves no message behind, so the hook is the only place that can say so: it
 * must put the refusal where the transcript will draw it, and clear the pending bubble that said
 * the question was on its way. Any other failure stays a log line, as it was before limits.
 *
 * The collaborators that need a Convex provider are mocked at their seams; what is under test is
 * this hook's branch on the error.
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

beforeEach(() => {
  send.mockReset();
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
    send.mockResolvedValue({ threadId: "thread-1" });
    const { result } = asking();

    await act(() => result.current.ask("Que faire avec des poireaux ?"));

    expect(result.current.refusal).toBeUndefined();
  });
});
