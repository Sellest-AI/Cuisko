import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ViewStyle, useWindowDimensions, LayoutChangeEvent, Platform } from "react-native";
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  runOnUI,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
  type WithSpringConfig,
} from "react-native-reanimated";
import { FlashList, FlashListProps, FlashListRef } from "@shopify/flash-list";
import { Image, ImageProps } from "@ui/image";
import { theme } from "theme";
import { Text } from "@ui/text";
import { BlurScope, BlurTarget, BlurView } from "@ui/blur-view";
import { useBlurTarget } from "@ui/hooks/useBlurTarget";
import { Pressable } from "@ui/pressable";
import { ButtonIcon } from "@ui/button-icon";
import { ArrowLeftRight, Icon, MorphIcon } from "@ui/icons";

const MAX_TITLE_LENGTH = 16;

/** Plate diameter at rest, and how much of it is left when the plate is off-centre. */
const PLATE_SIZE = 164;
const PLATE_GAP = theme.spacing[16];
const SIDE_SCALE = 0.7;

/** One item advances by exactly this much, so a snap offset is always `index * SNAP`. */
const SNAP = PLATE_SIZE + PLATE_GAP;

/** How still the list must be before we correct it, and how far off-centre is worth correcting. */
const SETTLE_DELAY = 120;
const SETTLE_TOLERANCE = 1;

/** How long a release is assumed to keep coasting at its exit speed before it picks a slot, and
 *  the most slots one flick may cover. Together they are what makes a fast flick cross several
 *  plates and a lazy nudge cross one — a fixed one-item snap is what reads as mechanical. */
const FLING_REACH = 190;
const FLING_MAX = 2;

/** Deliberately under-damped: the plate arrives, overshoots by a hair and rocks back. Raising
 *  `damping` takes the bounce out; raising `stiffness` makes the whole trip quicker. */
const SNAP_SPRING: WithSpringConfig = {
  damping: 16,
  stiffness: 90,
  mass: 1,
};

/** Release velocity is sampled in points per millisecond; springs want points per second. */
const PER_SECOND = 1000;

/**
 * How much of the exit speed the spring inherits, and the ceiling on what it may inherit.
 *
 * The throw is already spent once: it is what chose the target slot. Handing the spring the whole
 * of it spends it a second time, and the two compound — a hard flick picks a slot far away *and*
 * departs fast enough to be there in a blink, which is not a scroll anyone can follow. The carry
 * exists only so the plate does not visibly stall at the moment the finger leaves it; the spring,
 * not the throw, is what decides how long the trip takes.
 */
const FLING_CARRY = 0.5;
const FLING_CARRY_MAX = 1800;

/** A sample older than this is a finger that stopped before it let go — a coast, not a flick. */
const VELOCITY_STALE = 120;

export type Plate = {
  /** Anything expo-image takes — a remote URL string, or a bundled `require(...)` asset. */
  imageSrc: ImageProps["source"],
  title: string,
  onPress?: () => void,
  onReplace?: () => void,
  subtitle?: string
  icon?: Icon,
}

/** FlashList is generic; the animated wrapper needs a concrete props type to attach onScroll. */
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as React.ComponentType<FlashListProps<Plate>>
);

/** Reanimated types the wrapper's ref as the component itself, but what FlashList forwards is its
 *  imperative handle — hence the cast at the ref site. */
type PlateListRef = React.ComponentProps<typeof AnimatedFlashList>["ref"];

type Props<T extends Plate> = {
  style?: ViewStyle,
  items: T[],
  /** Index of the plate to hold centred. A change the caller makes is followed; the one we just
   *  reported through `onSelect` is not, so mirroring that straight back here costs nothing. */
  selectedIndex?: number,
  onSelect?: (plate: T) => void
}

/** The badge is absolutely positioned, so it has no intrinsic width to grow from. Approximate one
 *  from the label lengths — roughly 10px a character, and the subtitle sits a size smaller. */
const _badgeMinWidth = ({ title, subtitle }: Plate) =>
  Math.max(Math.min(MAX_TITLE_LENGTH, title.length), (subtitle?.length ?? 0) * 0.8) * 10;

export const PlateCarousel = <T extends Plate>({
  style,
  items,
  selectedIndex,
  onSelect
}: Props<T>) => {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width);

  const listRef = useRef<FlashListRef<Plate>>(null);

  /** `scrollTo` needs the scroll view's node rather than FlashList's handle — but reanimated
   *  unwraps one from the other (`getNativeScrollRef`), so handing it the list ref is enough. */
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const x = useSharedValue(0);
  const offset = useSharedValue(0);
  const active = useSharedValue(false);
  const reported = useSharedValue(selectedIndex ?? 0);
  const speed = useSharedValue(0);
  const lastX = useSharedValue(0);
  const lastAt = useSharedValue(0);

  /**
   * Everything the snap runs on, behind a ref. A shared value is mutable from both threads by
   * design, but the compiler's immutability rule freezes any value an effect or callback closes
   * over — and every one of these is written from inside one. The ref is the shape that says what
   * they actually are: stable in identity, mutable in value, owned by neither render nor a
   * dependency array. Reach them through `snap.current`, never through the bindings above — the
   * one exception being `x` handed to a plate as a prop, which is neither a write nor a closure.
   */
  const snap = useRef({
    /** Live scroll position — the only input the plates scale from. */
    x,
    /** Where our spring is taking the list, and whether it is currently the one moving it. */
    offset,
    active,
    /** The plate the UI thread holds centred; `centred` below is that same index on this one. */
    reported,
    /** Release speed in points per millisecond, sampled from the scroll positions rather than read
     *  off the drag event: the platforms disagree on that field's sign and units, and web never
     *  sends it at all. `lastX` / `lastAt` are the sample it is measured against. */
    speed,
    lastX,
    lastAt
  });

  const centred = useRef(selectedIndex ?? 0);

  /** Half a viewport minus half a plate on each end, so item 0 and item n-1 can both sit centred.
   *  The right side drops one gap: the last item still carries its trailing margin, and without
   *  this you can scroll a gap's worth past the final plate and it never quite settles centred. */
  const sidePadding = Math.max((width - PLATE_SIZE) / 2, 0);

  /** The last slot there is. A worklet captures whole identifiers, not the expressions it reads
   *  from them, so reaching for `items.length` inside one drags every plate across the bridge —
   *  and a plate the caller gave a `Date` cannot be serialised at all. This is what crosses. */
  const lastIndex = Math.max(items.length - 1, 0);

  /** The slot the viewport is closest to right now — where a release here would settle. */
  const nearestIndex = useCallback(
    (offset: number) =>
      Math.min(Math.max(Math.round(offset / SNAP), 0), Math.max(items.length - 1, 0)),
    [items]
  );

  /**
   * Report the centred plate the moment a release picks it, not once the spring has finished:
   * the screen mirrors the selection elsewhere (the day markers), and waiting for the settle
   * makes that mirror lag the carousel by a visible beat.
   */
  const report = useCallback((index: number) => {
    if (index === centred.current) return;

    const plate = items[index];

    if (!plate) return;

    centred.current = index;
    onSelect?.(plate);
  }, [items, onSelect]);

  /**
   * Take the list over and spring it to a slot. This is the whole feel of the carousel: the
   * platform's own `snapToInterval` decelerates into the slot and stops dead there — which is
   * what reads as abrupt — and it cannot overshoot at all. Driving `scrollTo` from a spring
   * instead carries the release velocity through the arrival, so a plate settles rather than lands.
   */
  const startSnap = useCallback((index: number, exitVelocity: number) => {
    "worklet";

    snap.current.offset.value = snap.current.x.value;
    snap.current.reported.value = index;
    snap.current.active.value = true;

    snap.current.offset.value = withSpring(
      index * SNAP,
      { ...SNAP_SPRING, velocity: exitVelocity },
      (finished) => { if (finished) snap.current.active.value = false }
    );
  }, [snap]);

  /** The spring only moves a number; this is what makes the list follow it. Writing `scrollX` here
   *  too keeps the plate scaling on the commanded position, a frame ahead of the scroll event. */
  useAnimatedReaction(
    () => (snap.current.active.value ? snap.current.offset.value : null),
    (target) => {
      if (target === null) return;

      snap.current.x.value = target;
      scrollTo(scrollRef, target, 0, false);
    }
  );

  /**
   * `onEndDrag` covers iOS and Android, but react-native-web only fires it for touch — a
   * wheel or trackpad scroll ends with no event at all, and would be left between slots. So once
   * the list has held still for a moment, snap it ourselves. The tolerance check makes this
   * idempotent, which is what stops our own spring from re-triggering the settle it just satisfied.
   */
  const settle = useCallback((position: number) => {
    clearTimeout(settleTimer.current);

    settleTimer.current = setTimeout(() => {
      if (snap.current.active.value) return;

      const index = nearestIndex(position);

      if (Math.abs(position - index * SNAP) < SETTLE_TOLERANCE) return;

      runOnUI(startSnap)(index, 0);
      report(index);
    }, SETTLE_DELAY);
  }, [nearestIndex, report, snap, startSnap]);

  /** Follow the caller's selection — a tap on the day markers, a restored route param. Comparing
   *  against `centred` is what keeps the echo of our own `onSelect` from scrolling the list: that
   *  echo lands mid-gesture, and acting on it would pull the plates out from under the finger. */
  useEffect(() => {
    if (selectedIndex === undefined || selectedIndex === centred.current) return;
    if (items[selectedIndex] === undefined) return;

    centred.current = selectedIndex;
    runOnUI(startSnap)(selectedIndex, 0);
  }, [selectedIndex, items, startSnap]);

  /** FlashList measures itself at the end of its first render, so an offset set any earlier has
   *  nothing to apply to. `onLoad` is the first moment the initial selection can be honoured —
   *  and it is a placement, not a movement, so it is the one snap that must not spring. */
  const onLoad = () => {
    if (selectedIndex === undefined || items[selectedIndex] === undefined) return;

    centred.current = selectedIndex;
    snap.current.reported.value = selectedIndex;
    snap.current.x.value = selectedIndex * SNAP;
    listRef.current?.scrollToOffset({ offset: selectedIndex * SNAP, animated: false });
  };

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const handlers = useAnimatedScrollHandler({
    onScroll: (event) => {
      const position = event.contentOffset.x;
      const now = performance.now();
      const elapsed = now - snap.current.lastAt.value;

      if (elapsed > 0) {
        const sample = (position - snap.current.lastX.value) / elapsed;

        /** Smoothed, so one stuttering frame near the release cannot decide how far it flies. */
        snap.current.speed.value = elapsed > VELOCITY_STALE ? 0 : snap.current.speed.value * 0.3 + sample * 0.7;
        snap.current.lastX.value = position;
        snap.current.lastAt.value = now;
      }

      /** Frames of our own spring are not the user choosing anything, and the reaction has already
       *  written `snap.current.x` for them — reporting here would emit every plate they travel over. */
      if (snap.current.active.value) return;

      snap.current.x.value = position;
      runOnJS(settle)(position);

      const index = Math.min(Math.max(Math.round(position / SNAP), 0), lastIndex);

      if (index === snap.current.reported.value) return;

      snap.current.reported.value = index;
      runOnJS(report)(index);
    },

    onBeginDrag: (event) => {
      cancelAnimation(snap.current.offset);
      snap.current.active.value = false;
      snap.current.speed.value = 0;
      snap.current.lastX.value = event.contentOffset.x;
      snap.current.lastAt.value = performance.now();
    },

    /** Project where the finger was heading, then snap to the slot nearest *that* — so a flick
     *  crosses as many plates as it was thrown, and only a slow release lands on the next one. */
    onEndDrag: (event) => {
      const position = event.contentOffset.x;
      const from = Math.round(position / SNAP);
      const projected = Math.round((position + snap.current.speed.value * FLING_REACH) / SNAP);

      const index = Math.min(
        Math.max(projected, from - FLING_MAX, 0),
        Math.min(from + FLING_MAX, lastIndex)
      );

      if (index !== snap.current.reported.value) runOnJS(report)(index);

      const carried = snap.current.speed.value * PER_SECOND * FLING_CARRY;

      startSnap(index, Math.max(Math.min(carried, FLING_CARRY_MAX), -FLING_CARRY_MAX));
    }
  }, [lastIndex, report, settle, snap, startSnap]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={style}>
      <AnimatedFlashList
        ref={((node: FlashListRef<Plate> | null) => {
          listRef.current = node;
          scrollRef(node as never);
        }) as unknown as PlateListRef}
        horizontal
        data={items}
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={{
          ...styles.container,
          paddingLeft: sidePadding,
          paddingRight: Math.max(sidePadding - PLATE_GAP, 0)
        }}
        showsHorizontalScrollIndicator={false}
        decelerationRate="normal"
        scrollEventThrottle={16}
        onScroll={handlers}
        onLoad={onLoad}
        renderItem={({ item, index }) => (
          <PlateItem plate={{
            ...item,
            onPress: item.onPress ?? (onSelect ? () => onSelect(item as T) : undefined)
          }} index={index} scrollX={x} />
        )}
      />
    </View>
  )
}

type PlateItemProps = {
  plate: Plate,
  index: number,
  scrollX: SharedValue<number>
}

/** Where the badge landed inside the item, in layout coordinates with its centring applied. */
type BadgeFrame = { left: number, top: number, width: number, height: number };

const PlateItem = ({ plate, index, scrollX }: PlateItemProps) => {
  /** The badge frosts the plate under it, so the plate is what the badge's blur samples. */
  const cover = useBlurTarget();

  /**
   * On Android the target is a second copy of the plate, clipped to the badge's own rectangle and
   * drawn inside it at the opposite offset, so its pixels lie exactly over the visible plate's.
   * Android samples a target by the *screen* distance between the blur and the target's origin,
   * and the whole item is scaled by the carousel — any distance comes out scaled while the sample
   * does not, and a side plate's badge showed the plate shifted by a third of that distance. A
   * distance of zero is exact at every scale. A copy rather than the plate itself because the
   * native target clips its children: a plate placed outside the badge's rectangle disappears.
   * The copy is invisible in practice — under the badge, over identical pixels — and the image
   * cache serves it. The badge is centred by a translate of half its width, which `onLayout`
   * does not include, hence the subtraction. iOS and web sample under the badge on their own.
   */
  const [badge, setBadge] = useState<BadgeFrame | null>(null);
  const onBadgeLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) =>
    setBadge({ left: layout.x - layout.width / 2, top: layout.y, width: layout.width, height: layout.height });

  const animatedStyle = useAnimatedStyle(() => {
    /** 0 when this plate is centred, ±1 when it is one slot away. */
    const distance = Math.abs(scrollX.value / SNAP - index);

    return {
      transform: [{ scale: interpolate(distance, [0, 1], [1, SIDE_SCALE], Extrapolation.CLAMP) }],
    };
  });

  return (
    <Animated.View style={[animatedStyle]}>
      <Pressable style={styles.item} onPress={plate.onPress}>
        <Image
          source={plate.imageSrc}
          contentFit="contain"
          style={styles.plate}
        />
        {plate.icon && <MorphIcon
          icon={plate.icon}
          size={32}
          color={theme.colors.neutral.foreground}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: [{ translateX: -16 }, { translateY: -16 }],
          }}
        />}
        {/* The icon is not copied: it sits at the plate's centre, nowhere near the badge. */}
        {Platform.OS === "android" && badge && (
          <BlurTarget target={cover} style={[styles.plateTarget, badge]}>
            {/*
              * Inside the target, not on it: the plate is a PNG with transparent surroundings,
              * and the sampler paints the *window* background under transparent pixels — which
              * is whatever the phone's theme says, not the page. An opaque page-coloured layer
              * under the copy makes the sample the page's own colour, and it hides under the badge.
              */}
            <View style={[StyleSheet.absoluteFill, {
              backgroundColor: theme.colors.neutral.elevated,
              // The target is the badge's rectangle; the badge is a pill, so its corners stay clear.
              borderRadius: styles.itemBadge.borderRadius,
            }]} />
            <Image
              source={plate.imageSrc}
              contentFit="contain"
              style={[styles.plate, { position: "absolute", left: -badge.left, top: -badge.top }]}
            />
          </BlurTarget>
        )}
        <BlurScope target={cover}>
          <BlurView
            tint="extraLight"
            onLayout={onBadgeLayout}
            style={[styles.itemBadge, styles.itemBadgePosition, { minWidth: _badgeMinWidth(plate) }]}
          >
            <Text.Base
              numberOfLines={1}
            >
              {plate.title.length > MAX_TITLE_LENGTH ? plate.title.slice(0, MAX_TITLE_LENGTH) + "…" : plate.title}
            </Text.Base>
            {plate.subtitle ? (
              <Text.Sm
                color={theme.colors.muted}
                style={{ marginTop: 1, minWidth: "auto" }}
                numberOfLines={1}
              >
                {plate.subtitle}
              </Text.Sm>
            ) : null}
          </BlurView>
        </BlurScope>
        {plate.onReplace && <ButtonIcon
          onPress={plate.onReplace}
          composite={false}
          variant="neutral-subtle"
          size="sm"
          style={{
            position: "absolute",
            top: theme.spacing[4],
            right: theme.spacing[4]
          }}
        >{ArrowLeftRight}</ButtonIcon>}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 36
  },
  item: {
    width: PLATE_SIZE,
    marginRight: PLATE_GAP
  },
  plate: {
    width: PLATE_SIZE,
    height: PLATE_SIZE
  },
  /** Sized and placed by the badge's measured frame. */
  plateTarget: {
    position: "absolute",
  },
  itemBadgePosition: {
    position: "absolute",
    bottom: -theme.spacing[16],
    right: 0,
    marginHorizontal: "auto",
    left: "50%",
    transform: [{ translateX: "-50%" }],
    minWidth: "80%"
  },
  itemBadge: {
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[6],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface.elevatedSubtle,
    borderWidth: 2,
    borderColor: theme.colors.border.default,
    textAlign: "center",
    alignItems: "center",
    overflow: "hidden",
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 1,
        blurRadius: 24,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ]
  }
})
