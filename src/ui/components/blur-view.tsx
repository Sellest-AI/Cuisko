import { BlurViewProps, BlurView as ExpoBlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";

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
 *
 * **Background and border are repainted in a child, not on the blur itself.** Android composites a
 * `backgroundColor` set directly on the blur *over* the blurred pixels, which flattens the frost to
 * a plain fill; a sibling behind the content keeps both. The border travels with it because a
 * border drawn on the blur is clipped against that same surface.
 *
 * Two consequences a call site should know. The blur carries `borderWidth: 0`, so it no longer
 * insets its children by the border — a bordered surface that needs the old inset asks for the
 * padding itself. And the repaint only happens when there is something to repaint: a style with
 * neither `backgroundColor` nor `borderWidth` renders the blur alone.
 */
export const BlurView = ({ intensity = BLUR_INTENSITY, tint = "dark", style, children, ...props }: BlurViewProps) => {
  const { borderWidth, ...safeStyle } = StyleSheet.flatten(style ?? {});

  /**
   * `borderWidth` counts too, not just `backgroundColor`. Keying on the fill alone dropped the
   * border outright on any transparent bordered surface — silently, since the blur still drew.
   */
  const isRepainted = safeStyle.backgroundColor !== undefined || (borderWidth ?? 0) > 0;

  return (
    <ExpoBlurView
      intensity={intensity}
      tint={tint}
      blurMethod="dimezisBlurViewSdk31Plus"
      {...props}
      style={[safeStyle, {
        borderWidth: 0,
      }]}
    >
      {isRepainted && (
        <View
          style={[StyleSheet.absoluteFill, {
            backgroundColor: safeStyle.backgroundColor,
            borderRadius: safeStyle.borderRadius,
            borderTopLeftRadius: safeStyle.borderTopLeftRadius,
            borderTopRightRadius: safeStyle.borderTopRightRadius,
            borderBottomLeftRadius: safeStyle.borderBottomLeftRadius,
            borderBottomRightRadius: safeStyle.borderBottomRightRadius,
            borderStyle: safeStyle.borderStyle,
            borderColor: safeStyle.borderColor,
            borderWidth: borderWidth,
            zIndex: -1,
          }]}
          pointerEvents="none"
        />
      )}
      {children}
    </ExpoBlurView>
  );
}
