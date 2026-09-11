import { useFocusEffect } from "expo-router";
import { ComponentProps, ReactNode, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Animated, Dimensions, Platform, ScrollView, View, ViewStyle } from "react-native";
import Reanimated, { interpolate, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Image } from "./image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "./safe-area-view";
import { colors } from "~/global/theme";

const AnimatedImage = Platform.OS === "ios" ? Reanimated.Image : Animated.createAnimatedComponent(Image);

/** Header content, then `contentHeader`, then the bar — third child, so index 2. */
const STICKY_HEADER_INDEX = 2;

type Props = {
  ref?: React.Ref<ScrollView>;
  /** Space between the header and the scrollable content */
  contentNegativeSpace?: number;
  /** Height of the header */
  headerContent: ReactNode;
  headerContentEdges?: ComponentProps<typeof SafeAreaView>["edges"];
  /**
   * A url, or a bundled asset from `require`. Nothing wider: the image is React Native's on iOS and
   * expo-image's on Android, and these two are the sources both of them draw.
   */
  headerBackgroundImage?: string | number;
  headerBackgroundImageStyle?: ComponentProps<typeof Image>["style"] & { blurRadius?: number };
  headerBackgroundImagePosition?: ComponentProps<typeof Image>["contentPosition"];
  headerBackground?: ReactNode;
  headerBackgroundGradient?: boolean;
  /**
   * Content that flows directly under the header and scrolls away above `stickyHeader`.
   *
   * A separate slot rather than the top of `children` because a sticky header has to be a direct
   * child of the ScrollView — `stickyHeaderIndices` addresses children by position, and anything
   * nested one view deeper cannot be named. Anything above the bar therefore has to be handed over
   * separately so it can take the position before it.
   */
  contentHeader?: ReactNode;
  /** A bar that scrolls up with `contentHeader` and then pins to the top of the viewport. */
  stickyHeader?: ReactNode;
  stickyHeaderStyle?: ViewStyle;
  children: ReactNode;
  contentContainerStyle?: ViewStyle;
  showsVerticalScrollIndicator?: boolean;
  locked?: boolean;
  style?: ViewStyle;
  /** Scroll key to control scroll position */
  scrollKey?: string | number;
  /** Allow negative scroll */
  enableExpandHeader?: boolean;
};

export const ParallaxScrollView = ({
  ref,
  scrollKey = undefined,
  contentNegativeSpace = 0,
  headerContent,
  headerContentEdges,
  headerBackgroundImageStyle,
  headerBackgroundImagePosition,
  headerBackgroundGradient = true,
  headerBackgroundImage,
  headerBackground,
  contentHeader,
  stickyHeader,
  stickyHeaderStyle,
  children,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
  locked = false,
  enableExpandHeader = false,
  style,

}: Props) => {
  const [headerHeight, setHeaderHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => scrollRef.current!, []);

  // Force reset layout to fix iOS black bar without flickering
  const [layoutToggle, setLayoutToggle] = useState(0);
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "ios") return;
    requestAnimationFrame(() => {
      // Toggle a sub-pixel value to force native layout recalculation
      // without causing a visual 1px jump (flicker)
      setLayoutToggle((k) => k === 0 ? 0.01 : 0);
      requestAnimationFrame(() => setLayoutToggle((k) => k > 0 ? 0 : 0.01));
    });
  }, []));

  const scrollY = useRef(new Animated.Value(0)).current;

  // For content inside ScrollView: counteract natural scroll to create parallax
  // eslint-disable-next-line react-hooks/refs
  const headerContentParallax = scrollY.interpolate({
    inputRange: [-headerHeight, 0, headerHeight],
    outputRange: [-headerHeight * 1.2, 0, headerHeight / 2], // Positive to slow down natural scroll
    extrapolate: "clamp",
  });

  // eslint-disable-next-line react-hooks/refs
  const headerOpacity = scrollY.interpolate({
    inputRange: [-headerHeight / 4, 0, headerHeight / 1.3, headerHeight],
    outputRange: [0, 1, 0.05, 0],
    extrapolate: "clamp",
  });

  const backgroundImageOpacity = Number((headerBackgroundImageStyle as { opacity?: number })?.opacity) || 1;
  // eslint-disable-next-line react-hooks/refs
  const headerBackgroundImageOpacity = scrollY.interpolate({
    inputRange: [-headerHeight / 4, 0, headerHeight / 1.3, headerHeight],
    outputRange: [1.1, backgroundImageOpacity, 0.05, 0],
    extrapolate: "clamp",
  });

  // eslint-disable-next-line react-hooks/refs
  const headerBackgroundScale = scrollY.interpolate({
    inputRange: [-headerHeight, 0, headerHeight / 2.5],
    outputRange: [1.1, 1, 1.02],
    extrapolate: "clamp",
  });

  const scrollYReanimated = useSharedValue(0);
  useEffect(() => {
    const listener = scrollY.addListener(({ value }) => {
      scrollYReanimated.value = value;
    });
    return () => scrollY.removeListener(listener);
    // eslint-disable-next-line react-hooks/refs
  }, [scrollY, scrollYReanimated]);

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    height: interpolate(
      scrollYReanimated.value,
      [-headerHeight, 0],
      [headerHeight * 2, headerHeight],
      "clamp"
    ),
    transform: [{
      translateY: interpolate(
        scrollYReanimated.value,
        [0, headerHeight],
        [0, -headerHeight / 2],
        "clamp"
      )
    }]
  }));

  const { bottom: _bottom, top } = useSafeAreaInsets();
  const bottom = Platform.OS === "android" ? _bottom : 0;

  /**
   * The bar pins once the scroll reaches its own offset in the content, so the status-bar inset is
   * only needed from that point on — held open from the start it is a gap under a header that is
   * still sitting mid-screen. It opens over the last `top` pixels before the bar pins, which lands
   * it at full height exactly as the bar touches the top of the viewport.
   *
   * `marginBottom` cancels the padding it just added, so the bar grows without costing the content
   * below a single pixel of flow. Without it the whole page below shifts down by `top` over the
   * same `top` pixels of scroll — the content stops dead for the length of the reveal and then
   * lurches back into motion. Cancelled, the two offsets sum to zero at every frame: the bar sits
   * still at `top` from the moment the reveal starts until long after it has pinned.
   *
   * The offset is read off the bottom of the slot above rather than from the bar itself: the
   * ScrollView wraps a sticky child in a view of its own, so the bar measures `y: 0` against that
   * wrapper and never against the content. The slot above is an ordinary child, and its bottom
   * edge is the same number.
   */
  const [stickyHeaderOffset, setStickyHeaderOffset] = useState(0);
  const revealsInset = Boolean(stickyHeader) && top > 0 && stickyHeaderOffset > 0;
  const stickyHeaderInsetStyle = useAnimatedStyle(() => {
    const inset = revealsInset
      ? interpolate(
        scrollYReanimated.value,
        [stickyHeaderOffset - top, stickyHeaderOffset],
        [0, top],
        "clamp"
      )
      : 0;
    return { paddingTop: inset, marginBottom: -inset };
  });

  // Scroll to top when scrollKey changes
  useEffect(() => {
    if (scrollKey !== undefined) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [scrollKey]);

  return (
    <View style={{ flex: 1, ...style }}>
      {/* Parallax Background Header */}
      <Reanimated.View
        style={[{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: headerHeight,
          zIndex: 0,
          overflow: "hidden",
          paddingTop: layoutToggle,
        }, headerAnimatedStyle]}
        pointerEvents="none"
      >
        <Animated.View style={[{
          position: "absolute",
          inset: 0,
          opacity: headerBackgroundImageOpacity,
          transform: [{ scale: headerBackgroundScale }],
        }]}>
          {headerBackground && <View style={{
            position: "absolute",
            inset: 0,
          }}>
            {headerBackground}
          </View>}
          {headerBackgroundImage && (
            <AnimatedImage
              /**
               * A url is cached; anything else (a bundled `require`) is already a source and goes
               * through untouched. Stringifying it would ask the network for "12".
               */
              source={typeof headerBackgroundImage === "string"
                ? { uri: headerBackgroundImage, cache: "force-cache" }
                : headerBackgroundImage}
              style={[{
                position: "absolute",
                width: "100%",
                height: "100%",
                paddingTop: layoutToggle,
              },
                headerBackgroundImageStyle,
              { opacity: 1 }
              ]}
              blurRadius={headerBackgroundImageStyle?.blurRadius ?? 0}
              // DISABLED: reanimated wraps react native component and not expo image
              // Expo image causes black bar on ios
              contentPosition={headerBackgroundImagePosition}
              contentFit="cover"
            />
          )}
        </Animated.View>
        {headerBackgroundGradient && <Animated.View style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -1,
          height: "50%",
        }}>
          <LinearGradient
            colors={["transparent", "rgba(0, 0, 0, 0.3)"]}
            style={{
              width: "100%",
              height: "100%"
            }}
          />
        </Animated.View>}
        {headerBackgroundGradient && <LinearGradient
          colors={["rgba(0, 0, 0, 0.3)", "transparent"]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: "30%",
            opacity: 0.8
          }}
        />}
      </Reanimated.View>

      {/* Scrollable Content */}
      <Animated.ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        contentContainerStyle={contentContainerStyle}
        /**
         * Positional, so the three content slots below are always rendered even when empty — an
         * index that moved with an absent prop would pin the wrong view.
         */
        stickyHeaderIndices={stickyHeader ? [STICKY_HEADER_INDEX] : undefined}
        onScroll={Animated.event(
          // eslint-disable-next-line react-hooks/refs
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        bounces={enableExpandHeader}
        overScrollMode={enableExpandHeader ? "always" : "never"}
        nestedScrollEnabled={true}
      >
        {/* Interactive Header Content */}
        <Animated.View
          onLayout={(layout) => setHeaderHeight(layout.nativeEvent.layout.height)}
          style={{
            position: "relative",
            transform: [{ translateY: headerContentParallax }],
            opacity: headerOpacity,
            zIndex: 1,
          }}
          pointerEvents="box-none"
        >
          <SafeAreaView
            pointerEvents="box-none"
            edges={{ bottom: "off", ...headerContentEdges }}
          >
            {headerContent}
          </SafeAreaView>
        </Animated.View>

        {/*
          * Content above the sticky bar. It carries the pull-up over the header whether or not it
          * holds anything, so an empty slot still seats the content against the photo.
          */}
        <View
          onLayout={(layout) => {
            const { y, height } = layout.nativeEvent.layout;
            setStickyHeaderOffset(y + height);
          }}
          style={{
            zIndex: 1,
            marginTop: -contentNegativeSpace,
          }}
          pointerEvents="box-none"
        >
          <View style={{
            pointerEvents: "none",
            position: "absolute",
            left: 0,
            right: 0,
            top: headerBackgroundGradient ? 0 : -32,
            height: headerHeight,
          }}
          >
            <LinearGradient
              colors={[colors.transparent.light, colors.background]}
              style={{
                height: 132,
              }}
            />
            <View style={{ flex: 1, backgroundColor: colors.background }} />
          </View>
          {contentHeader}
        </View>

        {/* The bar itself. Above the content it pins over, so what scrolls under it stays under. */}
        <View style={{ zIndex: 2 }}>
          {/*
            * Inside the sticky child, never as the sticky child: the ScrollView freezes the props
            * of the view it wraps a sticky header in, and a frozen animated style is one Reanimated
            * can no longer write to. It carries `stickyHeaderStyle` so that the band the padding
            * opens is painted by the caller's own background.
            */}
          <Reanimated.View style={[stickyHeaderStyle, stickyHeaderInsetStyle]}>
            {stickyHeader}
          </Reanimated.View>
        </View>

        {/*
          * Content with background.
          *
          * No `flex` here, deliberately. This is a direct child of the scroll content container,
          * whose main axis is unbounded — there is no free space for `flexGrow` to hand out, so
          * `flex: 1` leaves the view sitting on its `flexBasis` of 0 and the tab measures to zero
          * height on iOS. It grows from its children instead.
          */}
        <View
          key={locked ? "locked" : "unlocked"}
          style={{
            zIndex: 1,
            pointerEvents: "auto",
            height: locked ?
              Dimensions.get("screen").height - headerHeight + contentNegativeSpace - bottom
              : undefined,
          }}>
          {children}
        </View>
      </Animated.ScrollView>
    </View >
  );
};
