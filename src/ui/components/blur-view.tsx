import { BlurViewProps, BlurView as ExpoBlurView } from "expo-blur";
import { Platform } from "react-native";

/**
 * Blur costs a different amount on each platform, so each gets the strongest value it can afford:
 * Android renders it on the UI thread and goes muddy past a point, iOS has it in hardware, and web
 * is a `backdrop-filter` the compositor handles — which needs a much higher number to read as the
 * same depth.
 */
const BLUR_INTENSITY =
  Platform.OS === "android" ? 12 :
    Platform.OS === "ios" ? 24 : 48;

/**
 * `expo-blur` with the app's tuning already applied, so a call site gets the frosted surface by
 * writing `<BlurView>` — every prop stays overridable for the case that wants something else.
 *
 * `blurMethod` is read on Android only; the other platforms ignore it.
 */
export const BlurView = ({ intensity = BLUR_INTENSITY, tint = "dark", ...props }: BlurViewProps) => (
  <ExpoBlurView intensity={intensity} tint={tint} blurMethod="dimezisBlurViewSdk31Plus" {...props} />
);
