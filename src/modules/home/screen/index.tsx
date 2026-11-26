import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { theme } from "theme";

import { WeeklyPlan } from "~/modules/planning/weekly-plan";
import { WeekSummaryReveal } from "~/modules/health/week-summary-reveal";
import { FavoriteRecipes } from "~/modules/recipes/favorite-recipes";
import { FeaturedRecipes } from "~/modules/recipes/featured-recipes";
import { FeaturedCategories } from "~/modules/explore/featured-categories";
import { useNavigationBarClearance } from "~/modules/navigation/hooks";

import { useDiscoverPull } from "../_hooks/useDiscoverPull";
import { Discover } from "./discover";
import { HomeHeader } from "./header";
import { QuickAccess } from "./quick-access";
import { WeeklySpotlight } from "./spotlight";

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
 * composes it rather than the route. `FavoriteRecipes` comes from `recipes/` on the same terms,
 * and sits last: the plan is what the cook committed to, the ideas are the week's, and what they
 * kept is the shelf to reach for when neither is what they want tonight.
 *
 * `FeaturedRecipes`, from `recipes/` too, comes first of the three rows, before the ideas: the
 * catalog's row, and the one a guest sees, since the other two need an account.
 *
 * Then the catalog: `FeaturedCategories` from `explore/`, and `Discover` at the very bottom,
 * because the pull that opens the Explore page is a pull past the bottom (`useDiscoverPull`).
 */
export const HomeScreen = () => {
  const clearance = useNavigationBarClearance();
  const { ref, progress, onScroll, strip } = useDiscoverPull();

  return (
    <>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={[theme.colors.neutral.subtle, theme.colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <Animated.ScrollView
        ref={ref}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: clearance + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <RadialGradient
          size={340}
          colors={[theme.colors.primary.base, theme.colors.neutral.subtle]}
          style={{ position: "absolute", top: 220, left: -56, opacity: 0.1 }}
        />
        <WeekSummaryReveal header={(scoreButton) => <HomeHeader action={scoreButton} style={styles.header} />} />
        <WeeklyPlan />
        <View style={styles.divider} />
        <QuickAccess />
        <FeaturedRecipes style={styles.featured} />
        <WeeklySpotlight style={styles.spotlight} />
        <FavoriteRecipes style={styles.favorites} />
        <FeaturedCategories style={styles.categories} />
        <Discover progress={progress} />
        <Animated.View style={strip} />
      </Animated.ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  header: { marginBottom: theme.spacing[16] },
  featured: { marginTop: theme.spacing[28], marginBottom: -theme.spacing[16] },
  favorites: { marginTop: theme.spacing[28], marginBottom: -theme.spacing[12] },
  spotlight: { marginBottom: -theme.spacing[12] },
  categories: {
    marginTop: theme.spacing[28],
    marginBottom: theme.spacing[16]
  },
  divider: {
    height: 2,
    width: "100%",
    backgroundColor: theme.colors.background,
    marginTop: theme.spacing[28],
  },
});
