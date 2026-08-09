import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ViewStyle, useWindowDimensions, LayoutChangeEvent } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { FlashList, FlashListProps, FlashListRef } from "@shopify/flash-list";
import { Image, ImageProps } from "@ui/image";
import { theme } from "theme";
import { Text } from "@ui/text";
import { BlurView } from "@ui/blur-view";
import { Pressable } from "@ui/pressable";
import { ButtonIcon } from "@ui/button-icon";
import { ArrowLeftRight, Icon, MorphIcon } from "@ui/icons";

/** Plate diameter at rest, and how much of it is left when the plate is off-centre. */
const PLATE_SIZE = 164;
const PLATE_GAP = theme.spacing[16];
const SIDE_SCALE = 0.7;

/** One item advances by exactly this much, so a snap offset is always `index * SNAP`. */
const SNAP = PLATE_SIZE + PLATE_GAP;

/** How still the list must be before we correct it, and how far off-centre is worth correcting. */
const SETTLE_DELAY = 120;
const SETTLE_TOLERANCE = 1;

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
 *  from the label lengths — roughly 11px a character, and the subtitle sits a size smaller. */
const _badgeMinWidth = ({ title, subtitle }: Plate) =>
  Math.max(title.length, (subtitle?.length ?? 0) * 0.8) * 11;

export const PlateCarousel = <T extends Plate>({
  style,
  items,
  selectedIndex,
  onSelect
}: Props<T>) => {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width);
  const scrollX = useSharedValue(0);
  const listRef = useRef<FlashListRef<Plate>>(null);

  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Which plate we consider centred, and whether the movement getting it there is ours.
   *  `scrollX` drives the animation on the UI thread; `scrollOffset` is it on this one. */
  const centred = useRef(selectedIndex ?? 0);
  const driving = useRef(false);
  const scrollOffset = useRef(0);

  /** Half a viewport minus half a plate on each end, so item 0 and item n-1 can both sit centred.
   *  The right side drops one gap: the last item still carries its trailing margin, and without
   *  this you can scroll a gap's worth past the final plate and it never quite settles centred. */
  const sidePadding = Math.max((width - PLATE_SIZE) / 2, 0);

  /** The slot the viewport is closest to right now — where a release here would settle. */
  const nearestIndex = useCallback(
    (offset: number) =>
      Math.min(Math.max(Math.round(offset / SNAP), 0), Math.max(items.length - 1, 0)),
    [items]
  );

  /**
   * Report the centred plate while the finger is still moving, not once the list has stopped:
   * the screen mirrors the selection elsewhere (the day markers), and waiting for the settle
   * makes that mirror lag the carousel by a visible beat. Guarding on the index means one call
   * per plate crossed rather than one per scroll frame.
   */
  const select = useCallback((offset: number) => {
    scrollOffset.current = offset;

    /** Frames from our own animation are not the user choosing anything, and reporting them would
     *  emit every plate it travels over. It ends on `centred`, which is where we release. */
    if (driving.current) {
      if (Math.abs(offset - centred.current * SNAP) < SETTLE_TOLERANCE) driving.current = false;
      return;
    }

    const index = nearestIndex(offset);

    if (index === centred.current) return;

    const plate = items[index];

    if (!plate) return;

    centred.current = index;
    onSelect?.(plate);
  }, [items, nearestIndex, onSelect]);

  /**
   * `snapToInterval` covers iOS and Android, but react-native-web ignores it — it only snaps for
   * `pagingEnabled` — and a native release with almost no velocity can still settle between slots.
   * So once the list has held still for a moment, round the offset to the nearest slot ourselves.
   * The tolerance check makes this idempotent, which is what stops our own animated correction
   * from re-triggering the settle it just satisfied.
   */
  const settle = useCallback((offset: number) => {
    clearTimeout(settleTimer.current);

    settleTimer.current = setTimeout(() => {
      /** Nothing has moved for a while, so no animation of ours is still running — releasing here
       *  is what stops an interrupted one from muting selection until the next drive. */
      driving.current = false;

      const target = nearestIndex(offset) * SNAP;

      if (Math.abs(offset - target) < SETTLE_TOLERANCE) return;

      listRef.current?.scrollToOffset({ offset: target, animated: true });
    }, SETTLE_DELAY);
  }, [nearestIndex]);

  /** Move the list ourselves, muting `select` for the frames it takes to arrive. Skipped when we
   *  are already there: no scroll event would follow, and the mute would never be released. */
  const scrollToIndex = useCallback((index: number, animated: boolean) => {
    const target = index * SNAP;

    centred.current = index;

    if (Math.abs(scrollOffset.current - target) < SETTLE_TOLERANCE) return;

    driving.current = true;
    listRef.current?.scrollToOffset({ offset: target, animated });
  }, []);

  /** Follow the caller's selection — a tap on the day markers, a restored route param. Comparing
   *  against `centred` is what keeps the echo of our own `onSelect` from scrolling the list: that
   *  echo lands mid-gesture, and acting on it would pull the plates out from under the finger. */
  useEffect(() => {
    if (selectedIndex === undefined || selectedIndex === centred.current) return;
    if (items[selectedIndex] === undefined) return;

    scrollToIndex(selectedIndex, true);
  }, [selectedIndex, items, scrollToIndex]);

  /** FlashList measures itself at the end of its first render, so an offset set any earlier has
   *  nothing to apply to. `onLoad` is the first moment the initial selection can be honoured. */
  const onLoad = () => {
    if (selectedIndex === undefined || items[selectedIndex] === undefined) return;

    scrollToIndex(selectedIndex, false);
  };

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
    runOnJS(select)(event.contentOffset.x);
    runOnJS(settle)(event.contentOffset.x);
  });

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={style}>
      <AnimatedFlashList
        ref={listRef as unknown as PlateListRef}
        horizontal
        data={items}
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={{
          ...styles.container,
          paddingLeft: sidePadding,
          paddingRight: Math.max(sidePadding - PLATE_GAP, 0)
        }}
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollBeginDrag={() => { driving.current = false }}
        onLoad={onLoad}
        renderItem={({ item, index }) => (
          <PlateItem plate={{
            ...item,
            onPress: item.onPress ?? (onSelect ? () => onSelect(item as T) : undefined)
          }} index={index} scrollX={scrollX} />
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

const PlateItem = ({ plate, index, scrollX }: PlateItemProps) => {
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
        <BlurView
          tint="light"
          style={[styles.itemBadge, styles.itemBadgePosition, { minWidth: _badgeMinWidth(plate) }]}
        >
          <Text.Base
            numberOfLines={1}
          >
            {plate.title}
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
    backgroundColor: theme.colors.surface.elevated,
    borderWidth: 2,
    borderColor: theme.colors.border.default,
    textAlign: "center",
    alignItems: "center",
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
