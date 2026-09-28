import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

import { CardRecipe } from "@ui/cards/recipe";
import { CircleCheck, ForkKnifeIcon, Lightbulb } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { m } from "@ui/motion";
import { StepHeader } from "@ui/step-header";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";


import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { FakeNavigationBar } from "./_components/fake-navigation-bar";
import { RECIPE_SEARCHES, RECIPES, SUGGESTED } from "./_model/fixtures";
import { useOnboarding } from "./_hooks/useOnboarding";
import { useProgressClearance } from "./_hooks/useProgressClearance";
import { COVERS } from "./photos";

/** The real recipes grid's gap, so the cards come out the size they will be in the app. */
const COLUMN_GAP = 12;
const GUTTER = theme.spacing[16];

/** The fake bar's hint rail and input: what the page scrolls clear of. */
const FAKE_BAR_HEIGHT = 128;


const CARD_ENTERING = FadeIn.duration(220);
const CARD_EXITING = FadeOut.duration(120);
const CARD_LAYOUT = LinearTransition.duration(220);

/**
 * Screen 3: searching recipes from the navigation bar, two ways.
 *
 * An ingredient and a mood, one hint each, because the point is that the bar takes both in plain
 * words; two rather than more, so the screen goes quickly. Each search refills the grid from the
 * top, as the recipes page does. Continue opens once both have been tried.
 */
export const OnboardingRecipes = () => {
  const t = useTranslations("Onboarding");
  const { complete } = useOnboarding();
  const clearance = useProgressClearance();
  const [searched, setSearched] = useState<number[]>([]);

  const hints = RECIPE_SEARCHES.map(({ id }) => t(`Recipes.Hints.${id}`));
  const last = searched.at(-1);
  const isDone = searched.length === RECIPE_SEARCHES.length;
  const shown = last === undefined ? SUGGESTED : RECIPE_SEARCHES[last]!.results;

  useEffect(() => {
    if (isDone) complete();
  }, [isDone, complete]);

  const onSend = useCallback(
    (index: number) => setSearched((current) => (current.includes(index) ? current : [...current, index])),
    [],
  );

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: clearance }]} showsVerticalScrollIndicator={false}>
        <StepHeader title={t("Recipes.title")} icon={ForkKnifeIcon} />
        <View style={styles.body}>
          {/* Keyed, so the tip is replaced by its answer rather than rewritten in place. */}
          <m.View key={isDone ? "done" : "search"} from={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.banner}>
            {isDone ? (
              <InfoBanner variant="secondary" title={t("Recipes.done_title")} icon={CircleCheck}>
                {t("Recipes.tip_done")}
              </InfoBanner>
            ) : (
              <InfoBanner variant="tip" title={t("Recipes.search_title")} icon={Lightbulb}>
                {t("Recipes.tip_send")}
              </InfoBanner>
            )}
          </m.View>
          <Text.Lg style={styles.label}>
            {last === undefined ? t("Recipes.suggested") : t("Recipes.results", { query: hints[last]! })}
          </Text.Lg>
          {/* Keyed by the search too, so a card two searches share still leaves and lands again from the top. */}
          <View style={styles.grid}>
            {shown.map((id) => (
              <Animated.View
                key={`${last ?? "suggested"}:${id}`}
                entering={CARD_ENTERING}
                exiting={CARD_EXITING}
                layout={CARD_LAYOUT}
                style={styles.cell}
              >
                <CardRecipe
                  title={t(`RecipeNames.${id}`)}
                  subtitle={t("minutes", { minutes: RECIPES[id].minutes })}
                  imageSrc={COVERS[id]}
                  style={styles.card}
                />
              </Animated.View>
            ))}
          </View>
        </View>
      </ScrollView>
      <FakeNavigationBar hints={hints} used={searched} onSend={onSend} style={styles.bar} />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingBottom: NAVIGATION_BAR_OFFSET + FAKE_BAR_HEIGHT },
  body: { paddingHorizontal: GUTTER },
  label: { marginBottom: theme.spacing[20] },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -COLUMN_GAP / 2 },
  /** Half the width each, padded rather than gapped, so two columns always fit the row. */
  cell: { width: "50%", paddingHorizontal: COLUMN_GAP / 2, marginBottom: COLUMN_GAP },
  card: { width: "100%" },
  banner: { marginBottom: theme.spacing[32] },
  bar: { position: "absolute", left: GUTTER, right: GUTTER, bottom: NAVIGATION_BAR_OFFSET },
});
