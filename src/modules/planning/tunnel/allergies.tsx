import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";

import { theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { ALLERGIES } from "../_hooks/placeholders";
import { useTunnel } from "./_hooks/useTunnel";
import { useTunnelScrollHandler } from "./_hooks/useTunnelScrollHandler";
import { ChoiceRows } from "./_components/choice-rows";
import { TunnelHeader } from "./_components/tunnel-header";

const GUTTER = theme.spacing[16];

/**
 * What must never reach the plate.
 *
 * Its own step rather than a second section of the diet one, because the two are different
 * promises: a diet is a preference the generator may bend to serve a better week, and an allergy
 * is one it must never bend. Kept apart here, and kept apart in the atoms behind them, so nothing
 * downstream has to decide id by id which kind it is holding.
 *
 * Deliberately uncapped, unlike the mood and focus steps — an exclusion list that stops accepting
 * entries is a plan built around an allergy the app quietly dropped.
 */
export const TunnelAllergies = () => {
  const t = useTranslations("Planning");
  const { allergies, toggleAllergy } = useTunnel();
  const onScroll = useTunnelScrollHandler();

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <TunnelHeader title={t("Tunnel.Allergies.title")} subtitle={t("Tunnel.Allergies.subtitle")} />
      <ChoiceRows options={ALLERGIES} selected={allergies} onToggle={toggleAllergy} />
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET, paddingHorizontal: GUTTER },
});
