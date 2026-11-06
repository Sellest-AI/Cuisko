import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above this by the transform, so the hook still loads against the mocks.
import { useClipboardLink } from "../useClipboardLink";

/**
 * The promise this file pins: opening the import screen never raises iOS's "Allow Paste" alert. It
 * would on the first read of the pasteboard, so `getUrlAsync` and `getStringAsync` are counted, and
 * have to stay at zero on iOS until the cook taps.
 */
const device = vi.hoisted(() => ({
  os: "android",
  text: "",
  url: null as string | null,
  hasWebLink: false,
  urlReads: 0,
  textReads: 0,
  fails: false,
  /** Holds the iOS check open, to land after something the cook did in the meantime. */
  holdsCheck: false,
  releaseCheck: () => {},
  /** Runs during a read, as iOS's paste alert does: it opens over the app until the cook answers. */
  duringRead: () => {},
  listeners: new Set<{ event: string; listener: (state?: string) => void }>(),
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return device.os;
    },
  },
  AppState: {
    addEventListener: (event: string, listener: (state?: string) => void) => {
      // As react-native-web does: `focus` is Android's, and subscribing to it there throws.
      if (device.os === "web" && event !== "change") throw new Error(`unknown event: ${event}`);

      const entry = { event, listener };
      device.listeners.add(entry);
      return { remove: () => device.listeners.delete(entry) };
    },
  },
}));

vi.mock("expo-clipboard", () => ({
  hasWebLinkAsync: () => {
    if (device.fails) return Promise.reject(new Error("no clipboard"));
    if (!device.holdsCheck) return Promise.resolve(device.hasWebLink);

    const answer = device.hasWebLink;
    return new Promise((resolve) => {
      device.releaseCheck = () => resolve(answer);
    });
  },
  hasStringAsync: () => Promise.resolve(device.text !== ""),
  getUrlAsync: () => {
    device.urlReads += 1;
    return device.fails ? Promise.reject(new Error("no clipboard")) : Promise.resolve(device.url);
  },
  getStringAsync: () => {
    device.textReads += 1;
    device.duringRead();
    return device.fails ? Promise.reject(new Error("no clipboard")) : Promise.resolve(device.text);
  },
}));

const fire = (event: string, state?: string) =>
  act(() => device.listeners.forEach((entry) => entry.event === event && entry.listener(state)));

const moveAppTo = (next: string) => fire("change", next);

/** Android takes the window's focus away before `AppState` reports the background. */
const blurWindow = () => fire("blur");

/** Android gives the window its focus after `AppState` reports `active`. */
const focusWindow = () => fire("focus");

/** Lets the first check land, so a test reads what it answered rather than the initial `false`. */
const open = async () => {
  const view = renderHook(() => useClipboardLink());
  await act(async () => {});

  return view;
};

const REEL = "https://www.instagram.com/reel/DcTtz3Ftj9I/";

beforeEach(() => {
  Object.assign(device, { os: "android", text: "", url: null, hasWebLink: false, urlReads: 0, textReads: 0, fails: false, holdsCheck: false, releaseCheck: () => {}, duringRead: () => {} });
  device.listeners.clear();
});

describe("useClipboardLink on Android", () => {
  it("offers a copied link", async () => {
    device.text = REEL;

    const { result } = await open();

    expect(result.current.hasLink).toBe(true);
  });

  it("offers nothing for copied text that is not an http link", async () => {
    device.text = "200g de farine";

    const { result } = await open();

    expect(result.current.hasLink).toBe(false);
  });

  it("offers nothing when the clipboard cannot be read", async () => {
    device.fails = true;

    const { result } = await open();

    expect(result.current.hasLink).toBe(false);
  });

  it("finds the link the cook left the app to copy, with the sheet still open behind it", async () => {
    const { result } = await open();
    expect(result.current.hasLink).toBe(false);

    blurWindow();
    moveAppTo("background");
    device.text = REEL;
    moveAppTo("active");
    focusWindow();

    await waitFor(() => expect(result.current.hasLink).toBe(true));
  });

  it("finds a link copied beside the app, where the window loses focus and the app stays active", async () => {
    const { result } = await open();

    blurWindow();
    device.text = REEL;
    focusWindow();

    await waitFor(() => expect(result.current.hasLink).toBe(true));
  });

  it("waits for the window's focus to read, as Android hands an unfocused app an empty clipboard", async () => {
    await open();
    const readsOnOpen = device.textReads;

    blurWindow();
    moveAppTo("background");
    moveAppTo("active");
    await act(async () => {});

    expect(device.textReads).toBe(readsOnOpen);
  });

  it("does not read again when the window only got its focus back, with no trip away", async () => {
    await open();
    const readsOnOpen = device.textReads;

    focusWindow();
    await act(async () => {});

    expect(device.textReads).toBe(readsOnOpen);
  });

  it("stops listening once the screen is gone", async () => {
    const { unmount } = await open();

    unmount();

    expect(device.listeners.size).toBe(0);
  });

  it("reads the link alone out of the sentence it was copied in", async () => {
    device.text = `Regarde cette recette ! ${REEL}`;
    const { result } = await open();

    await expect(result.current.readLink()).resolves.toBe(REEL);
  });

  it("pastes what the check read, as a second read is a second toast from the system", async () => {
    device.text = REEL;
    const { result } = await open();

    await expect(result.current.readLink()).resolves.toBe(REEL);

    expect(device.textReads).toBe(1);
  });

  it("pastes the newer link when the cook copied another one while away", async () => {
    device.text = "https://www.marmiton.org/ancienne";
    const { result } = await open();

    blurWindow();
    device.text = REEL;
    focusWindow();
    await act(async () => {});

    await expect(result.current.readLink()).resolves.toBe(REEL);
  });
});

describe("useClipboardLink on iOS", () => {
  beforeEach(() => {
    device.os = "ios";
  });

  it("offers a detected link without reading the pasteboard, so no alert meets the cook", async () => {
    device.hasWebLink = true;
    device.text = `Regarde cette recette ! ${REEL}`;

    const { result } = await open();

    expect(result.current.hasLink).toBe(true);
    expect(device.urlReads).toBe(0);
    expect(device.textReads).toBe(0);
  });

  it("does not read the pasteboard when the app comes back either", async () => {
    device.hasWebLink = true;
    await open();

    moveAppTo("background");
    moveAppTo("active");
    await act(async () => {});

    expect(device.urlReads).toBe(0);
    expect(device.textReads).toBe(0);
  });

  it("finds the link the cook left the app to copy", async () => {
    const { result } = await open();
    expect(result.current.hasLink).toBe(false);

    moveAppTo("background");
    device.hasWebLink = true;
    moveAppTo("active");

    await waitFor(() => expect(result.current.hasLink).toBe(true));
  });

  it("keeps a withdrawn offer withdrawn when the paste alert closes", async () => {
    device.hasWebLink = true;
    device.text = "marmiton.org/recettes";
    device.duringRead = () => device.listeners.forEach((entry) => entry.listener("inactive"));
    const { result } = await open();

    await act(async () => {
      await result.current.readLink();
    });
    moveAppTo("active");
    await act(async () => {});

    expect(result.current.hasLink).toBe(false);
  });

  it("finds a link copied beside the app, where it goes inactive and never to the background", async () => {
    const { result } = await open();

    moveAppTo("inactive");
    device.hasWebLink = true;
    moveAppTo("active");

    await waitFor(() => expect(result.current.hasLink).toBe(true));
  });

  it("does not let a check that was already running undo a withdrawn offer", async () => {
    device.hasWebLink = true;
    device.text = "marmiton.org/recettes";
    const { result } = await open();

    device.holdsCheck = true;
    moveAppTo("background");
    moveAppTo("active");
    await act(async () => {
      await result.current.readLink();
    });
    await act(async () => device.releaseCheck());

    expect(result.current.hasLink).toBe(false);
  });

  it("offers nothing when the system detects no link", async () => {
    device.text = "200g de farine";

    const { result } = await open();

    expect(result.current.hasLink).toBe(false);
  });

  it("offers nothing when the detection fails", async () => {
    device.fails = true;

    const { result } = await open();

    expect(result.current.hasLink).toBe(false);
  });

  it("reads the link alone out of the sentence it was copied in, on the tap", async () => {
    device.hasWebLink = true;
    device.text = `Regarde cette recette ! ${REEL}`;
    const { result } = await open();

    await expect(result.current.readLink()).resolves.toBe(REEL);
    expect(device.textReads).toBe(1);
    expect(device.urlReads).toBe(0);
  });

  it("reads the URL of a copy that has no text, once", async () => {
    device.hasWebLink = true;
    device.url = REEL;
    const { result } = await open();

    await expect(result.current.readLink()).resolves.toBe(REEL);
    expect(device.urlReads).toBe(1);
    expect(device.textReads).toBe(0);
  });

  it("withdraws the offer when the detector took a bare host for a link", async () => {
    device.hasWebLink = true;
    device.text = "marmiton.org/recettes";
    const { result } = await open();

    await act(async () => {
      await expect(result.current.readLink()).resolves.toBeUndefined();
    });

    expect(result.current.hasLink).toBe(false);
  });

  it("withdraws the offer when the URL is not a web link", async () => {
    device.hasWebLink = true;
    device.url = "mailto:chef@marmiton.org";
    const { result } = await open();

    await act(async () => {
      await expect(result.current.readLink()).resolves.toBeUndefined();
    });

    expect(result.current.hasLink).toBe(false);
  });

  it("withdraws the offer when the cook refuses the alert, which reads as nothing", async () => {
    device.hasWebLink = true;
    device.url = null;
    const { result } = await open();

    await act(async () => {
      await expect(result.current.readLink()).resolves.toBeUndefined();
    });

    expect(result.current.hasLink).toBe(false);
  });
});

describe("useClipboardLink on the web", () => {
  it("offers nothing and reads nothing, as `readText` would open a permission prompt", async () => {
    device.os = "web";
    device.text = REEL;

    const { result } = await open();

    expect(result.current.hasLink).toBe(false);
    expect(device.textReads).toBe(0);
  });
});
