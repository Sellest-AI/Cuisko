import { View, StyleSheet, ViewStyle, Keyboard, Linking, TextInput } from "react-native";
import { colors, theme } from "theme";
import { Text } from "@ui/text";
import { EmptyState } from "@ui/empty-state";
import { ChefHat, ForkKnifeIcon, Search, X } from "@ui/icons";
import { LinearGradient } from "expo-linear-gradient";
import { RadialGradient } from "@ui/radial-gradient";
import { Input } from "@ui/input";
import { useNavigationBarClearance } from "~/modules/navigation/hooks";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "@ui/safe-area-view";
import { CardRecipe } from "@ui/cards/recipe";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { useTranslations } from "translations";

import { useFavoriteRecipes } from "./_hooks/useFavoriteRecipes";
import { type ImportCard, useImportsInFlight } from "./_hooks/useImportsInFlight";
import { useRecipeList } from "./_hooks/useRecipeList";
import { FavoritesShelf } from "./_components/favorites-shelf";
import { COVER_PLACEHOLDER } from "./constants";

type Props = {
  style?: ViewStyle,
  /**
   * The term the box opens on, when the cook arrived here having already typed one.
   *
   * **Seeded once, and deliberately not tracked.** The box is theirs the moment the screen is up:
   * a param that kept being read would overwrite what they typed next, and clearing the box would
   * put the old term straight back.
   */
  initialQuery?: string,
}

type Cell = ReturnType<typeof useRecipeList>["recipes"][number] | (ImportCard & { id?: undefined });

/** The line under an importing card: the time left on its announcement, then that it is due. */
const _countdownKey = ({ countdown }: ImportCard) =>
  countdown.unit === "due" ? "Importing.due" as const : `Importing.${countdown.unit}_left` as const;

export const RecipesScreen = ({ style, initialQuery }: Props) => {
  const t = useTranslations("Recipes");
  /** A cuisine is a shared vocabulary, so its words live with the rest of them. */
  const tVocabulary = useTranslations("Vocabulary");

  const [query, setQuery] = useState(initialQuery ?? "");
  const searchRef = useRef<TextInput>(null);
  const { recipes, isLoading, isStale, isSearching, hasMore, loadMore } = useRecipeList(query);
  const { favorites } = useFavoriteRecipes();
  const imports = useImportsInFlight();

  const clearance = useNavigationBarClearance();

  /**
   * Hidden while a term narrows the grid: the shelf is not a search surface, and a row of
   * favorites that ignores the box would read as matches that are not.
   */
  const showsShelf = !isSearching && favorites.length > 0;

  /** Imports lead the cook's own grid, where their recipe will land; a search result is not theirs. */
  const cells: Cell[] = isSearching ? recipes : [...imports, ...recipes];

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
        data={cells}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        /**
         * Nothing while the first answer is in flight. An empty state shown for the half second
         * before the recipes land tells a cook who has twenty that they have none.
         *
         * Drawn under the shelf too: favorites can all be the catalog's, so a cook with a shelf full
         * of them and none of their own still has an empty section here, and the two ways to fill it
         * — bring one in, or find one in the catalog the box already searches — are what it offers.
         */
        ListEmptyComponent={
          isLoading ? null : isSearching ? (
            <EmptyState
              icon={Search}
              title={t("no_matches_title")}
              body={t("no_matches_body", { query })}
            />
          ) : (
            <EmptyState
              icon={ChefHat}
              title={t("empty_title")}
              body={t("empty_body")}
              actions={[
                { label: t("empty_search"), icon: Search, onPress: () => searchRef.current?.focus(), variant: "neutral" },
              ]}
            />
          )
        }
        contentContainerStyle={[styles.container, style, { paddingBottom: clearance + theme.spacing[24] }]}
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
                strokeWidth={theme.icon.titleStrokeWidth}
              />
              <Text.H4>{t("title")}</Text.H4>
            </View>
            <Input
              ref={searchRef}
              value={query}
              onChangeText={setQuery}
              placeholder={t("search_placeholder")}
              rightIcon={query.length > 0 ? X : Search}
              onRightPress={() => { Keyboard.dismiss(); setQuery(""); }}
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
            {/* A mixed result set is not "your recipes": the heading says which of the two the grid is. */}
            {cells.length !== 0 && <Text.Lg>{t(isSearching ? "matches" : "yours")}</Text.Lg>}
          </SafeAreaView>
        }
        keyExtractor={(cell) => cell.id ?? cell.key}
        getItemType={(cell) => (cell.id ? "recipe" : "import")}
        numColumns={2}
        renderItem={({ item, index }) => {
          const COLUMN_GAP = 12;

          return (
            <View style={{
              marginLeft: index % 2 === 0 ? 0 : COLUMN_GAP / 2,
              marginRight: index % 2 === 0 ? COLUMN_GAP / 2 : 0
            }}>
              {item.id === undefined ? (
                // Back to the reel it is being read from: there is no recipe to open yet.
                <CardRecipe
                  pending
                  title={t("Importing.title")}
                  subtitle={t(_countdownKey(item), item.countdown.unit === "due" ? undefined : { count: item.countdown.count })}
                  style={{ width: "100%", marginBottom: COLUMN_GAP }}
                  onPress={() => void Linking.openURL(item.url)}
                />
              ) : (
                <CardRecipe
                  title={item.title}
                  subtitle={tVocabulary(`Cuisines.${item.cuisine}`)}
                  imageSrc={item.coverImageUrl ? { uri: item.coverImageUrl } : COVER_PLACEHOLDER}
                  style={{ width: "100%", marginBottom: COLUMN_GAP }}
                  onPress={() => router.push(`/recipe/${item.id}`)}
                />
              )}
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
  shelf: { marginBottom: theme.spacing[4] },
  /** Enough to read as "settling", not enough to make the cook wait to read what is there. */
  stale: { opacity: 0.5 },
})
