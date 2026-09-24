import { BlurViewProps, BlurTargetView, BlurView as ExpoBlurView } from "expo-blur";
import { createContext, useContext, type ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { BlurTargetHandle } from "@ui/hooks/useBlurTarget";

/**
 * The same depth of frost reads as a different number on each platform. iOS has it in hardware.
 * Web is a `backdrop-filter` the compositor handles, and needs a much higher number to look the
 * same. Android is a GPU `RenderEffect` whose radius is `intensity / blurReductionFactor` in
 * pixels, and whose `light` tint is `0.78 × intensity / 100` of white — so the number sets both
 * how soft the sample is and how much surface sits on it. 48 with the reduction below is a 16px
 * blur under ~37% white; 80 was judged too milky on device.
 */
const BLUR_INTENSITY =
  Platform.OS === "android" ? 48 :
    Platform.OS === "ios" ? 24 : 48;

/**
 * The target the blurs under a `BlurScope` sample. Absent outside any scope — and, deliberately,
 * inside a `BlurTarget`: see there.
 */
const BlurTargetContext = createContext<BlurTargetHandle | undefined>(undefined);

type BlurTargetProps = {
  target: BlurTargetHandle,
  style?: StyleProp<ViewStyle>,
  children?: ReactNode,
};

/**
 * The content a `BlurScope`'s blurs read through — on Android the native view `expo-blur`
 * snapshots, elsewhere a plain `View`. Takes the handle from `useBlurTarget`.
 *
 * A blur may not sit *inside* the target it samples: the snapshot would then contain the blur,
 * which would be drawing itself. That is the library's rule, and it decides the layout — the
 * target wraps the photo or the page, and the controls floating over it come *after* it in the
 * tree, under a `BlurScope`. The context is blanked for the target's own children so that a blur
 * nested in the wrong place gets no target at all (the plain fallback) rather than a recursive one.
 */
export const BlurTarget = ({ target: { attach, settle }, style, children }: BlurTargetProps) => (
  /**
   * `expo-blur` types the ref as an object ref only, but forwards it untouched to a host view, which
   * takes a callback ref like any other — and a callback is what lets the handle notice the node.
   * `onLayout` is the handle's cue that the node exists natively; see `useBlurTarget`.
   */
  <BlurTargetView ref={attach as unknown as BlurTargetHandle["ref"]} onLayout={settle} style={style}>
    <BlurTargetContext.Provider value={undefined}>
      {children}
    </BlurTargetContext.Provider>
  </BlurTargetView>
);

type BlurScopeProps = {
  /**
   * `null` for content that sits on a frosted surface of its own — the controls laid out over an
   * `Input`'s blur. Nothing in there samples the page then: on Android a blur reading the same
   * target as the surface under it shows the raw page *through* that surface, a hole rather than
   * a disc, so it draws its fill only. iOS and web ignore the scope altogether.
   */
  target: BlurTargetHandle | null,
  children?: ReactNode,
};

/**
 * The region whose `BlurView`s — including the ones inside `Input`, `ButtonIcon`, `Badge` and
 * `ButtonPill` — sample the given target. Renders nothing of its own.
 */
export const BlurScope = ({ target, children }: BlurScopeProps) => (
  <BlurTargetContext.Provider value={target ?? undefined}>
    {children}
  </BlurTargetContext.Provider>
);

/**
 * `expo-blur` with the app's tuning already applied, so a call site gets the frosted surface by
 * writing `<BlurView>` — every prop stays overridable for the case that wants something else.
 *
 * On Android the blur only exists when the nearest `BlurScope` names something to blur, or the
 * call site passes `blurTarget` itself; outside one, the library falls back to a plain
 * semi-transparent fill. `blurMethod` and `blurTarget` are read on Android only; the other
 * platforms ignore them, so neither is forwarded there.
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
export const BlurView = ({ intensity = BLUR_INTENSITY, tint = "dark", style, children, blurTarget, ...props }: BlurViewProps) => {
  const { borderWidth, ...safeStyle } = StyleSheet.flatten(style ?? {});
  const scope = useContext(BlurTargetContext);

  /**
   * `borderWidth` counts too, not just `backgroundColor`. Keying on the fill alone dropped the
   * border outright on any transparent bordered surface — silently, since the blur still drew.
   */
  const isRepainted = safeStyle.backgroundColor !== undefined || (borderWidth ?? 0) > 0;

  /**
   * The method is only requested alongside a target. Asking for it without one changes nothing
   * on screen — the library falls back to its plain fill either way — but it logs a warning per
   * blur in development, and a blur outside any scope is a deliberate state, not a mistake.
   */
  const target = blurTarget ?? scope?.ref;
  const androidProps = Platform.OS === "android" && target
    ? {
      blurMethod: "dimezisBlurViewSdk31Plus" as const,
      blurReductionFactor: 3 as const,
      blurTarget: target
    }
    : {};

  /**
   * Keyed on the target's generation, so a blur that mounted before its target was ready is
   * remounted against the ready one — a fresh native view, configured with a sized target from
   * its first frame. See `useBlurTarget` for what "ready" means and why it is not the attach.
   * The generation only ever moves on Android, so the key is constant everywhere else.
   */
  const generation = scope?.generation ?? 0;

  return (
    <ExpoBlurView
      key={generation}
      intensity={intensity}
      tint={tint}
      {...androidProps}
      {...props}
      style={[safeStyle, {
        borderWidth: 0,
        overflow: "hidden",
      }]}
    >
      {/*
        * iOS mounts React children by index straight into the native view, whose slot 0 is the
        * effect view itself — so React child 0 goes *under* the effect, which blurs it: the fill
        * still tints through, a border smears away. An empty, unflattened view takes that slot so
        * the repaint below lands above the effect and below the content.
        */}
      {isRepainted && Platform.OS === "ios" && (
        <View collapsable={false} style={styles.slot} pointerEvents="none" />
      )}
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
            /**
             * Web only. On the native platforms tree order already puts this view under the content,
             * and a `-1` sorts it under the native blur instead: on Android that blur is a sibling
             * at zIndex 0 and paints straight over it, on iOS the sort puts it back into the slot
             * the view above keeps free. Both lost the fill and the border to a dark smear.
             */
            zIndex: Platform.OS === "web" ? -1 : undefined,
          }]}
          pointerEvents="none"
        />
      )}
      {/*
        * A blur inside a blur draws its fill only — the same rule as `BlurScope` with `null`, for
        * the case where the nesting is in the tree (a neutral pill's icon discs). A surface that is
        * a self-closing sibling of its content, like `Input`'s, scopes that content itself.
        */}
      <BlurTargetContext.Provider value={undefined}>{children}</BlurTargetContext.Provider>
    </ExpoBlurView>
  );
}

const styles = StyleSheet.create({
  slot: { position: "absolute", width: 0, height: 0 },
});
