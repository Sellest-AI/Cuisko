import { Platform } from "react-native";

export const NAVIGATION_BAR_HEIGHT = 84;
export const NAVIGATION_BAR_OFFSET = NAVIGATION_BAR_HEIGHT + 24 + Platform.select({ android: 14, default: 0 });

/**
 * How far a modal screen pads its content down so it starts below the close and action buttons,
 * which `app/(modals)/_layout.tsx` floats over the top of every screen.
 */
export const MODAL_CHROME_HEIGHT = 6 + 44 + Platform.select({ ios: 4, default: 2 });
export const MODAL_CHROME_OFFSET = MODAL_CHROME_HEIGHT;

/** The grabber `app/(modals)/_layout.tsx` draws above the screen, in the flow, and its margins. */
export const MODAL_GRABBER_HEIGHT = 6;
export const MODAL_GRABBER_MARGIN_TOP = 16;
export const MODAL_GRABBER_MARGIN_BOTTOM = 4;

/** The modal frame's border. Android draws only the top one; iOS frames the sheet all round. */
export const MODAL_FRAME_BORDER_WIDTH = 2;

/**
 * What the frame spends before the screen gets a pixel: the grabber with its margins, and the
 * frame's own borders. Added to a measured content height, because a screen measures itself and
 * cannot see what the layout wraps it in. Left out, the screen is cut by this much at the bottom.
 */
export const MODAL_FRAME_CHROME =
  MODAL_GRABBER_MARGIN_TOP + MODAL_GRABBER_HEIGHT + MODAL_GRABBER_MARGIN_BOTTOM +
  MODAL_FRAME_BORDER_WIDTH * Platform.select({ ios: 2, default: 1 });

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
