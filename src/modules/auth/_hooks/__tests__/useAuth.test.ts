import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "../useAuth";

/**
 * The OAuth round-trip, through the real `useAuth` and the real `useAuthActions` beneath it.
 *
 * What is faked is the vendor edge only: @convex-dev/auth's `signIn`, the system browser sheet,
 * and `Platform`. The rules under test live above that line — a closed sheet is not an error, a
 * return without a code is, and `pendingProvider` is cleared however the attempt ends.
 */
const state = vi.hoisted(() => ({
  os: "ios" as "ios" | "android" | "web",
  signIn: vi.fn(),
  openAuthSession: vi.fn(),
  signedIn: false,
  /** What the backend answers for the review account: `undefined` is still loading, `null` is closed. */
  reviewAccount: undefined as { email: string; password: string } | null | undefined,
  reviewQueryArgs: [] as unknown[],
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: state.signIn, signOut: vi.fn() }),
  useAuthToken: () => (state.signedIn ? "token" : null),
}));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useConvexAuth: () => ({ isAuthenticated: state.signedIn, isLoading: false }),
}));

vi.mock("~/lib/appVersion", () => ({ APP_VERSION: "0.2.0" }));

vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: state.openAuthSession }));
vi.mock("expo-linking", () => ({ createURL: () => "cuisko://" }));
vi.mock("react-native", () => ({ Platform: { get OS() { return state.os; } } }));

vi.mock("~/lib/convex/storage", () => ({ convexAuthStorage: { clear: vi.fn() } }));
vi.mock("~/lib/convex/client", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQueryCached: (query: Parameters<typeof getFunctionName>[0], ...args: unknown[]) => {
      if (getFunctionName(query) !== "router/auth/getReviewAccount:anon")
        return { data: undefined, isPending: true };
      state.reviewQueryArgs = args;
      return { data: state.reviewAccount, isPending: state.reviewAccount === undefined };
    },
  };
});

vi.mock("translations", () => ({
  useTranslations: () => (key: string, vars?: { name: string }) =>
    vars ? `${key}:${vars.name}` : key,
}));

const PROVIDER_URL = new URL("https://cuisko-test.convex.site/api/auth/signin/google?code=verifier");
const PROVIDER_ERROR = "error_provider_x_name:Google";

beforeEach(() => {
  state.os = "ios";
  state.signIn.mockReset().mockResolvedValue({ signingIn: false, redirect: PROVIDER_URL });
  state.openAuthSession.mockReset();
  state.signedIn = false;
  state.reviewAccount = undefined;
  state.reviewQueryArgs = [];
  // A failed attempt logs under __DEV__; the assertions are on `error`, not on the console.
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const signInWithGoogle = async () => {
  const { result } = renderHook(() => useAuth());
  await act(() => result.current.signInWithProvider("google"));
  return result;
};

describe("useAuth.signInWithProvider — native", () => {
  it("opens the provider in an auth session and trades the returned code", async () => {
    state.openAuthSession.mockResolvedValue({ type: "success", url: "cuisko://?code=abc123" });

    const result = await signInWithGoogle();

    expect(state.signIn).toHaveBeenNthCalledWith(1, "google", { redirectTo: "cuisko://" });
    expect(state.openAuthSession).toHaveBeenCalledWith(PROVIDER_URL.toString(), "cuisko://");
    expect(state.signIn).toHaveBeenNthCalledWith(2, "google", { code: "abc123" });
    expect(result.current.error).toBeNull();
    expect(result.current.pendingProvider).toBeNull();
  });

  it("treats a closed sheet as a change of mind, not an error", async () => {
    state.openAuthSession.mockResolvedValue({ type: "cancel" });

    const result = await signInWithGoogle();

    expect(state.signIn).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.pendingProvider).toBeNull();
  });

  it("reports a return without a code — the provider refused consent", async () => {
    state.openAuthSession.mockResolvedValue({ type: "success", url: "cuisko://?error=access_denied" });

    const result = await signInWithGoogle();

    expect(state.signIn).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(PROVIDER_ERROR);
    expect(result.current.pendingProvider).toBeNull();
  });

  it("reports a rejected code exchange", async () => {
    state.openAuthSession.mockResolvedValue({ type: "success", url: "cuisko://?code=stale" });
    state.signIn
      .mockResolvedValueOnce({ signingIn: false, redirect: PROVIDER_URL })
      .mockRejectedValueOnce(new Error("Invalid verification code"));

    const result = await signInWithGoogle();

    expect(result.current.error).toBe(PROVIDER_ERROR);
    expect(result.current.pendingProvider).toBeNull();
  });

  it("reports a provider the server rejects, without opening a browser", async () => {
    state.signIn.mockRejectedValue(new Error("Provider google is not configured"));

    const result = await signInWithGoogle();

    expect(state.openAuthSession).not.toHaveBeenCalled();
    expect(result.current.error).toBe(PROVIDER_ERROR);
    expect(result.current.pendingProvider).toBeNull();
  });

  it("holds pendingProvider for the whole round-trip, then clears it", async () => {
    let finishSession: (value: { type: "cancel" }) => void = () => undefined;
    state.openAuthSession.mockReturnValue(new Promise((resolve) => (finishSession = resolve)));

    const { result } = renderHook(() => useAuth());
    let attempt: Promise<void> = Promise.resolve();
    act(() => {
      attempt = result.current.signInWithProvider("google");
    });

    expect(result.current.pendingProvider).toBe("google");

    await act(async () => {
      finishSession({ type: "cancel" });
      await attempt;
    });

    expect(result.current.pendingProvider).toBeNull();
  });
});

describe("useAuth.signInWithProvider — web", () => {
  it("leaves the navigation to the SDK and never opens a sheet", async () => {
    state.os = "web";

    const result = await signInWithGoogle();

    expect(state.signIn).toHaveBeenCalledTimes(1);
    expect(state.openAuthSession).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.pendingProvider).toBeNull();
  });
});

describe("useAuth.signIn — password", () => {
  const CREDENTIALS = { email: "cook@example.com", password: "hunter22" };

  const connect = async () => {
    const { result } = renderHook(() => useAuth());
    await act(() => result.current.signIn(CREDENTIALS));
    return result;
  };

  it("signs a known account in without trying to create it", async () => {
    state.signIn.mockResolvedValue({ signingIn: true });

    const result = await connect();

    expect(state.signIn).toHaveBeenCalledTimes(1);
    expect(state.signIn).toHaveBeenCalledWith("password", { ...CREDENTIALS, flow: "signIn" });
    expect(result.current.error).toBeNull();
  });

  it("creates the account when the email has none", async () => {
    state.signIn
      .mockRejectedValueOnce(new Error("InvalidAccountId"))
      .mockResolvedValueOnce({ signingIn: true });

    const result = await connect();

    expect(state.signIn).toHaveBeenNthCalledWith(2, "password", { ...CREDENTIALS, flow: "signUp" });
    expect(result.current.error).toBeNull();
  });

  it("reports a wrong password once both flows have refused it", async () => {
    state.signIn
      .mockRejectedValueOnce(new Error("InvalidSecret"))
      .mockRejectedValueOnce(new Error("Account cook@example.com already exists"));

    const result = await connect();

    expect(state.signIn).toHaveBeenCalledTimes(2);
    expect(result.current.error).not.toBeNull();
    expect(result.current.isSubmitting).toBe(false);
  });
});

describe("useAuth review account", () => {
  const REVIEW_ACCOUNT = { email: "review@cuisko.app", password: "long-enough-password" };

  it("is unavailable while the backend is still answering, and when it answers null", () => {
    expect(renderHook(() => useAuth()).result.current.isReviewAvailable).toBe(false);

    state.reviewAccount = null;
    expect(renderHook(() => useAuth()).result.current.isReviewAvailable).toBe(false);
  });

  it("asks the backend with this build's version and leaves the decision to it", () => {
    state.reviewAccount = REVIEW_ACCOUNT;

    renderHook(() => useAuth());

    expect(state.reviewQueryArgs).toEqual([{ appVersion: "0.2.0" }]);
  });

  it("stops asking once signed in, so the credentials do not linger", () => {
    state.signedIn = true;

    renderHook(() => useAuth());

    expect(state.reviewQueryArgs).toEqual(["skip"]);
  });

  it("signs in with the credentials the backend handed over", async () => {
    state.reviewAccount = REVIEW_ACCOUNT;
    state.signIn.mockResolvedValue({ signingIn: true });

    const { result } = renderHook(() => useAuth());
    expect(result.current.isReviewAvailable).toBe(true);
    await act(() => result.current.signInAsReviewer());

    expect(state.signIn).toHaveBeenCalledWith("password", { ...REVIEW_ACCOUNT, flow: "signIn" });
    expect(result.current.error).toBeNull();
  });

  it("does nothing when the window is closed, even if called", async () => {
    state.reviewAccount = null;

    const { result } = renderHook(() => useAuth());
    await act(() => result.current.signInAsReviewer());

    expect(state.signIn).not.toHaveBeenCalled();
  });

  it("says so when the account cannot be opened, without leaking the server's reason", async () => {
    state.reviewAccount = REVIEW_ACCOUNT;
    state.signIn.mockRejectedValue(new Error("InvalidSecret"));

    const { result } = renderHook(() => useAuth());
    await act(() => result.current.signInAsReviewer());

    expect(result.current.error).toBe("error_review_account");
  });
});
