import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { MessageCircleWarning, ReceiptTextIcon } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { type CategoryId } from "../_model/model";
import { useTunnelGroceries } from "./_hooks/useTunnelGroceries";
import { useTunnelScrollHandler } from "./_hooks/useTunnelScrollHandler";
import { TunnelHeader } from "./_components/tunnel-header";
import { TunnelGroceryRow } from "./groceries.row";
import { InfoBanner } from "@ui/info-banner";

/**
 * The categories the model can emit, as keys this file may name — `t()` takes no dynamic key.
 *
 * Typed as a total `Record<CategoryId, …>` rather than an open object: the model owns the list, so
 * adding a category there now fails to compile here until it is named, instead of falling through
 * to "Odds and ends" in a language nobody chose.
 */
const CATEGORY_KEYS = {
  vegetables: "Categories.vegetables",
  meats: "Categories.meats",
  fish: "Categories.fish",
  dairy: "Categories.dairy",
  grains: "Categories.grains",
  other: "Categories.other",
} as const satisfies Record<CategoryId, string>;

/**
 * A real check rather than a cast: `GroceryCategory.id` is a plain string, and asserting it into
 * the union only to guard the assertion with `??` hid the one case that matters.
 */
const _isCategoryId = (id: string): id is CategoryId => id in CATEGORY_KEYS;

/** What the week needs that the kitchen has not got. */
export const TunnelGroceries = () => {
  const t = useTranslations("Planning");
  const { categories, meals, owned, toggleHave } = useTunnelGroceries();
  const onScroll = useTunnelScrollHandler();

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <TunnelHeader
        title={t("Tunnel.Groceries.title")}
        subtitle={t("Tunnel.Groceries.subtitle")}
        icon={ReceiptTextIcon}
      />
      <InfoBanner
        title={t("Tunnel.Groceries.info_title")}
        variant="warning"
        icon={MessageCircleWarning}
        style={{
          marginHorizontal: theme.spacing[16],
          marginBottom: theme.spacing[28],
        }}
      >
        {t("Tunnel.Groceries.info_body")}
      </InfoBanner>
      {categories.map((category, i) => (
        <View key={category.id}>
          <Text.Lg style={{ ...styles.heading, ...(i === 0 ? { marginTop: 0 } : {}) }}>
            {t(_isCategoryId(category.id) ? CATEGORY_KEYS[category.id] : CATEGORY_KEYS.other)}
          </Text.Lg>
          {category.rows.map((row) => (
            <TunnelGroceryRow
              key={row.id}
              row={row}
              meals={meals.filter((meal) => row.mealIds.includes(meal.id))}
              owned={owned.includes(row.id)}
              haveLabel={t("Tunnel.Groceries.have")}
              needLabel={t("Tunnel.Groceries.need")}
              onToggle={() => toggleHave(row.id)}
            />
          ))}
        </View>
      ))}
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET },
  heading: {
    paddingHorizontal: theme.spacing[16],
    marginTop: theme.spacing[16],
    marginBottom: theme.spacing[4],
  },
});
