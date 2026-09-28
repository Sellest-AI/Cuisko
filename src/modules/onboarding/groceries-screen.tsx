import { useCallback, useEffect } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { LinearTransition } from "react-native-reanimated";

import { GroceryItem } from "@ui/cards/grocery-item";
import {
  CheckIcon,
  CircleCheck,
  IconComponent,
  Lightbulb,
  ReceiptTextIcon,
  ShoppingCart,
  ShoppingCartIcon,
} from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { StepHeader } from "@ui/step-header";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { formatGroceryQuantity, NO_EMOJI } from "@shared/ingredients";

import { useUnitLabel } from "~/hooks/useUnitLabel";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { FakeNavigationBar } from "./_components/fake-navigation-bar";
import { Hint } from "./_components/hint";
import { GROCERY_HINTS, INGREDIENT_EMOJI, type IngredientId } from "./_model/fixtures";
import type { PantryRow } from "./_model/pantry";
import { useOnboarding } from "./_hooks/useOnboarding";
import { useProgressClearance } from "./_hooks/useProgressClearance";
import { useOnboardingPantry } from "./_hooks/useOnboardingPantry";

/** The real grid's geometry, so the cards come out the size they will be in the app. */
const COLUMNS = 3;
const GAP = theme.spacing[8];
const GUTTER = theme.spacing[16];

/** The fake bar's hint rail and input: what the page scrolls clear of while the bar is up. */
const FAKE_BAR_HEIGHT = 128;

/**
 * The card's own flight between sections, carried by the pulse wrapper around it: the same spring
 * `GroceryItem` uses, which it keeps private, so a card flies here as it does in the real list.
 */
const CARD_FLIGHT = LinearTransition.springify().damping(85).stiffness(700);

const SectionHeader = ({ label, icon: Icon, color }: { label: string; icon: IconComponent; color: string }) => (
  <View style={styles.section}>
    <Text.Lg>{label}</Text.Lg>
    <Icon size={20} color={color} />
  </View>
);

/**
 * Screen 2: the grocery list, filled from the navigation bar.
 *
 * A copy of the real list at the size it will really be: two hints type themselves into the bar,
 * each lands as a card breathing while it is looked up, then settles in "To buy". Tapping a card
 * buys it, and the same card flies down into the cellar, as it will in the app. Continue opens once
 * both are in the cellar.
 *
 * The screen hands over from one gesture to the next: once both hints are sent the bar sinks
 * away, a banner says what comes next, and the cards waiting in "To buy" pulse.
 */
export const OnboardingGroceries = () => {
  const t = useTranslations("Onboarding");
  const tGroceries = useTranslations("Groceries");
  const unit = useUnitLabel();
  const { width } = useWindowDimensions();
  const { complete } = useOnboarding();
  const clearance = useProgressClearance();
  const { toBuy, cellar, resolving, sent, add, buy } = useOnboardingPantry();

  const hints = GROCERY_HINTS.map(({ id }) => t(`Groceries.Hints.${id}`));
  const isAllSent = sent.length === GROCERY_HINTS.length && !resolving;
  const isStocked = GROCERY_HINTS.every(({ row }) => cellar.some((held) => held.ingredient === row.ingredient));

  useEffect(() => {
    if (isStocked) complete();
  }, [isStocked, complete]);

  const onSend = useCallback((index: number) => add(index), [add]);

  const itemWidth = (width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS - 1;

  /** Every row the fixtures hold is one of theirs, so its ingredient is an `IngredientId`. */
  const card = (row: PantryRow, variant: "pending" | "recent") => {
    const ingredient = row.ingredient as IngredientId;

    /**
     * Every card sits in the same wrapper, pulsing or not, so a card bought out of "To buy" keeps
     * its instance on the way to the cellar and flies there instead of being remounted.
     */
    return (
      <Hint
        key={ingredient}
        active={variant === "pending" && isAllSent}
        layout={CARD_FLIGHT}
      >
        <GroceryItem
          name={t(`Ingredients.${ingredient}`)}
          quantity={formatGroceryQuantity(row.quantity, row.unit, unit)}
          emoji={INGREDIENT_EMOJI[ingredient]}
          variant={variant}
          width={itemWidth}
          onPress={variant === "pending" ? () => buy(ingredient) : undefined}
        />
      </Hint>
    );
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: clearance }]} showsVerticalScrollIndicator={false}>
        <StepHeader title={t("Groceries.title")} icon={ReceiptTextIcon} />
        {isStocked ? (
          <InfoBanner variant="secondary" title={t("Groceries.done_title")} icon={CircleCheck} style={styles.banner}>
            {t("Groceries.tip_done")}
          </InfoBanner>
        ) : isAllSent ? (
          <InfoBanner variant="tip" title={t("Groceries.buy_title")} icon={ShoppingCart} style={styles.banner}>
            {t("Groceries.tip_buy")}
          </InfoBanner>
        ) : (
          <InfoBanner variant="tip" title={t("Groceries.send_title")} icon={Lightbulb} style={styles.banner}>
            {t("Groceries.tip_send")}
          </InfoBanner>
        )}
        {/* One keyed list, as the real grid is, so a bought card flies to the cellar rather than jumping. */}
        <View style={styles.grid}>
          {(toBuy.length > 0 || resolving) && (
            <SectionHeader
              key="header:to-buy"
              label={tGroceries("Sections.to_buy")}
              icon={ShoppingCartIcon}
              color={colors.primary.base}
            />
          )}
          {resolving && (
            <GroceryItem
              key={`ghost:${resolving.ingredient}`}
              name={t(`Ingredients.${resolving.ingredient as IngredientId}`)}
              quantity={tGroceries("Pending.resolving")}
              emoji={NO_EMOJI}
              variant="resolving"
              width={itemWidth}
            />
          )}
          {toBuy.map((row) => card(row, "pending"))}
          {cellar.length > 0 && (
            <SectionHeader
              key="header:cellar"
              label={tGroceries("Sections.cellar")}
              icon={CheckIcon}
              color={colors.secondary.base}
            />
          )}
          {cellar.map((row) => card(row, "recent"))}
        </View>
      </ScrollView>
      <FakeNavigationBar hints={hints} used={sent} onSend={onSend} visible={!isAllSent} style={styles.bar} />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingBottom: NAVIGATION_BAR_OFFSET + FAKE_BAR_HEIGHT },
  banner: { marginHorizontal: GUTTER, marginBottom: theme.spacing[8] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, paddingHorizontal: GUTTER },
  section: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    marginTop: theme.spacing[20],
    marginBottom: theme.spacing[4],
  },
  bar: { position: "absolute", left: GUTTER, right: GUTTER, bottom: NAVIGATION_BAR_OFFSET },
});
