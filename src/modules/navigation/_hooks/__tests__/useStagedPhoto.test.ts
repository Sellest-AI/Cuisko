import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStagedPhoto } from "../useStagedPhoto";

const compress = vi.hoisted(() => vi.fn());

vi.mock("~/lib/image/compressToBase64", () => ({ compressToBase64: compress }));

/** A compression the test finishes by hand, so "still running" can be looked at. */
const slowCompression = () => {
  let finish: (base64: string) => void = () => { };
  compress.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));

  return (base64: string) => act(async () => finish(base64));
};

beforeEach(() => {
  compress.mockReset();
  // Atoms outlive a hook instance: start each test from no photo.
  const { result } = renderHook(() => useStagedPhoto());
  act(() => result.current.discard());
});

describe("useStagedPhoto", () => {
  it("compresses the photo as soon as it is staged, and says so while it does", async () => {
    const finish = slowCompression();
    const { result } = renderHook(() => useStagedPhoto());

    act(() => result.current.stage("file:///shelf.jpg"));
    expect(result.current.photo).toBe("file:///shelf.jpg");
    expect(result.current.isCompressing).toBe(true);
    expect(result.current.uploadBase64).toBeUndefined();

    await finish("AAAA");
    expect(result.current.isCompressing).toBe(false);
    expect(result.current.uploadBase64).toBe("AAAA");
  });

  it("a send pressed before compression ends gets the result, not nothing", async () => {
    const finish = slowCompression();
    const { result } = renderHook(() => useStagedPhoto());

    act(() => result.current.stage("file:///shelf.jpg"));
    const waiting = result.current.uploadBase64Ready();
    await finish("AAAA");

    await expect(waiting).resolves.toBe("AAAA");
  });

  it("discarding clears the upload base64 with the photo", async () => {
    compress.mockResolvedValueOnce("AAAA");
    const { result } = renderHook(() => useStagedPhoto());

    act(() => result.current.stage("file:///shelf.jpg"));
    await waitFor(() => expect(result.current.uploadBase64).toBe("AAAA"));

    act(() => result.current.discard());
    expect(result.current.photo).toBeUndefined();
    expect(result.current.uploadBase64).toBeUndefined();
    await expect(result.current.uploadBase64Ready()).resolves.toBeUndefined();
  });

  /** The rule that broke if this fails: a slow result must not bring back a photo the cook deleted. */
  it("a photo discarded while compressing stays discarded when the result lands", async () => {
    const finish = slowCompression();
    const { result } = renderHook(() => useStagedPhoto());

    act(() => result.current.stage("file:///shelf.jpg"));
    act(() => result.current.discard());
    await finish("AAAA");

    expect(result.current.photo).toBeUndefined();
    expect(result.current.uploadBase64).toBeUndefined();
  });

  it("a photo that cannot be compressed is dropped rather than sent full size", async () => {
    vi.spyOn(console, "error").mockImplementation(() => { });
    compress.mockRejectedValueOnce(new Error("no encoder"));
    const { result } = renderHook(() => useStagedPhoto());

    act(() => result.current.stage("file:///shelf.jpg"));

    await waitFor(() => expect(result.current.photo).toBeUndefined());
    expect(result.current.isCompressing).toBe(false);
  });

  /** The rule that broke before: discarding at send time cancelled the base64 the send still needed. */
  it("a photo unstaged for a send leaves the bar but its compression still delivers", async () => {
    const finish = slowCompression();
    const { result } = renderHook(() => useStagedPhoto());

    act(() => result.current.stage("file:///shelf.jpg"));
    let taken: ReturnType<typeof result.current.unstage>;
    act(() => { taken = result.current.unstage(); });

    expect(result.current.photo).toBeUndefined();
    expect(taken!.uri).toBe("file:///shelf.jpg");

    await finish("AAAA");

    await expect(taken!.base64).resolves.toBe("AAAA");
    // The late result must not paint the photo back into the bar.
    expect(result.current.photo).toBeUndefined();
    expect(result.current.uploadBase64).toBeUndefined();
  });

  it("unstages nothing when nothing is staged", () => {
    const { result } = renderHook(() => useStagedPhoto());

    expect(result.current.unstage()).toBeUndefined();
  });

  it("an unstaged photo can be put back, ready to send without compressing again", async () => {
    const { result } = renderHook(() => useStagedPhoto());

    act(() => result.current.restore("file:///shelf.jpg", "AAAA"));

    expect(result.current.photo).toBe("file:///shelf.jpg");
    expect(result.current.isCompressing).toBe(false);
    await expect(result.current.uploadBase64Ready()).resolves.toBe("AAAA");
    expect(compress).not.toHaveBeenCalled();
  });
});
