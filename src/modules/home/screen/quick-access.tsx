import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { Image } from "@ui/image";
import { ButtonPill } from "@ui/button-pill";
import { ActionRow } from "@ui/action-row";
import { CalendarPlus, ForkKnife, type Icon, ListPlus, Plus, Sparkles, Store } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";
import { type Href, router } from "expo-router";
import { useStockCounts } from "~/modules/groceries/hooks";
import { useNavigationBar } from "~/modules/navigation/hooks";
import { CUISKO_HEAD } from "~/lib/mascots";

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
  { key: "import_recipe", icon: Plus, href: "/import-recipe" },
  { key: "plan_week", icon: CalendarPlus, href: "/planning/new/setup" },
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
              <ButtonPill
                size="sm"
                variant="neutral"
                onPress={() => router.push(item.href)}
                style={styles.start}
                leftContent={<View
                  style={{
                    width: 38,
                    height: 38,
                    padding: 5,
                    marginLeft: -10,
                    marginRight: -5
                  }}
                >
                  <Image
                    source={CUISKO_HEAD}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </View>}
              >
                {t(`QuickAccess.${item.key}`)}
              </ButtonPill>
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
        <ActionRow
          variant="secondary"
          onPress={() => router.push("/groceries")}
          content={t("QuickAccess.grocery_list")}
          contentIcon={ListPlus}
          subtitle={isLoading ? undefined : t("QuickAccess.to_buy_x_items", { count: toBuy })}
          leftIcon={Plus}
          onLeftIconPress={() => { focus("shopping-list") }}
          style={{ alignSelf: "stretch" }}
        />
        <ActionRow
          variant="flat"
          onPress={() => router.push({ pathname: "/groceries", params: { section: "cellar" } })}
          content={t("QuickAccess.cellar")}
          contentIcon={Store}
          subtitle={isLoading ? undefined : t("QuickAccess.in_stock_x_items", { count: inStock })}
          leftIcon={Plus}
          onLeftIconPress={() => { focus("cellar") }}
          style={{ alignSelf: "stretch" }}
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
  rows: { gap: theme.spacing[12] },
  starts: {
    paddingLeft: theme.spacing[16],
    paddingRight: theme.spacing[12],
    paddingBottom: theme.spacing[12],
    paddingTop: theme.spacing[12],
  },
  /** A margin rather than the container's `gap`, which a horizontal FlashList does not apply. */
  start: { marginRight: theme.spacing[6], backgroundColor: theme.colors.neutral.subtle },
});
