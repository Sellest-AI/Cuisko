import { useLocalSearchParams, usePathname, router } from "expo-router";
import { ReactNode, useMemo } from "react";
import { View, StyleSheet } from "react-native";

import { ArrowLeft, FileText, ForkKnife, ListOrdered } from "@ui/icons";
import { m } from "@ui/motion";
import { ParallaxScrollView } from "@ui/parallax-scroll-view";
import { SafeAreaView } from "@ui/safe-area-view";
import { theme } from "theme";
import { useTranslations } from "translations";

import { CONTENT_NEGATIVE_SPACE } from "../../constants";
import { RecipeHeader } from "./header";
import { RecipeIntro } from "./intro";
import { RecipeTabs, RecipeTab } from "./tabs";
import { ChromeNavigationBar } from "./navigation-bar";
import { useRecipe } from "../../_hooks/useRecipe";
import { EmptyState } from "../../_components/empty-state";

/**
 * The photo every recipe is drawn under, until a recipe can carry its own.
 *
 * `recipes` has no image field, so this is not waiting on the fetch — it is waiting on the column.
 * The grid stands the same fixture in for the same reason; when one lands, both read it and
 * nothing else on either screen moves.
 */
const PLACEHOLDER_PHOTO =
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1170&q=80";

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

  const { recipe, isMissing } = useRecipe(id);

  const active = path.startsWith(`/recipe/${id}/ingredients`) ? "ingredients"
    : path.startsWith(`/recipe/${id}/instructions`) ? "instructions"
      : "overview";

  const tabs = useMemo<RecipeTab[]>(() => [
    { key: "overview", label: t("Tabs.overview"), icon: FileText, onPress: () => router.replace(`/recipe/${id}`) },
    { key: "ingredients", label: t("Tabs.ingredients"), icon: ForkKnife, onPress: () => router.replace(`/recipe/${id}/ingredients`) },
    { key: "instructions", label: t("Tabs.instructions"), icon: ListOrdered, onPress: () => router.replace(`/recipe/${id}/instructions`) },
  ], [id, t]);

  /**
   * Only a refusal gets the empty state. A recipe still in flight is NOT missing, and saying so
   * would flash "this recipe is not here" over every recipe the cook opens on the way to seeing it.
   */
  if (isMissing) {
    /**
     * Inside a SafeAreaView, and carrying its own way out: this branch draws no chrome, and the
     * root Stack hides its header, so without a button here the cook is on a page with nothing to
     * tap and no back gesture on Android.
     */
    return (
      <SafeAreaView style={styles.missing}>
        <EmptyState
          icon={ForkKnife}
          title={t("Chrome.not_found_title")}
          body={t("Chrome.not_found_body")}
          action={{
            label: t("Chrome.not_found_action"),
            icon: ArrowLeft,
            /**
             * `back()` only where there is something behind: a recipe opened from a notification or
             * a shared link starts its own stack, and `back()` on an empty one is a no-op — which is
             * the dead end this button exists to remove.
             */
            onPress: () => (router.canGoBack() ? router.back() : router.replace("/")),
          }}
        />
      </SafeAreaView>
    );
  }

  /**
   * Loading draws the frame with nothing in it rather than a spinner: the photo, the lip and the
   * tab row are the same whatever the recipe turns out to be, so building them now means the text
   * arrives into a page that is already there instead of replacing one.
   */
  return (
    <>
      <ParallaxScrollView
        /**
         * Each tab opens at its own top. The scroll container outlives all three, so without this a
         * switch made halfway down the ingredients would drop you into the middle of the method.
         */
        scrollKey={active}
        headerBackgroundImage={PLACEHOLDER_PHOTO}
        contentNegativeSpace={CONTENT_NEGATIVE_SPACE}
        headerContent={<RecipeHeader recipeId={id} tags={recipe?.tags ?? []} />}
        contentHeader={
          <>
            <View style={styles.lip} />
            <View style={styles.ground}>
              <RecipeIntro
                title={recipe?.title ?? ""}
                description={recipe?.description ?? ""}
                expanded={active === "overview"}
              />
            </View>
          </>
        }
        /**
         * Pinned, because it is the only way between the three tabs: scrolled halfway down the
         * ingredients, a bar sitting at the top of the page is a scroll back up before it is a tap.
         */
        stickyHeaderStyle={styles.ground}
        stickyHeader={
          <View>
            <RecipeTabs tabs={tabs} activeKey={active} />
            <View style={styles.border} />
          </View>}
      >
        {/*
          * The switch between tabs, which used to be the route navigator's to play. It lives here
          * now that the layout hands over a plain `Slot` — keyed on the active tab, so arriving
          * remounts rather than crossfading one tab's content into another's.
          */}
        <m.View key={active}>
          {children}
        </m.View>
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
  ground: {
    backgroundColor: theme.colors.neutral.subtle,
  },
  border: {
    height: 2,
    width: "100%",
    backgroundColor: theme.colors.background,
    marginTop: theme.spacing[12],
  },
  missing: { flex: 1, justifyContent: "center" },
});
