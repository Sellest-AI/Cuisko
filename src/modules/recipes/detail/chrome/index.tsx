import { useLocalSearchParams, usePathname, router } from "expo-router";
import { ReactNode, useMemo } from "react";
import { View, StyleSheet } from "react-native";

import { EmptyState } from "@ui/empty-state";
import { ArrowLeft, FileText, ForkKnife, ListOrdered } from "@ui/icons";
import { m } from "@ui/motion";
import { ParallaxScrollView } from "@ui/parallax-scroll-view";
import { SafeAreaView } from "@ui/safe-area-view";
import { theme } from "theme";
import { useTranslations } from "translations";

import { CONTENT_NEGATIVE_SPACE, COVER_PLACEHOLDER } from "../../constants";
import { RecipeHeader } from "./header";
import { RecipeIntro } from "./intro";
import { RecipeTabs, RecipeTab } from "./tabs";
import { TabSwipe } from "./swipe";
import { ChromeNavigationBar } from "./navigation-bar";
import { useRecipe } from "../../_hooks/useRecipe";
import { servingsParamOf } from "../../routes";

type Props = {
  children: ReactNode;
  /**
   * The servings the route arrived with, straight off the URL — validated here, not by the route.
   * A plate on the plan opens its recipe for the number it was planned for; see `recipeRoute`.
   */
  servings?: string;
};

/**
 * The frame the three recipe tabs mount into: the photo, the title, and the row that switches them.
 *
 * All three tabs share this one scroll container, which is what lets the title collapse and the
 * header stay put while the tab underneath slides — a per-route header would rebuild both on every
 * switch. It lives here rather than in the route file so `app/` stays routing-only (ADR 0006).
 */
export const RecipeChrome = ({ children, servings }: Props) => {
  const t = useTranslations("Recipe");
  const path = usePathname();
  const { id } = useLocalSearchParams<{ id?: string }>();

  /**
   * The chrome is the one caller that seeds the count: it mounts once for all three tabs, before
   * any of them, so the choice is in the atom by the time a tab draws a quantity.
   */
  const { recipe, isLoading, isMissing } = useRecipe(id, servingsParamOf(servings));

  const active = path.startsWith(`/recipe/${id}/ingredients`) ? "ingredients"
    : path.startsWith(`/recipe/${id}/instructions`) ? "instructions"
      : "overview";

  const tabs = useMemo<RecipeTab[]>(() => [
    { key: "overview", label: t("Tabs.overview"), icon: FileText, onPress: () => router.replace(`/recipe/${id}`) },
    { key: "ingredients", label: t("Tabs.ingredients"), icon: ForkKnife, onPress: () => router.replace(`/recipe/${id}/ingredients`) },
    { key: "instructions", label: t("Tabs.instructions"), icon: ListOrdered, onPress: () => router.replace(`/recipe/${id}/instructions`) },
  ], [id, t]);

  /** The tab on either side of the active one, in the row's order. Absent at the row's ends. */
  const activeIndex = tabs.findIndex((tab) => tab.key === active);
  const previous = tabs[activeIndex - 1];
  const next = tabs[activeIndex + 1];

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
          actions={[{
            label: t("Chrome.not_found_action"),
            icon: ArrowLeft,
            /**
             * `back()` only where there is something behind: a recipe opened from a notification or
             * a shared link starts its own stack, and `back()` on an empty one is a no-op — which is
             * the dead end this button exists to remove.
             */
            onPress: () => (router.canGoBack() ? router.back() : router.replace("/")),
          }]}
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
        /**
         * Nothing at all while the recipe loads. The placeholder is what a recipe without a cover
         * settles on, so showing it early states that as fact and then contradicts itself the
         * moment a real cover arrives.
         */
        headerBackgroundImage={isLoading ? undefined : (recipe?.coverImageLargeUrl ?? COVER_PLACEHOLDER)}
        contentNegativeSpace={CONTENT_NEGATIVE_SPACE}
        headerContent={
          <RecipeHeader
            recipeId={id}
            isOwned={recipe?.isOwned}
            isFavorited={recipe?.isFavorited}
          />
        }
        contentHeader={
          /*
           * The tabs carry an 8 pt top padding so they still clear the lip once pinned. Off the
           * overview the intro collapses and that padding alone leaves the tabs too far below the
           * lip, so the gap is pulled in by 4 here. Pinning is unaffected: it reads the tabs' own
           * padding, which stays.
           */
          <View style={activeIndex === 0 ? undefined : styles.tuckedTabs}>
            <View style={styles.lip} />
            <View style={styles.ground}>
              <RecipeIntro
                chef={recipe?.chef ? { avatarSeed: recipe.chef.seed, name: recipe.chef.name } : undefined}
                title={recipe?.title ?? ""}
                description={recipe?.description ?? ""}
                expanded={active === "overview"}
              />
            </View>
          </View>
        }
        /**
         * Pinned, because it is the only way between the three tabs: scrolled halfway down the
         * ingredients, a bar sitting at the top of the page is a scroll back up before it is a tap.
         */
        stickyHeaderStyle={styles.ground}
        stickyHeader={
          <View>
            <RecipeTabs tabs={tabs} activeKey={active} />
          </View>}
      >
        {/*
          * The switch between tabs, which used to be the route navigator's to play. It lives here
          * now that the layout hands over a plain `Slot` — keyed on the active tab, so arriving
          * remounts rather than crossfading one tab's content into another's. Wrapped in the swipe
          * so a drag across the content is the other way between the three, next to the row.
          */}
        <TabSwipe onPrevious={previous?.onPress} onNext={next?.onPress}>
          <m.View key={active}>
            <SafeAreaView edges={{ top: "off", bottom: "android" }}>
              {children}
            </SafeAreaView>
          </m.View>
        </TabSwipe>
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
  tuckedTabs: { marginBottom: -4 },
  missing: { flex: 1, justifyContent: "center" },
});
