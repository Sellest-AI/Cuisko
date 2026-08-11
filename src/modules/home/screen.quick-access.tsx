import { StyleSheet, View } from "react-native";

import { ActionRow } from "@ui/action-row";
import { ListPlus, Plus, Store } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";
import { router } from "expo-router";

/** Placeholder counts until the list and the cellar arrive from Convex. */
const PENDING_ITEMS = 56;
const STORED_ITEMS = 37;

/** The things you reach for without going looking: what to add, and where things are kept. */
export const QuickAccess = () => {
  const t = useTranslations("Home");

  return (
    <View style={styles.container}>
      <View style={[styles.gutter, styles.title]}>
        <Text.Lg>{t("QuickAccess.title")}</Text.Lg>
      </View>
      <View style={[styles.gutter, styles.rows]}>
        <ActionRow
          variant="secondary"
          onPress={() => router.push("/groceries")}
          content={t("QuickAccess.grocery_list")}
          contentIcon={ListPlus}
          subtitle={t("QuickAccess.to_buy_x_items", { count: PENDING_ITEMS })}
          leftIcon={Plus}
          onLeftIconPress={() => console.log("add grocery item pressed")}
        />
        <ActionRow
          variant="flat"
          onPress={() => console.log("open cellar pressed")}
          content={t("QuickAccess.cellar")}
          contentIcon={Store}
          subtitle={t("QuickAccess.in_stock_x_items", { count: STORED_ITEMS })}
          leftIcon={Plus}
          onLeftIconPress={() => console.log("add cellar item pressed")}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: theme.spacing[28] },
  /** The page gutter, applied per row rather than to the container, so a row added later can
   *  run edge to edge without unpicking it. */
  gutter: {
    paddingLeft: theme.spacing[16],
    paddingRight: theme.spacing[16],
  },
  title: { paddingBottom: theme.spacing[4] },
  rows: { marginTop: theme.spacing[12], gap: theme.spacing[12] },
});
