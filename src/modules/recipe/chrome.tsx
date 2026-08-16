import { useLocalSearchParams, usePathname, router } from "expo-router";
import { ReactNode, useMemo } from "react";
import { View, StyleSheet } from "react-native";

import { FileText, ForkKnife, ListOrdered } from "@ui/icons";
import { ParallaxScrollView } from "@ui/parallax-scroll-view";
import { theme } from "theme";
import { useTranslations } from "translations";

import { CONTENT_NEGATIVE_SPACE } from "./constants";
import { RecipeHeader } from "./_components/recipe-header";
import { RecipeIntro } from "./_components/recipe-intro";
import { RecipeTabs, RecipeTab } from "./_components/recipe-tabs";
import { ChromeNavigationBar } from "./_components/chrome-navigation-bar";

/** Placeholder recipe, until `_hooks/` exists to fetch a real one. */
const RECIPE = {
  title: "La Vraie Pizza",
  description:
    "La pizza, ce grand classique italien, séduit petits et grands par sa pâte croustillante garnie à l’infini. Rapide à préparer et parfaite pour un repas convivial, elle s’adapte à toutes les envies : margherita, quatre fromages, etc. Impossible de s’en lasser !",
  tags: ["🥬 Vegetarian", "🥗 Salad"],
  photo:
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1170&q=80",
};

/**
 * The frame the three recipe tabs mount into: the photo, the title, and the row that switches them.
 *
 * All three tabs share this one scroll container, which is what lets the title collapse and the
 * header stay put while the tab underneath slides — a per-route header would rebuild both on every
 * switch. It lives here rather than in the route file so `app/` stays routing-only (ADR 0006).
 */
export const RecipeChrome = ({ children }: { children: ReactNode }) => {
  const t = useTranslations("Recipe");
  const path = usePathname();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const active = path.startsWith(`/recipe/${id}/ingredients`) ? "ingredients"
    : path.startsWith(`/recipe/${id}/instructions`) ? "instructions"
      : "overview";

  const tabs = useMemo<RecipeTab[]>(() => [
    { key: "overview", label: t("Tabs.overview"), icon: FileText, onPress: () => router.replace(`/recipe/${id}`) },
    { key: "ingredients", label: t("Tabs.ingredients"), icon: ForkKnife, onPress: () => router.replace(`/recipe/${id}/ingredients`) },
    { key: "instructions", label: t("Tabs.instructions"), icon: ListOrdered, onPress: () => router.replace(`/recipe/${id}/instructions`) },
  ], [id, t]);

  return (
    <>
      <ParallaxScrollView
        /**
         * Each tab opens at its own top. The scroll container outlives all three, so without this a
         * switch made halfway down the ingredients would drop you into the middle of the method.
         */
        scrollKey={active}
        headerBackgroundImage={RECIPE.photo}
        contentNegativeSpace={CONTENT_NEGATIVE_SPACE}
        headerContent={<RecipeHeader tags={RECIPE.tags} />}
        contentHeader={
          <>
            <View style={styles.lip} />
            <View style={styles.ground}>
              <RecipeIntro
                title={RECIPE.title}
                description={RECIPE.description}
                expanded={active === "overview"}
              />
            </View>
          </>
        }
        /**
         * Pinned, because it is the only way between the three tabs: scrolled halfway down the
         * ingredients, a bar sitting at the top of the page is a scroll back up before it is a tap.
         */
        stickyHeader={<View style={styles.ground}><RecipeTabs tabs={tabs} activeKey={active} /></View>}
      >
        {children}
      </ParallaxScrollView>
      <ChromeNavigationBar
        onBack={() => router.back()}
        onStepByStep={() => router.push(`/recipe/step-by-step/${id}`)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  /**
   * The rounded strip of content that overlaps the photo, so the two meet on a curve. It paints
   * itself rather than sitting on `ground`: a square parent behind it would fill the very corners
   * the radius exists to cut out of the photo.
   */
  lip: {
    height: CONTENT_NEGATIVE_SPACE,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    backgroundColor: theme.colors.neutral.subtle,
  },
  /**
   * One ground under the intro and under the bar that pins over it. Opaque and identical on
   * purpose — a translucent bar would show the intro sliding underneath it, and a bar in a
   * different colour would announce itself the moment it stuck.
   */
  ground: { backgroundColor: theme.colors.neutral.subtle },
});
