import { View, StyleSheet, ViewStyle } from "react-native";
import { colors, theme } from "theme";
import { Text } from "@ui/text";
import { ForkKnife, ForkKnifeIcon, Search, X } from "@ui/icons";
import { LinearGradient } from "expo-linear-gradient";
import { RadialGradient } from "@ui/radial-gradient";
import { Input } from "@ui/input";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "@ui/safe-area-view";
import { CardRecipe } from "@ui/cards/recipe";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslations } from "translations";

import { useFavoriteRecipes } from "./_hooks/useFavoriteRecipes";
import { useRecipeList } from "./_hooks/useRecipeList";
import { EmptyState } from "./_components/empty-state";
import { FavoritesShelf } from "./_components/favorites-shelf";
import { COVER_PLACEHOLDER } from "./constants";

type Props = {
  style?: ViewStyle
}

export const RecipesScreen = ({ style }: Props) => {
  const t = useTranslations("Recipes");
  /** A cuisine is a shared vocabulary, so its words live with the rest of them. */
  const tVocabulary = useTranslations("Vocabulary");

  const [query, setQuery] = useState("");
  const { recipes, isLoading, isStale, isSearching, hasMore, loadMore } = useRecipeList(query);
  const { favorites } = useFavoriteRecipes();

  /**
   * Hidden while a term narrows the grid: the shelf is not a search surface, and a row of
   * favorites that ignores the box would read as matches that are not.
   */
  const showsShelf = !isSearching && favorites.length > 0;

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
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        /**
         * Nothing while the first answer is in flight. An empty state shown for the half second
         * before the recipes land tells a cook who has twenty that they have none. Nothing either
         * when the shelf is up: a cook with favorites and no recipes of their own is not looking
         * at an empty page.
         */
        ListEmptyComponent={
          isLoading || showsShelf ? null : isSearching ? (
            <EmptyState
              icon={Search}
              title={t("no_matches_title")}
              body={t("no_matches_body", { query })}
            />
          ) : (
            <EmptyState
              icon={ForkKnife}
              title={t("empty_title")}
              body={t("empty_body")}
            />
          )
        }
        contentContainerStyle={[styles.container, style]}
        /** Dimmed while the matches on screen are the previous term's — see `isStale`. */
        style={isStale ? styles.stale : undefined}
        ListHeaderComponent={
          <SafeAreaView
            style={styles.header}
            edges={{ top: "additive", bottom: "off" }}
          >
            <View style={styles.titleRow}>
              <ForkKnifeIcon
                size={24}
                color={colors.foreground}
              />
              <Text.H4>{t("title")}</Text.H4>
            </View>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={t("search_placeholder")}
              rightIcon={query.length > 0 ? X : Search}
              onRightPress={() => setQuery("")}
              style={styles.search}
            />
            {showsShelf && (
              <FavoritesShelf
                title={t("favorites")}
                recipes={favorites.map((recipe) => ({
                  id: recipe.id,
                  title: recipe.title,
                  subtitle: tVocabulary(`Cuisines.${recipe.cuisine}`),
                  coverImageUrl: recipe.coverImageUrl,
                }))}
                style={styles.shelf}
              />
            )}
            {recipes.length !== 0 && <Text.Lg>{t("yours")}</Text.Lg>}
          </SafeAreaView>
        }
        keyExtractor={({ id }) => id}
        numColumns={2}
        renderItem={({ item, index }) => {
          const COLUMN_GAP = 12;

          return (
            <View style={{
              marginLeft: index % 2 === 0 ? 0 : COLUMN_GAP / 2,
              marginRight: index % 2 === 0 ? COLUMN_GAP / 2 : 0
            }}>
              <CardRecipe
                title={item.title}
                subtitle={tVocabulary(`Cuisines.${item.cuisine}`)}
                imageSrc={item.coverImageUrl ? { uri: item.coverImageUrl } : COVER_PLACEHOLDER}
                style={{ width: "100%", marginBottom: COLUMN_GAP }}
                onPress={() => router.push(`/recipe/${item.id}`)}
              />
            </View>
          )
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: theme.spacing[24],
    paddingHorizontal: theme.spacing[16],
    paddingBottom: NAVIGATION_BAR_OFFSET + theme.spacing[24]
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    alignSelf: "center"
  },
  header: {
    marginBottom: theme.spacing[16],
  },
  search: {
    marginTop: theme.spacing[28],
    marginBottom: theme.spacing[24],
    width: "100%"
  },
  shelf: { marginBottom: theme.spacing[24] },
  /** Enough to read as "settling", not enough to make the cook wait to read what is there. */
  stale: { opacity: 0.5 },
})
