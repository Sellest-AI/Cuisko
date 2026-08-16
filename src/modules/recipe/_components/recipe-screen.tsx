import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";

import { RadialGradient } from "@ui/radial-gradient";
import { theme } from "theme";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  customGradient?: [string, string]
};

/**
 * The ground every recipe tab is drawn on, and the room it leaves for the navigation bar.
 *
 * The three tabs share one scroll container in `chrome.tsx`, so the ground has to be identical
 * between them or switching tabs would repaint the background mid-transition. It lives here rather
 * than in each route file for the same reason the chrome does: `app/` routes only route.
 *
 * Deliberately no horizontal padding — the overview's rows bleed to the screen edge and pad their
 * own content instead, which a gutter on this container would make impossible.
 */
export const RecipeScreen = ({ children, style, customGradient }: Props) => (
  <View style={[styles.screen, style]}>
    <LinearGradient
      colors={customGradient || [theme.colors.neutral.subtle, theme.colors.neutral.subtle, theme.colors.background]}
      style={StyleSheet.absoluteFill}
    />
    <RadialGradient
      size={GLOW_SIZE}
      colors={[theme.colors.primary.subtle, theme.colors.neutral.subtle]}
      style={styles.glow}
    />
    {children}
  </View>
);

/** Wide enough to wash the whole top of the screen, hung off the left edge so it reads as a corner. */
const GLOW_SIZE = 400;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.background,
    paddingTop: theme.spacing[12],
    paddingBottom: NAVIGATION_BAR_OFFSET,
  },
  glow: {
    position: "absolute",
    top: 0,
    left: -100,
    opacity: 0.5,
  },
});
