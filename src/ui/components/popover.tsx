import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Modal,
  Pressable as NativePressable,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { colors, theme } from "theme";
import { useReduceMotion } from "@ui/hooks/useReduceMotion";
import { BlurScope, BlurView, useOverlayBlurTarget } from "./blur-view";

type Props = {
  /** The control that opens the popover. `open` measures it, so it must be called from a press. */
  trigger: (open: () => void, isOpen: boolean) => ReactNode;
  /**
   * The popover's rows. A row calls `close` when tapped, handing it the row's action as `then`
   * when that action presents something of its own.
   */
  children: (close: (then?: () => void) => void) => ReactNode;
  /** Narrowest the popover may render; it otherwise matches the trigger's width. */
  minWidth?: number;
  style?: ViewStyle;
};

/**
 * A popover anchored to its trigger: the shared fallback behind `Select` and `MoreButton` on
 * Android and web, where iOS draws the system menu instead.
 *
 * **The trigger becomes the popover.** The sheet is born exactly on the trigger's frame, with the
 * trigger's pill radius, and one spring carries its frame and corners to their resting place while
 * the trigger fades out beneath it. The rows fade in only over the second half of the trip, once
 * there is room for them. Closing runs the same spring back to 0, so the sheet folds into the
 * button it came from, and the Modal unmounts only once it has landed: unmounting on `close`
 * is what used to cut the exit off.
 *
 * Everything hangs on one `progress`, so the motion can be reversed mid-flight: a tap on the
 * backdrop while the sheet is still growing re-targets the spring from where it is, velocity
 * included, rather than letting the open finish first.
 *
 * On Android a blur samples only the view it is handed. Under an `OverlayBlurScope` the sheet
 * frosts that screen-wide target (see `isFrostedOnAndroid`); anywhere else it has nothing to
 * sample, and is opaque `background` separated from the page by its shadow, since
 * `surface.elevated` is translucent and assumes something frosted behind it. Web keeps the
 * translucent surface, which its `backdrop-filter` can honour.
 */
export const Popover = ({ trigger, children, minWidth = MIN_WIDTH, style }: Props) => {
  /**
   * The trigger is held in state through a callback ref rather than in `useRef`: `trigger` is
   * called during render with `open` in hand, and a closure reading `ref.current` there is what
   * the compiler's refs rule refuses.
   */
  const [triggerView, setTriggerView] = useState<View | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  /** The rows' natural height, measured once they mount. The spring waits for it. */
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  /** Set by `close`, so a late layout pass cannot reopen a sheet that is on its way out. */
  const isClosing = useRef(false);
  /** What the row that closed the sheet asked to run once it is gone. See `close`. */
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const progress = useSharedValue(0);
  const reduceMotion = useReduceMotion();
  /**
   * Under an `OverlayBlurScope`, the Android sheet frosts the whole screen behind it, with
   * `surface.elevated` painted over the blur as the frosted discs do. A bare light tint over a dark
   * photo came out a milky grey. Opened anywhere else there is nothing to sample, and the sheet
   * stays opaque `background`.
   */
  const overlayTarget = useOverlayBlurTarget();
  const isFrostedOnAndroid = Platform.OS === "android" && overlayTarget !== undefined;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const isOpen = anchor !== null;

  /**
   * The popover renders inside a Modal, so it needs the trigger's *window* coordinates rather
   * than its place in the tree: positioned absolutely in situ it would be clipped by the first
   * ancestor with `overflow: hidden`, which in this design is every card and every sheet.
   */
  const open = () => {
    isClosing.current = false;
    triggerView?.measureInWindow((x, y, width, height) => {
      /**
       * Cleared here as well as on unmount, so this open's measure is always a change and always
       * starts the spring. A height left over from an earlier open, equal to this one's, used to
       * swallow the measure: the Modal came up with the sheet stuck at 0, invisible but tappable.
       */
      setContentHeight(null);
      setAnchor({ x, y, width, height });
    });
  };

  const runAfterClose = () => {
    afterClose.current?.();
    afterClose.current = undefined;
  };

  const unmount = () => {
    setAnchor(null);
    setContentHeight(null);
    /** iOS waits for the Modal's own `onDismiss`; see `close`. */
    if (Platform.OS !== "ios") runAfterClose();
  };

  /**
   * `then` runs once the sheet has folded back and the Modal is gone, not on the tap: a row that
   * presents something of its own (the in-app browser, a screen) would otherwise present it over
   * a Modal that is still on its way out.
   *
   * On iOS "gone" means the Modal's `onDismiss`, not `unmount`. Hiding the Modal only starts
   * UIKit's dismissal, and the in-app browser presented in that window was refused, so "Open the
   * original page" did nothing. `onDismiss` exists on iOS only, which is where the wait is needed.
   */
  const close = (then?: () => void) => {
    isClosing.current = true;
    /** A bare close (the backdrop, mid-fold) keeps the action a row's close already queued. */
    afterClose.current = then ?? afterClose.current;
    progress.value = animateTo(0, reduceMotion, CLOSE_SPRING, (finished) => {
      "worklet";
      if (finished) scheduleOnRN(unmount);
    });
  };

  /**
   * Ignored once closing. A tap outside before the rows had measured closed the sheet at once, and
   * their late layout then wrote a height after the unmount had cleared it: the stale value `open`
   * now also guards against.
   */
  const onContentLayout = (event: LayoutChangeEvent) => {
    if (!isClosing.current) setContentHeight(event.nativeEvent.layout.height);
  };

  /**
   * The open starts only once the measured height has been committed, never from `onLayout`
   * itself: started there, the spring's first frames ran against the frame computed before the
   * measure (a sheet 4pt tall), and the target jumped mid-flight when the re-render landed.
   */
  useEffect(() => {
    if (contentHeight !== null && !isClosing.current) {
      progress.value = animateTo(1, reduceMotion, OPEN_SPRING);
    }
  }, [contentHeight, progress, reduceMotion]);

  /**
   * The sheet rests ON the trigger, not beside it: it grows out of the trigger's corner and covers
   * it, so the trigger's frame is the first frame of the sheet and the sheet never leaves the spot
   * the finger touched. Opening downward pins its top edge to the trigger's top; upward, its
   * bottom edge to the trigger's bottom. It flips up only when below cannot hold it and above can.
   */
  const spaceBelow = anchor ? windowHeight - anchor.y : 0;
  const spaceAbove = anchor ? anchor.y + anchor.height : 0;
  const dropsUp = anchor !== null && spaceBelow < FLIP_BELOW && spaceAbove > spaceBelow;

  /**
   * The most the rows may scroll within: the room on the side the sheet opens to, short of the
   * window's margin and the sheet's own border and padding. The rows take their natural height
   * below it and scroll only past it. A fixed 240pt cap used to cut a four-row menu short.
   */
  const room = Math.max(
    (dropsUp ? spaceAbove : spaceBelow) - MARGIN - BORDER * 2 - CONTENT_PADDING * 2,
    0,
  );

  /**
   * Horizontally the sheet stays flush with the trigger's edge nearest the window's centre, and
   * grows away from the other: a `…` in the top-right corner unfolds leftward from its own right
   * edge. The clamp keeps a sheet wider than the room on that side inside the window.
   */
  const popoverWidth = anchor ? Math.max(anchor.width, minWidth) : minWidth;
  const growsLeft = anchor !== null && anchor.x + anchor.width / 2 > windowWidth / 2;
  const popoverLeft = anchor
    ? Math.min(
      Math.max(growsLeft ? anchor.x + anchor.width - popoverWidth : anchor.x, MARGIN),
      Math.max(windowWidth - popoverWidth - MARGIN, MARGIN),
    )
    : 0;
  const popoverHeight = (contentHeight ?? 0) + BORDER * 2;
  const popoverTop = !anchor
    ? 0
    : dropsUp
      ? anchor.y + anchor.height - popoverHeight
      : anchor.y;

  /** The two frames the spring travels between. Plain numbers, so the worklet captures them. */
  const from = anchor ?? { x: 0, y: 0, width: 0, height: 0 };
  const to = { x: popoverLeft, y: popoverTop, width: popoverWidth, height: popoverHeight };

  /** The sheet's corners, shared by the sheet and, on Android, the rim painted over its frost. */
  const radius = useDerivedValue(() =>
    interpolate(
      reduceMotion ? 1 : progress.value,
      [0, 1],
      [from.height / 2, theme.radius.lg],
      Extrapolation.CLAMP,
    ),
  );

  const sheetStyle = useAnimatedStyle(() => {
    /** With motion reduced the sheet keeps its final frame and only cross-fades. */
    const travel = reduceMotion ? 1 : progress.value;
    /** Overshoot is allowed through on the frame — that is the bounce — never on the corners. */
    const lerp = (a: number, b: number) => a + (b - a) * travel;
    /**
     * The trip is an arc, not a straight line: a parabola that is 0 at both ends and `ARC_DEPTH`
     * at the midpoint, pointing away from the trigger. The sheet dips as it grows and rises back
     * onto the trigger to rest, and the close retraces it. Clamped, so the spring's overshoot
     * past 1 does not turn the dip into a lift.
     */
    const arcT = Math.min(Math.max(travel, 0), 1);
    const arc = 4 * arcT * (1 - arcT) * ARC_DEPTH * (dropsUp ? -1 : 1);

    return {
      left: lerp(from.x, to.x),
      top: lerp(from.y, to.y) + arc,
      width: lerp(from.width, to.width),
      height: lerp(from.height, to.height),
      borderRadius: radius.value,
      opacity: interpolate(progress.value, [0, SHEET_FADE], [0, 1], Extrapolation.CLAMP),
    };
  });

  /** The rim covers the sheet's outer box exactly (`fill`), so it takes the same corners. */
  const rimStyle = useAnimatedStyle(() => ({ borderRadius: radius.value }));

  const rowsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, ROWS_FADE, [0, 1], Extrapolation.CLAMP),
  }));

  /** The trigger hands over to the sheet at the very start, while the two frames still coincide. */
  const triggerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, SHEET_FADE], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <>
      <View ref={setTriggerView} collapsable={false} style={style}>
        {/* eslint-disable-next-line react-hooks/refs */}
        <Animated.View style={triggerStyle}>{trigger(open, isOpen)}</Animated.View>
      </View>

      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        onRequestClose={() => close()}
        onDismiss={runAfterClose}
      >
        <NativePressable style={StyleSheet.absoluteFill} onPress={() => close()} />
        {anchor && (
          <Animated.View
            style={[styles.popover, isFrostedOnAndroid && styles.frostedSheet, sheetStyle]}
          >
            {/*
              * The frost is the sheet's own backdrop on Android, not the rows': it has to be there
              * from the first frame of the morph, while the rows are still fading in. It covers the
              * border's band too, which the sheet leaves transparent there: see the rim below.
              */}
            {isFrostedOnAndroid && (
              <BlurScope target={overlayTarget ?? null}>
                <BlurView tint="light" style={[styles.fill, styles.frost]} />
              </BlurScope>
            )}
            {/**
              * The rows are laid out at the sheet's final width from the first frame and pinned to
              * the edge facing the trigger, so the growing frame uncovers them rather than reflowing
              * them. Their natural height is what `onContentLayout` measures.
              */}
            <Animated.View
              onLayout={onContentLayout}
              style={[
                styles.rows,
                { width: popoverWidth - BORDER * 2 },
                /** With no border of its own, the frosted sheet's edge is `BORDER` further out. */
                dropsUp
                  ? { bottom: isFrostedOnAndroid ? BORDER : 0 }
                  : { top: isFrostedOnAndroid ? BORDER : 0 },
                isFrostedOnAndroid && styles.frostedRows,
                rowsStyle,
              ]}
            >
              {/*
                * `null`: the rows' own blurs sample nothing. Context crosses into a Modal, so they
                * would otherwise inherit the opener's target; only the sheet's backdrop reads it.
                */}
              <BlurScope target={null}>
                <Surface tint="light" style={styles.popoverContent}>
                  <ScrollView bounces={false} style={{ maxHeight: room }}>
                    {/* eslint-disable-next-line react-hooks/refs */}
                    {children(close)}
                  </ScrollView>
                </Surface>
              </BlurScope>
            </Animated.View>
            {/*
              * The rim, painted last: over the frost, as `BlurView` repaints a `ButtonIcon`'s border
              * over its blur. Drawn by the sheet itself it sat on the bare photo and read darker
              * than the discs beside it.
              */}
            {isFrostedOnAndroid && (
              <Animated.View pointerEvents="none" style={[styles.fill, styles.rim, rimStyle]} />
            )}
          </Animated.View>
        )}
      </Modal>
    </>
  );
};

/**
 * The rows' surface. Android draws none of its own: the sheet behind the rows is the surface there,
 * frosted or opaque (see `isFrostedOnAndroid`), and a blur of the rows' own would only lay a white
 * fill over it.
 */
const Surface = Platform.OS === "android" ? View : BlurView;

/** Where the trigger sits in the window, measured at open time. */
type Anchor = { x: number; y: number; width: number; height: number };

/**
 * A spring to `target`, or a short fade when the reader asked for less motion: the frame then stays
 * put (see `sheetStyle`), so all that is left to animate is opacity, and a spring has no business there.
 */
const animateTo = (
  target: number,
  reduceMotion: boolean,
  spring: WithSpringConfig,
  onDone?: (finished?: boolean) => void,
) =>
  reduceMotion
    ? withTiming(target, { duration: REDUCED_FADE_MS }, onDone)
    : withSpring(target, spring, onDone);

/**
 * Apple's two knobs: `duration` is the perceptual response, `dampingRatio` the bounce. The open
 * carries a hair of overshoot, so the sheet lands rather than stops; the close is critically damped,
 * since nothing should wobble on its way into a button.
 */
const OPEN_SPRING: WithSpringConfig = { duration: 380, dampingRatio: 0.82 };
const CLOSE_SPRING: WithSpringConfig = { duration: 300, dampingRatio: 1 };
const REDUCED_FADE_MS = 160;

/** How far the sheet dips away from the trigger at the midpoint of its arc. */
const ARC_DEPTH = 14;

/** How much of the trip the trigger-to-sheet cross-fade takes: the first few frames only. */
const SHEET_FADE = 0.12;
/** The rows wait until the sheet is most of the way open, and leave first on the way back. */
const ROWS_FADE = [0.45, 0.9];

/**
 * Not a cap: the room below the trigger under which the sheet considers opening upward instead.
 * The sheet itself takes its rows' natural height; only the window limits it (see `room`).
 */
const FLIP_BELOW = 280;

/**
 * Off the spacing scale on purpose: these size the popover itself, rather than setting padding
 * rhythm inside it.
 */
const MIN_WIDTH = 160;
const CONTENT_PADDING = theme.spacing[4];
const BORDER = 2;

/** How close to the window's edge the popover may sit before the clamp pulls it back. */
const MARGIN = theme.spacing[8];

const styles = StyleSheet.create({
  popover: {
    position: "absolute",
    backgroundColor: Platform.OS === "android" ? colors.background : colors.surface.elevated,
    borderColor: colors.border.default,
    borderWidth: BORDER,
    overflow: "hidden",
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 8,
        blurRadius: 24,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  },
  /**
   * Clears the opaque Android fill, so the frost below is what shows, and the sheet's own border,
   * which the rim replaces. The border goes entirely, not just its colour: `overflow: hidden`
   * clips at the padding edge, so a frost or rim reaching into a border band is cut away there.
   * The box keeps its size (its height counts the border), and `frostedRows` moves the rows in.
   */
  frostedSheet: { backgroundColor: "transparent", borderWidth: 0 },
  /** Where the sheet's border would have put the rows, so they do not move. */
  frostedRows: { left: BORDER },
  /** The sheet's whole box, which with no border of its own is its padding box. */
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  frost: { backgroundColor: colors.surface.elevated },
  rim: { borderWidth: BORDER, borderColor: colors.border.default },
  rows: {
    position: "absolute",
    left: 0,
  },
  popoverContent: {
    paddingVertical: CONTENT_PADDING,
  },
});
