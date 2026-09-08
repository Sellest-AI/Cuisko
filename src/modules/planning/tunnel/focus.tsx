import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";

import { theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { MAX_TASTES } from "../_model/model";
import { FOCUSES } from "../_hooks/placeholders";
import { useTunnel } from "./_hooks/useTunnel";
import { useTunnelScrollHandler } from "./_hooks/useTunnelScrollHandler";
import { ChoiceRows } from "./_components/choice-rows";
import { TunnelHeader } from "./_components/tunnel-header";

const GUTTER = theme.spacing[16];

/**
 * The narrower asks, separated from the mood step and skipped by most weeks.
 *
 * Split out because these are specific in a way a craving is not: "high fibre" concerns a minority
 * of users and, sitting in the mood list, it would spend one of their four slots on something the
 * broader question was for. Two shorter questions read faster than one long one nobody finishes.
 */
export const TunnelFocus = () => {
  const t = useTranslations("Planning");
  const { focuses, toggleFocus } = useTunnel();
  const onScroll = useTunnelScrollHandler();

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <TunnelHeader title={t("Tunnel.Focus.title")} subtitle={t("Tunnel.Focus.subtitle")} />
      <ChoiceRows options={FOCUSES} selected={focuses} onToggle={toggleFocus} max={MAX_TASTES} />
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET, paddingHorizontal: GUTTER },
});
