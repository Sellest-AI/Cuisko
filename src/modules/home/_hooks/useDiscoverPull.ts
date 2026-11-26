import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Platform } from "react-native";
import Animated, {
  type ScrollEvent,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { exploreRoute } from "~/modules/explore/routes";

import { DISCOVER_STRIP, isAtBottomOf, pullProgressOf } from "../_model/discoverPull";

/**
 * Android has no bounce past the bottom, so home gets a strip of blank scroll to pull into. iOS
 * pulls into its own bounce, and the web has no pull: a tap there.
 */
const STRIP = Platform.OS === "android" ? DISCOVER_STRIP : 0;

/** Faster than this, in points per millisecond, a released drag is a fling: its momentum decides where it rests. */
const FLING = 0.1;

const _tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
const _openExplore = () => router.push(exploreRoute());

/**
 * Home's pull past the bottom into the Explore page: the progress the Discover button draws, and
 * the handler, the ref and the strip the scroll view takes.
 *
 * **Only a second scroll pulls.** The pull is armed while home rests at its bottom, and disarmed
 * as soon as it leaves it. A scroll that arrives at the bottom stops there, the next drag is the
 * one that pulls. So the cook reading down to the last row never sees the page move past it.
 *
 * **Only a finger counts.** The progress moves, the haptic fires at 1 and the release opens the
 * page only between the drag's start and its end. A fling's momentum that runs past the bottom
 * fills nothing and opens nothing: the cook was scrolling, not asking.
 *
 * **Android's strip is drawn only while armed**, so the first scroll stops dead at the content's
 * end, as Android does. It is armed when the scroll comes to rest, never when a drag starts: grown
 * mid-drag, the strip would be counted before the content had it, and the ring would read full.
 * It sits under the screen's edge when it appears, so nothing moves. Home never rests in it: a
 * drag released there scrolls back to the content's bottom, and so does a fling ending there.
 */
export const useDiscoverPull = () => {
  const ref = useAnimatedRef<Animated.ScrollView>();
  const progress = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const isArmed = useSharedValue(false);
  const hasTicked = useSharedValue(false);

  /** The scroll as the model reads it: the content's own height, without the strip while it is drawn. */
  const measureOf = (event: ScrollEvent) => {
    "worklet";
    return {
      offset: event.contentOffset.y,
      viewport: event.layoutMeasurement.height,
      content: event.contentSize.height - (isArmed.get() ? STRIP : 0),
    };
  };

  /** Where the scroll came to rest decides the next drag: armed at the bottom, not anywhere else. */
  const settle = (event: ScrollEvent) => {
    "worklet";
    isArmed.set(isAtBottomOf(measureOf(event)));
  };

  /** Out of the strip, back to the content's bottom. Nothing on iOS, whose bounce returns by itself. */
  const backToBottom = (event: ScrollEvent) => {
    "worklet";
    if (STRIP === 0 || !isArmed.get()) return;

    const { offset, viewport, content } = measureOf(event);
    const bottom = Math.max(content - viewport, 0);
    if (offset > bottom) scrollTo(ref, 0, bottom, true);
  };

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: (event) => {
      isDragging.set(true);
      // No strip to grow on iOS, so the drag itself can arm.
      if (STRIP === 0) settle(event);
    },
    onScroll: (event) => {
      const measure = measureOf(event);
      if (!isAtBottomOf(measure)) isArmed.set(false);
      if (!isDragging.get() || !isArmed.get()) return;

      const next = pullProgressOf(measure);
      progress.set(next);

      // On the frame the ring closes, and again only if the finger went back below it first.
      if (next >= 1 && !hasTicked.get()) scheduleOnRN(_tick);
      hasTicked.set(next >= 1);
    },
    onEndDrag: (event) => {
      isDragging.set(false);
      hasTicked.set(false);

      const isReached = progress.get() >= 1;
      progress.set(withTiming(0));
      if (isReached) scheduleOnRN(_openExplore);

      const isFling = Math.abs(event.velocity?.y ?? 0) > FLING;
      if (isReached || !isFling) backToBottom(event);
      if (!isFling) settle(event);
    },
    onMomentumEnd: (event) => {
      backToBottom(event);
      settle(event);
    },
  });

  const strip = useAnimatedStyle(() => ({ height: isArmed.get() ? STRIP : 0 }));

  return {
    ref,
    progress,
    /** Not attached on the web, which has no pull to read. */
    onScroll: Platform.OS === "web" ? undefined : onScroll,
    /** The blank under home's last row to pull into: Android only, and only while armed. */
    strip,
  };
};
