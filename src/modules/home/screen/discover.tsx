import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { CircleCheckIcon, GlobeIcon } from "@ui/icons";
import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { exploreRoute } from "~/modules/explore/routes";

type Props = {
  /** 0 to 1: 0 shows the globe, above 0 the ring in its place fills, 1 shows the check. Driven by home's scroll. */
  progress: SharedValue<number>;
};

/** The ring takes the globe's box and close to its stroke width, so the swap moves nothing. */
const ICON_SIZE = 20;
const RING_STROKE = 2;
const RADIUS = (ICON_SIZE - RING_STROKE) / 2;
const CENTER = ICON_SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The last thing on home: the way to the Explore page, by a tap or, on a phone, by pulling past
 * the bottom (`HomeScreen`).
 *
 * While a pull is under way the globe gives its place to a ring that fills with the pull: the
 * cook sees how far is left before letting go. Full, the ring becomes a check, as the haptic fires:
 * letting go now opens the page. Both the swap and the fill run on the UI thread,
 * read from `progress`: nothing crosses to React while the finger moves.
 */
export const Discover = ({ progress }: Props) => {
  const t = useTranslations("Home");
  const fill = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.get()),
  }));
  const globe = useAnimatedStyle(() => ({
    opacity: progress.get() > 0 ? 0 : 1,
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: progress.get() > 0 && progress.get() < 1 ? 1 : 0,
  }));
  const check = useAnimatedStyle(() => ({
    opacity: progress.get() >= 1 ? 1 : 0,
  }));

  return (
    <Pressable
      onPress={() => router.push(exploreRoute())}
      accessibilityRole="button"
      accessibilityLabel={t("Discover.label")}
      style={styles.container}
    >
      <View style={styles.icon}>
        <Animated.View style={globe}>
          <GlobeIcon size={ICON_SIZE} color={colors.foreground} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, ring]}>
          <Svg width={ICON_SIZE} height={ICON_SIZE}>
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={colors.border.default}
              strokeWidth={RING_STROKE}
            />
            <AnimatedCircle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={colors.foreground}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              animatedProps={fill}
              // From twelve o'clock, clockwise, as the score ring fills.
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, check]}>
          <CircleCheckIcon size={ICON_SIZE + 1.5} color={colors.foreground} />
        </Animated.View>
      </View>
      <Text.Base weight={600} color={theme.colors.muted}>
        {t("Discover.label")}
      </Text.Base>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: theme.spacing[8],
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[20],
    backgroundColor: colors.surface.elevated,
    borderColor: colors.border.default,
    borderWidth: 2,
    borderRadius: theme.radius.lg,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
});
