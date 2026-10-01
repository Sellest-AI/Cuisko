import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { ActionCard } from "@ui/cards/action-card";
import { ButtonPill } from "@ui/button-pill";
import { Book, CalendarPlus, ForkKnife, type Icon, ShoppingCart, Sparkles, Store } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";
import { type Href, router } from "expo-router";
import { useStockCounts } from "~/modules/groceries/hooks";
import { useNavigationBar } from "~/modules/navigation/hooks";
import { AskCuiskoPill } from "~/modules/assistant/ask-cuisko-pill";

/**
 * The four starts, as a shelf of pills above the rows.
 *
 * Data rather than a branch per pill, because a fifth start is then a line here rather than
 * another copy of the same markup drifting out of step with its neighbours.
 *
 * `renderItem` keeps exactly one branch, and it earns it: `ask_cuisko` leads with Cuisko's head
 * instead of an icon disc, which is a different prop and not a different value. The `icon` below
 * is what the other three lead with, so it goes unread on that one row.
 *
 * The label is a key and not a string: the shelf is ordered here, but worded in `translations/`.
 */
const STARTS: { key: "ask_cuisko" | "import_recipe" | "plan_week" | "my_recipes"; icon: Icon; href: Href }[] = [
  { key: "ask_cuisko", icon: Sparkles, href: "/assistant" },
  { key: "import_recipe", icon: Book, href: "/import-recipe" },
  { key: "plan_week", icon: CalendarPlus, href: "/planning/new" },
  { key: "my_recipes", icon: ForkKnife, href: "/recipes" },
];

/** The things you reach for without going looking: what to add, and where things are kept. */
export const QuickAccess = () => {
  const t = useTranslations("Home");

  const { focus } = useNavigationBar();
  const { toBuy, inStock, isLoading } = useStockCounts();

  return (
    <View style={styles.container}>
      <View style={[styles.gutter, styles.title]}>
        <Text.Lg>{t("QuickAccess.title")}</Text.Lg>
      </View>
      <FlashList
        data={STARTS}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.starts}
        renderItem={({ item }) => {
          if (item.key === "ask_cuisko")
            return (
              <AskCuiskoPill size="sm" onPress={() => router.push(item.href)} style={styles.start}>
                {t(`QuickAccess.${item.key}`)}
              </AskCuiskoPill>
            )

          return (
            <ButtonPill
              size="sm"
              variant="neutral"
              onPress={() => router.push(item.href)}
              style={styles.start}
              leftIcon={item.icon}
            >
              {t(`QuickAccess.${item.key}`)}
            </ButtonPill>
          )
        }}
      />
      <View style={[styles.gutter, styles.rows]}>
        <View style={styles.tiles}>
          <ActionCard
            variant="secondary"
            onPress={() => router.push("/groceries")}
            onIconPress={() => { focus("shopping-list") }}
            content={t("QuickAccess.grocery_list")}
            subtitle={isLoading ? undefined : t("QuickAccess.to_buy_x_items", { count: toBuy })}
            icon={ShoppingCart}
            style={{ alignSelf: "stretch", flex: 1 }}
          />
          <ActionCard
            variant="neutral"
            onPress={() => router.push({ pathname: "/groceries", params: { section: "cellar" } })}
            onIconPress={() => { focus("cellar") }}
            content={t("QuickAccess.cellar")}
            icon={Store}
            subtitle={isLoading ? undefined : t("QuickAccess.in_stock_x_items", { count: inStock })}
            style={{ alignSelf: "stretch", flex: 1 }}
          />
        </View>
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
  rows: { gap: theme.spacing[12] },
  starts: {
    paddingLeft: theme.spacing[16],
    paddingRight: theme.spacing[12],
    paddingBottom: theme.spacing[12],
    paddingTop: theme.spacing[12],
  },
  /** A margin rather than the container's `gap`, which a horizontal FlashList does not apply. */
  start: { marginRight: theme.spacing[6] },
  tiles: {
    gap: theme.spacing[12],
    flexDirection: "row",
  },
});
