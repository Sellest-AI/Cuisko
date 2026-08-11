import { View, StyleSheet, ViewStyle, ScrollView } from "react-native";
import { SparklesIcon } from "@ui/icons";
import { theme } from "theme";
import { Text } from "@ui/text";
import { GroceryItem } from "@ui/cards/grocery-item";
import { useTranslations } from "translations";
import { Unit, useSuggestions } from "../_hooks/useSuggestions";

const SHARED_PADDING = theme.spacing[16];

type Props = {
  style?: ViewStyle,
  value: string,
  onSelect?: (suggestion: { id: string, amount: number, unit: Unit }) => void,
}

export const Suggestions = ({ value, style, onSelect }: Props) => {
  const t = useTranslations("Navigation");
  const { suggestions, amount, unit } = useSuggestions(value);

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.suggestionsHeader, { paddingHorizontal: SHARED_PADDING }]}>
        <SparklesIcon size={20} color={theme.colors.primary.base} />
        <View style={{ gap: theme.spacing[2] }}>
          <Text.Lg>{t("Suggestions.title")}</Text.Lg>
          <Text.Sm color={theme.colors.muted}>{t("Suggestions.subtitle")}</Text.Sm>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: theme.spacing[8],
          paddingHorizontal: SHARED_PADDING
        }}
      >
        {suggestions.map((suggestion) => {
          return (
            <GroceryItem
              key={suggestion.id}
              name={suggestion.name}
              emoji={suggestion.emoji}
              style={{ backgroundColor: theme.colors.surface.elevated }}
              quantity={amount ? `${amount} ${unit}` : undefined}
              onPress={() => onSelect?.({
                id: suggestion.id,
                amount: amount,
                unit: unit
              })}
            />
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {

  },
  suggestionsHeader: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: theme.spacing[12],
    marginBottom: theme.spacing[16],
    marginLeft: theme.spacing[2],
  },
})
