import { ScrollView, StyleSheet } from "react-native";
import { theme } from "theme";

import { WeeklyPlan } from "~/modules/planning/weekly-plan";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { HomeHeader } from "./screen.header";
import { QuickAccess } from "./screen.quick-access";
import { WeeklySpotlight } from "./screen.spotlight";

import { RadialGradient } from "@ui/radial-gradient";
import { LinearGradient } from "expo-linear-gradient";

/**
 * Home: this week's plan and the shortcuts around it.
 *
 * Composition only. Each section owns its own layout and its own data, so wiring one to Convex
 * is an edit to that file and nothing else (ADR 0006).
 *
 * `WeeklyPlan` comes from `planning/` because that module owns the plan's data, not because Home
 * is short of a place to put it. It nests inside this scroll view, which is why this file
 * composes it rather than the route.
 */
export const HomeScreen = () => (
  <>
    <LinearGradient
      style={StyleSheet.absoluteFill}
      colors={[theme.colors.neutral.subtle, theme.colors.background]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    />
    <ScrollView contentContainerStyle={styles.page}>
      <RadialGradient
        size={340}
        colors={[theme.colors.primary.base, theme.colors.neutral.subtle]}
        style={{ position: "absolute", top: 24, left: -32, opacity: 0.1 }}
      />
      <HomeHeader />
      <WeeklyPlan />
      <QuickAccess />
      <WeeklySpotlight />
    </ScrollView>
  </>
);

const styles = StyleSheet.create({
  /** Clears the navigation bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET },
});
