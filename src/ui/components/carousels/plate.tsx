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

type Props = {
  style?: ViewStyle,
  items: Plate[],
}

/** The badge is absolutely positioned, so it has no intrinsic width to grow from. Approximate one
 *  from the label lengths — roughly 11px a character, and the subtitle sits a size smaller. */
const _badgeMinWidth = ({ title, subtitle }: Plate) =>
  Math.max(title.length, (subtitle?.length ?? 0) * 0.8) * 11;

export const PlateCarousel = ({ style, items }: Props) => {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width);
  const scrollX = useSharedValue(0);
  const listRef = useRef<FlashListRef<Plate>>(null);

  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Half a viewport minus half a plate on each end, so item 0 and item n-1 can both sit centred.
   *  The right side drops one gap: the last item still carries its trailing margin, and without
   *  this you can scroll a gap's worth past the final plate and it never quite settles centred. */
  const sidePadding = Math.max((width - PLATE_SIZE) / 2, 0);

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
      const lastIndex = Math.max(items.length - 1, 0);
      const nearest = Math.min(Math.max(Math.round(offset / SNAP), 0), lastIndex);
      const target = nearest * SNAP;

      if (Math.abs(offset - target) < SETTLE_TOLERANCE) return;

      listRef.current?.scrollToOffset({ offset: target, animated: true });
    }, SETTLE_DELAY);
  }, [items.length]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
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
        renderItem={({ item, index }) => (
          <PlateItem plate={item} index={index} scrollX={scrollX} />
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
    paddingBottom: theme.spacing[24]
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
