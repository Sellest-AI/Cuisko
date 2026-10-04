import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ButtonIcon } from "@ui/button-icon";
import { X } from "@ui/icons";
import type { Frame } from "@ui/input";
import { Pressable } from "@ui/pressable";
import { theme } from "theme";

import { useWeekSummary } from "./_hooks/useWeekSummary";
import { WeekSummary } from "./week-summary";
import { PillFace } from "./week-summary-reveal.pill";

const OPEN_MS = 420;
const CLOSE_MS = 520;
const SIDE_MARGIN = theme.spacing[16];
const SIDE_OFFSET = 1;
/** Below the safe area: the card covers the header, not the status bar. */
const TOP_GAP = theme.spacing[8];
/** Between the open card and the first section it pushed down. */
const BOTTOM_GAP = theme.spacing[28];
const CARD_RADIUS = theme.radius.lg;
const CARD_BORDER = 2;
/** How far up and right of its place the card starts when opening, so it is seen to move in. */
const OPEN_DRIFT = theme.spacing[24];
/** How small the card has shrunk by the time the box has folded back into the pill. */
const CLOSED_SCALE = 0.8;

type Props = {
  /** Draws the page's header, given the score pill to put in it. The card grows out of that pill. */
  header: (scoreButton: ReactNode) => ReactNode;
};

/**
 * The Health score as a pill in the header, and the week summary it opens.
 *
 * Tapping the pill grows a box out of it into the summary card, over the header, while a spacer
 * under the header grows by the same `progress` so the sections below are pushed down rather than
 * covered. The X folds the box back into the pill. One shared value drives the box's frame, its
 * corners, the content's fade and the spacer, so they cannot drift apart: the navigation bar's
 * camera is built the same way.
 *
 * The box starts as the pill itself: the pill's orange, its round ends, its face at its right end.
 * As it grows the orange turns into the card's surface and the face fades out, while the card
 * fades in, so the pill reads as becoming the card rather than a card appearing over it. The real
 * pill is hidden while the box is up, and shown again only once the box has folded back into it.
 *
 * The card is laid out at its final size and translated to a corner of the box, which crops it:
 * the top-right one while it opens, so it unfolds out of the pill, and the bottom-left one while it
 * closes, so it travels with those edges into the pill. The switch happens fully open, where the
 * card fills the box and both corners put it in the same place, so it never jumps. It is mounted
 * closed, which is how its height is known before the box starts to grow.
 *
 * Nothing re-renders the box between its mount and the fold's end, the switch included: a render
 * re-applies the animated views' props as of that render, and the card either flickered or kept a
 * stale opacity until the next frame that changed it.
 */
export const WeekSummaryReveal = ({ header }: Props) => {
  const insets = useSafeAreaInsets();
  const { summary } = useWeekSummary();

  const root = useRef<View>(null);
  const pill = useRef<View>(null);
  const [width, setWidth] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [cardHeight, setCardHeight] = useState<number>();
  /** Where the pill was when it was pressed, in this component's space. Set while the card is up. */
  const [origin, setOrigin] = useState<Frame>();

  const progress = useSharedValue(0);
  /**
   * How far the pill has turned into the card: its colour and its face. Separate from `progress`
   * because of the opening's ease-out: `progress` is past 0.4 within ~60ms, and a colour keyed to it
   * flashed from orange to the card's surface. So the opening switches it at once, and only the
   * closing animates it, matching `progress` there.
   */
  const surface = useSharedValue(0);
  const from = useSharedValue<Frame>({ x: 0, y: 0, width: 0, height: 0 });
  const isClosing = useRef(false);
  /** The box has finished growing, so the card is anchored to fold back. A shared value, so it never renders. */
  const unfolded = useSharedValue(false);

  const target = {
    x: SIDE_MARGIN - SIDE_OFFSET,
    y: insets.top + TOP_GAP,
    width: (width + SIDE_OFFSET * 2) - SIDE_MARGIN * 2,
    // The card is laid out inside the box's border, so the box is that much taller.
    height: (cardHeight ?? 0) + CARD_BORDER * 2,
  };
  /** How far the sections under the header move: from the header's bottom to under the card. */
  const push = Math.max(0, target.y + target.height + BOTTOM_GAP - headerHeight);

  const measurePill = () => new Promise<Frame | undefined>((resolve) => {
    if (!pill.current || !root.current) return resolve(undefined);
    pill.current.measureLayout(
      root.current,
      (x, y, w, h) => resolve({ x, y, width: w, height: h }),
      () => resolve(undefined),
    );
  });

  const open = async () => {
    if (origin) return;
    const frame = await measurePill();
    if (!frame) return;
    isClosing.current = false;
    unfolded.set(false);
    from.set(frame);
    setOrigin(frame);
  };

  /** Grows once the card has a height: before that, the box would have nowhere to grow to. */
  const isMeasured = origin !== undefined && cardHeight !== undefined;
  useEffect(() => {
    if (!isMeasured) return;
    progress.set(withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) unfolded.set(true);
    }));
    surface.set(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening, when the card is measured
  }, [isMeasured]);

  /**
   * The box is back in the pill. The card's height goes with it: the next opening measures it
   * again, since the summary may have grown a row meanwhile and the box would grow to the old one.
   */
  const folded = () => {
    setOrigin(undefined);
    setCardHeight(undefined);
  };

  const close = async () => {
    // Not while still growing: the card is anchored to fold back only once fully open.
    if (isClosing.current || !unfolded.get()) return;
    isClosing.current = true;
    // The pill may have moved while the card was up (the household name changed length).
    const now = await measurePill();
    if (now) from.set(now);
    surface.set(withTiming(0, { duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic) }));
    progress.set(withTiming(0, { duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic) }, (finished) => {
      if (finished) scheduleOnRN(folded);
    }));
  };

  const box = useAnimatedStyle(() => ({
    left: interpolate(progress.value, [0, 1], [from.get().x, target.x]),
    top: interpolate(progress.value, [0, 1], [from.get().y, target.y]),
    width: interpolate(progress.value, [0, 1], [from.get().width, target.width]),
    height: interpolate(progress.value, [0, 1], [from.get().height, target.height]),
    borderRadius: interpolate(progress.value, [0, 1], [from.get().height / 2, CARD_RADIUS]),
    backgroundColor: interpolateColor(surface.value, [0, 0.8], [theme.colors.primary.base, theme.colors.neutral.subtle]),
    borderColor: interpolateColor(surface.value, [0, 0.4], [theme.colors.primary.base, theme.colors.border.medium]),
  }));
  const face = useAnimatedStyle(() => ({
    height: from.get().height,
    opacity: interpolate(surface.value, [0, 0.2], [1, 0], "clamp"),
  }));
  /** Opening fades it in as the box grows; closing fades it out before the box shrinks much. */
  const content = useAnimatedStyle(() => ({
    opacity: unfolded.get()
      ? interpolate(progress.value, [0.7, 1], [0, 1], "clamp")
      : interpolate(progress.value, [0.3, 1], [0, 1], "clamp"),
  }));
  /**
   * The card sits at the box's top-left; this moves it to its anchor. Opening: the top-right
   * corner, and it starts up and right, towards the pill, settling as the box grows. Closing: the
   * bottom-left corner, and it shrinks towards it as the box folds. Both are at rest fully open,
   * where one hands over to the other, so the switch never moves it.
   */
  const motion = useAnimatedStyle(() => {
    // How much narrower and shorter than the card the box still is.
    const shortX = interpolate(progress.value, [0, 1], [from.get().width, target.width]) - target.width;
    const shortY = interpolate(progress.value, [0, 1], [from.get().height, target.height]) - target.height;
    return unfolded.get() ? {
      transform: [{ translateY: shortY }, { scale: interpolate(progress.value, [0, 1], [CLOSED_SCALE, 1]) }],
    } : {
      transform: [
        { translateX: shortX + interpolate(progress.value, [0, 1], [OPEN_DRIFT, 0]) },
        { translateY: interpolate(progress.value, [0, 1], [-OPEN_DRIFT, 0]) },
      ],
    };
  });
  const spacer = useAnimatedStyle(() => ({ height: progress.value * push }));

  const scoreButtonDisabled = !summary || summary.days === 0;
  const scoreButton = (
    <View ref={pill} collapsable={false} style={styles.pillPlace}>
      <Pressable
        haptic
        onPress={() => void open()}
        disabled={scoreButtonDisabled}
        // Hidden, not unmounted, while the box is up: it keeps its place and its frame to fold back to.
        style={[
          styles.pill,
          origin && styles.hidden,
        ]}
      >
        <PillFace health={summary?.health} />
      </Pressable>
    </View>
  );

  return (
    <View ref={root} onLayout={({ nativeEvent }: LayoutChangeEvent) => setWidth(nativeEvent.layout.width)}>
      <View onLayout={({ nativeEvent }: LayoutChangeEvent) => setHeaderHeight(nativeEvent.layout.height)}>
        {header(scoreButton)}
      </View>
      <Animated.View style={spacer} />
      {origin && (
        <Animated.View style={[styles.box, box]}>
          {/* The pill's face, where the pill had it: at the box's right end, fading as the box grows. */}
          <Animated.View style={[styles.face, face]}>
            <PillFace health={summary?.health} />
          </Animated.View>
          <Animated.View
            style={[styles.content, { width: target.width - CARD_BORDER * 2 }, content, motion]}
            onLayout={({ nativeEvent }: LayoutChangeEvent) => setCardHeight(nativeEvent.layout.height)}
          >
            <WeekSummary />
          </Animated.View>
          {/* Outside the card, on the box's right edge: it floats there while the card slides under it. */}
          <Animated.View style={[styles.close, content]}>
            <ButtonIcon elevated variant="primary" size="sm" onPress={() => void close()}>{X}</ButtonIcon>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    overflow: "hidden",
    borderWidth: CARD_BORDER,
  },
  /** Scaled from its bottom-left as it folds, so it travels with those edges into the pill. */
  content: { position: "absolute", top: 0, left: 0, transformOrigin: "left bottom" },
  /** Where the card's title row puts its right end: its top padding, and its side padding. */
  close: { position: "absolute", top: theme.spacing[16], right: theme.spacing[16] },
  /**
   * The pill reads taller than the header's other buttons, so it sits 2px higher. On the measured
   * view, not the Pressable: the box grows from the frame measured here, which then matches the
   * pill drawn, so the opening does not jump.
   */
  pillPlace: { marginTop: -theme.spacing[2] },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    paddingVertical: theme.spacing[6],
    paddingLeft: theme.spacing[12],
    paddingRight: theme.spacing[6],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary.base,
  },
  hidden: { opacity: 0 },
  /**
   * The pill's padding less the box's border, so at the start the face sits exactly where it sits
   * on the pill.
   */
  face: {
    position: "absolute",
    top: -CARD_BORDER,
    right: theme.spacing[6] - CARD_BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
  },
});
