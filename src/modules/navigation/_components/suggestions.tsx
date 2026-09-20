import { View, StyleSheet, ViewStyle, ScrollView } from "react-native";
import { SparklesIcon } from "@ui/icons";
import { theme } from "theme";
import { Text } from "@ui/text";
import { GroceryItem } from "@ui/cards/grocery-item";
import { CardRecipe } from "@ui/cards/recipe";
import { useTranslations } from "translations";
import { formatQuantity, pickQuantity, roundQuantity, type Unit } from "@shared/ingredients";

import { useUnitLabel } from "~/hooks/useUnitLabel";
import { COVER_PLACEHOLDER } from "~/modules/recipes/constants";
import { useBarSuggestions } from "../_hooks/useBarSuggestions";

const SHARED_PADDING = theme.spacing[16];

/** Narrower than the grid's card: this is a strip under a keyboard, and two should be readable. */
const RECIPE_CARD_WIDTH = 160;

type Props = {
  style?: ViewStyle,
  /**
   * The ruling, passed in rather than asked for here. The row above owns it: Enter reads the same
   * `kind` this panel draws, and a second call to the hook would be a second debounce and a second
   * held answer, free to disagree with it for a keystroke at a time.
   */
  bar: ReturnType<typeof useBarSuggestions>,
  onSelect?: (suggestion: { id: string, amount: number, unit: Unit }) => void,
  /** A dish, not a food. The parent navigates and closes the bar, the way `onSelect` does. */
  onSelectRecipe?: (recipeId: string) => void,
}

export const Suggestions = ({ bar, style, onSelect, onSelectRecipe }: Props) => {
  const t = useTranslations("Navigation");
  /** A cuisine is a shared vocabulary, so its words live with the rest of them. */
  const tVocabulary = useTranslations("Vocabulary");
  const unitWord = useUnitLabel();

  const { kind, ingredient, recipes } = bar;
  const { suggestions, amount, unit } = ingredient;

  return (
    <View style={[style, { paddingBottom: 0 }]}>
      <View style={[styles.suggestionsHeader, { paddingHorizontal: SHARED_PADDING }]}>
        <SparklesIcon size={20} color={theme.colors.primary.base} />
        <View style={{ gap: theme.spacing[2] }}>
          <Text.Lg>{t("Suggestions.title")}</Text.Lg>
          {/* The subtitle is the only thing telling the cook what a tap is about to do, and the
              two lists do opposite things: one writes to the grocery list, the other navigates. */}
          <Text.Sm color={theme.colors.muted}>
            {t(kind === "recipe" ? "Suggestions.recipes_subtitle" : "Suggestions.subtitle")}
          </Text.Sm>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // The suggestions only ever appear while the keyboard is up. Under the default "never",
        // the first tap in here is spent dismissing the keyboard and never reaches a card, so
        // picking a suggestion took two taps. "handled" lets the card's onPress claim the tap.
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing[8],
          paddingHorizontal: SHARED_PADDING,
          paddingBottom: style?.paddingBottom,
          paddingTop: theme.spacing[16]
        }}
      >
        {kind === "recipe" ? recipes.map((recipe) => (
          <CardRecipe
            key={recipe.id}
            title={recipe.title}
            subtitle={tVocabulary(`Cuisines.${recipe.cuisine}`)}
            imageSrc={recipe.coverImageUrl ? { uri: recipe.coverImageUrl } : COVER_PLACEHOLDER}
            style={{ width: RECIPE_CARD_WIDTH }}
            onPress={() => onSelectRecipe?.(recipe.id)}
          />
        )) : suggestions.map((suggestion) => {
          // What the shopper typed wins, both halves at once; the row answers when they gave
          // neither. Read per card rather than once for the list: "2" against gnocchi and against a
          // lemon is two packets and two lemons, and one shared unit for every row could only be
          // right for one.
          // Rounded once, then both shown and written: a card reading "0.1 kg" that puts 0.03 kg
          // on the shelf is the shopper being answered with a number they never chose.
          const { amount: typed, unit: measure } = pickQuantity({ amount, unit }, suggestion);
          const quantity = roundQuantity(typed, measure);

          return (
            <GroceryItem
              key={suggestion.id}
              name={suggestion.name}
              emoji={suggestion.emoji}
              imageUrl={suggestion.imageUrl}
              style={{ backgroundColor: theme.colors.surface.elevated }}
              quantity={formatQuantity(quantity, measure, unitWord)}
              onPress={() => onSelect?.({
                id: suggestion.id,
                amount: quantity,
                unit: measure
              })}
            />
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  suggestionsHeader: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: theme.spacing[12],
    marginLeft: theme.spacing[2],
  },
})
