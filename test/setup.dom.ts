/**
 * Harness for the `app` project — everything a component needs to exist that a browser provides
 * and jsdom does not.
 *
 * Kept deliberately thin. Every entry below is a browser API jsdom omits, not a module of ours
 * bent into shape: a setup file that mocks our own code makes tests pass without proving
 * anything. When a component needs a fake, the fake belongs in that test, where a reader can see it.
 */
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * react-native-web's `Appearance` and `useColorScheme` read `matchMedia` at import time. jsdom
 * does not implement it, so without this the failure is a TypeError from inside react-native-web
 * on the first import of anything from `react-native`.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

/** Animation-driven components schedule frames; jsdom has no compositor to run them. */
if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 0) as unknown as number;
  // Widened to match the DOM lib's overloads, which accept a nullish handle.
  window.cancelAnimationFrame = (handle: number | null | undefined) => clearTimeout(handle ?? undefined);
}

/**
 * Testing Library registers its own `afterEach` only when Vitest runs with `globals: true`, which
 * this project does not — every test imports what it uses. So unmounting is ours to do, and
 * skipping it leaks one DOM tree per test into the next one's queries.
 */
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
