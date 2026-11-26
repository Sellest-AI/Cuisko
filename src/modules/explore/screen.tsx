import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StyleSheet, View, type ViewStyle } from "react-native";

import type { Cuisine } from "@shared/cuisines";
import { durationTextOf } from "@shared/recipes";
import { CardRecipe } from "@ui/cards/recipe";
import { EmptyState } from "@ui/empty-state";
import { Globe, GlobeIcon, Search } from "@ui/icons";
import { Input } from "@ui/input";
import { Pressable } from "@ui/pressable";
import { RadialGradient } from "@ui/radial-gradient";
import { SafeAreaView } from "@ui/safe-area-view";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { useRequireSignIn } from "~/modules/auth/hooks";
import { useNavigationBarClearance } from "~/modules/navigation/hooks";
import { COVER_PLACEHOLDER } from "~/modules/recipes/constants";
import { useExploreRecipes } from "~/modules/recipes/hooks";
import { recipesRoute } from "~/modules/recipes/routes";

import { ExploreCategories } from "./screen.categories";

type Props = {
  /** The tile picked, read from `?category=` by the route: the URL is the only state. */
  cuisine: Cuisine | undefined;
  style?: ViewStyle;
};

const COLUMN_GAP = 12;

/**
 * The catalog to browse: the day's featured recipes, or one cuisine's, under the twelve tiles.
 *
 * Open without an account. The search box is drawn but not typed in: search lives on the recipes
 * page, so a tap takes a cook there with the box focused, and asks a guest to sign in first.
 */
export const ExploreScreen = ({ cuisine, style }: Props) => {
  const t = useTranslations("Recipes");
  /** A cuisine is a shared vocabulary, so its words live with the rest of them. */
  const tVocabulary = useTranslations("Vocabulary");
  const tCommon = useTranslations("Common");

  const { recipes, isLoading, isStale } = useExploreRecipes(cuisine);
  const { requireSignIn } = useRequireSignIn();
  const clearance = useNavigationBarClearance();

  const openSearch = requireSignIn(() => router.push(recipesRoute({ focusSearch: true })));
  /** `setParams` rather than a push: picking a tile changes what this page shows, not where the cook is. */
  const select = (next: Cuisine | undefined) => router.setParams({ category: next });

  return (
    <>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={[theme.colors.background, theme.colors.neutral.subtle]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <RadialGradient
        size={400}
        colors={[theme.colors.primary.base, theme.colors.background]}
        style={{ position: "absolute", top: 200, left: -100, opacity: 0.1 }}
      />
      <FlashList
        data={recipes}
        /** Nothing while the first answer is in flight: an empty state shown for half a second says the catalog is empty. */
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState icon={Globe} title={t("Explore.empty_title")} body={t("Explore.empty_body")} />
          )
        }
        contentContainerStyle={{
          ...styles.container,
          ...style,
          paddingBottom: clearance + theme.spacing[24]
        }}
        /** Dimmed while the grid on screen is the previous cuisine's, as the recipes list does. */
        style={isStale ? styles.stale : undefined}
        ListHeaderComponent={
          <SafeAreaView style={styles.header} edges={{ top: "additive", bottom: "off" }}>
            <View style={styles.titleRow}>
              <GlobeIcon size={24} color={colors.foreground} strokeWidth={theme.icon.titleStrokeWidth} />
              <Text.H4>{t("Explore.title")}</Text.H4>
            </View>
            <Pressable
              animated={false}
              onPress={openSearch}
              accessibilityRole="search"
              accessibilityLabel={t("Explore.search_placeholder")}
              style={styles.search}
            >
              {/* Drawn, never typed in: the tap goes to the recipes page, where the box is real. */}
              <View pointerEvents="none">
                <Input placeholder={t("Explore.search_placeholder")} rightIcon={Search} />
              </View>
            </Pressable>
            <Text.Lg style={styles.sectionTitle}>{t("Explore.categories")}</Text.Lg>
            <ExploreCategories selected={cuisine} onSelect={select} />
            {recipes.length !== 0 && (
              <Text.Lg style={styles.gridTitle}>
                {cuisine ? tVocabulary(`Cuisines.${cuisine}`) : t("Explore.featured")}
              </Text.Lg>
            )}
          </SafeAreaView>
        }
        keyExtractor={(recipe) => recipe.id}
        numColumns={2}
        renderItem={({ item, index }) => (
          <View
            style={{
              marginLeft: index % 2 === 0 ? 0 : COLUMN_GAP / 2,
              marginRight: index % 2 === 0 ? COLUMN_GAP / 2 : 0,
            }}
          >
            <CardRecipe
              title={item.title}
              subtitle={durationTextOf(item.minutes, tCommon("minute_unit")) || undefined}
              imageSrc={item.coverImageUrl ? { uri: item.coverImageUrl } : COVER_PLACEHOLDER}
              style={{ width: "100%", marginBottom: COLUMN_GAP }}
              onPress={() => router.push(`/recipe/${item.id}`)}
            />
          </View>
        )}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: theme.spacing[24],
    paddingHorizontal: theme.spacing[16],
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    alignSelf: "center",
  },
  header: { marginBottom: theme.spacing[16] },
  search: {
    marginTop: theme.spacing[28],
    marginBottom: theme.spacing[24],
    width: "100%",
  },
  sectionTitle: { marginBottom: theme.spacing[12] },
  gridTitle: { marginTop: theme.spacing[24] },
  /** Enough to read as "settling", not enough to make the cook wait to read what is there. */
  stale: { opacity: 0.5 },
});
