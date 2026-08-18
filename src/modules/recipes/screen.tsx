import { View, StyleSheet, ViewStyle } from "react-native";
import { colors, theme } from "theme";
import { Text } from "@ui/text";
import { ForkKnifeIcon, Search } from "@ui/icons";
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

const CARD_PLACEHOLDER = require("assets/placeholders/pizza-recipe.jpg");

const RECIPES = [
  { id: "pizza-atomica", title: "Pizza Atomica", subtitle: "Italian" },
  { id: "asparagus-salad", title: "Asparagus Salad", subtitle: "Italian" },
  { id: "pasta-carbonara", title: "Pasta Carbonara", subtitle: "Italian" },
  { id: "lasagna", title: "Lasagna", subtitle: "Italian" },
  { id: "risotto-milanese", title: "Risotto Milanese", subtitle: "Italian" },
  { id: "margherita-pizza", title: "Margherita Pizza", subtitle: "Italian" },
  { id: "pesto-pasta", title: "Pesto Pasta", subtitle: "Italian" },
  { id: "chicken-parmesan", title: "Chicken Parmesan", subtitle: "Italian" },
  { id: "bruschetta", title: "Bruschetta", subtitle: "Italian" },
  { id: "minestrone", title: "Minestrone", subtitle: "Italian" },
  { id: "gnocchi-tomato", title: "Gnocchi al Pomodoro", subtitle: "Italian" },
  { id: "tiramisu", title: "Tiramisu", subtitle: "Italian" },
  { id: "focaccia", title: "Focaccia", subtitle: "Italian" },
  { id: "eggplant-parmigiana", title: "Eggplant Parmigiana", subtitle: "Italian" },
  { id: "cacio-e-pepe", title: "Cacio e Pepe", subtitle: "Italian" },
];

type Props = {
  style?: ViewStyle
}

export const RecipesScreen = ({ style }: Props) => {
  const t = useTranslations("Recipes");

  const [query, setQuery] = useState("");

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
        data={[...RECIPES].sort((a, b) => a.title.localeCompare(b.title))}
        contentContainerStyle={[styles.container, style]}
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
              rightIcon={Search}
              style={styles.search}
            />
            <Text.Lg>{t("yours")}</Text.Lg>
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
                subtitle={item.subtitle}
                imageSrc={CARD_PLACEHOLDER}
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
})
