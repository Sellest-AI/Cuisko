import { useAtomValue } from "jotai";
import { Platform, useWindowDimensions } from "react-native";

import {
  MODAL_FALLBACK_DETENT,
  MODAL_FRAME_CHROME,
  MODAL_MAX_DETENT,
  MODAL_MIN_DETENT,
} from "../constants";
import { sheetSizeAtom } from "./state";

/**
 * The height `app/(modals)/_layout.tsx` gives its frame — in pixels, not as a detent.
 *
 * **Pixels, because Android leaves no choice.** `sheetAllowedDetents` is read once, in
 * `ScreenStackFragment.onCreateView`, and `Screen.sheetDetents` is a plain field with no setter — so
 * a new array arrives from JS, lands in the field, and nothing reconfigures the behaviour. The sheet
 * keeps the height it opened at. iOS re-applies its detents, which is why the same code looked
 * correct there and was not portable.
 *
 * The one path Android *does* resize a live sheet through is `fitToContents`: `Screen`'s
 * `onContentWrapperLayout` fires on every content layout pass and animates the sheet to the new
 * content height. So the sheet stays on `fitToContents`, and this is the height its content becomes
 * — an explicit number, which measures the same under the unbounded parent `fitToContents` lays the
 * screen out in, where an intrinsic height resolves to zero.
 *
 * A measured height is the screen's content alone, so the frame adds the chrome it wraps that
 * content in. No safe-area inset on either platform: an iOS sheet short of full height floats clear
 * of the home indicator, and on Android the layout's `SafeAreaView` pads the inset below the frame.
 * iOS gets a few pixels of room under the content instead, tuned by eye on a device.
 *
 * Clamped at both ends: past `MODAL_MAX_DETENT` is a screen that should have
 * declared itself, and under `MODAL_MIN_DETENT` is a measurement that has not landed yet.
 */
export const useModalSheetFrameHeight = (): number => {
  const size = useAtomValue(sheetSizeAtom);
  const { height: windowHeight } = useWindowDimensions();

  const iosBottomRoom = Platform.OS === "ios" ? 4 : 0;

  const requested =
    size === null
      ? MODAL_FALLBACK_DETENT * windowHeight
      : size.kind === "declared"
        ? size.ratio * windowHeight
        : size.height + MODAL_FRAME_CHROME + iosBottomRoom;

  return Math.min(
    Math.max(requested, MODAL_MIN_DETENT * windowHeight),
    MODAL_MAX_DETENT * windowHeight,
  );
};
