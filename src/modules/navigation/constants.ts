import { Platform } from "react-native";

export const NAVIGATION_BAR_HEIGHT = 84;
export const NAVIGATION_BAR_OFFSET = NAVIGATION_BAR_HEIGHT + 24 + Platform.select({ android: 14, default: 0 });

/**
 * The chrome `app/(modals)/_layout.tsx` draws above every modal screen: the grabber, its margins,
 * and the border the sheet is framed in. Added to a measured content height, because a screen
 * measures itself and cannot see what the layout wraps it in.
 */
export const MODAL_CHROME_HEIGHT = 6 + 44 + Platform.select({ ios: 4, default: 2 });
export const MODAL_CHROME_OFFSET = MODAL_CHROME_HEIGHT;

/**
 * Where a content-sized sheet stops. A screen that would ask for more has content no sheet can
 * hold, and belongs on a declared ratio with a scroll view — see `modal-sheet.tsx`.
 */
export const MODAL_MAX_DETENT = 0.92;

/** Below this a sheet reads as a glitch rather than a sheet, whatever it measured. */
export const MODAL_MIN_DETENT = 0.2;

/**
 * What the sheet opens at before the first measurement lands — one layout pass, not a visible state.
 * Chosen mid-range on purpose: it is as wrong as it can be by half a screen either way, so a screen
 * that never reports a height is obviously unfinished rather than plausibly correct.
 */
export const MODAL_FALLBACK_DETENT = 0.5;
