import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";

import { CardChoice } from "@ui/cards/choice";
import { theme } from "theme";
import { useTranslations } from "translations";

import { EQUIPMENTS } from "@shared/equipments";

import { EQUIPMENT_EMOJI } from "~/lib/vocabulary";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { useTunnel } from "./_hooks/useTunnel";
import { useTunnelScrollHandler } from "./_hooks/useTunnelScrollHandler";
import { TunnelHeader } from "./_components/tunnel-header";

const COLUMNS = 2;
const GUTTER = theme.spacing[16];
const GAP = theme.spacing[8];

/** What the kitchen can do. Several answers, because most kitchens have several. */
export const TunnelUtensils = () => {
  const t = useTranslations("Planning");
  /** The kitchen's words belong to the vocabulary, not to whichever screen draws it. */
  const tVocabulary = useTranslations("Vocabulary");
  const { width } = useWindowDimensions();
  const { equipments, toggleEquipment } = useTunnel();
  const onScroll = useTunnelScrollHandler();

  const tileWidth = (width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <TunnelHeader title={t("Tunnel.Utensils.title")} subtitle={t("Tunnel.Utensils.subtitle")} />
      <View style={styles.grid}>
        {EQUIPMENTS.map((equipment) => (
          <CardChoice
            key={equipment}
            label={tVocabulary(`Equipments.${equipment}`)}
            emoji={EQUIPMENT_EMOJI[equipment]}
            style={{ width: tileWidth - 1 }}
            selected={equipments.includes(equipment)}
            onPress={() => toggleEquipment(equipment)}
            elevated
          />
        ))}
      </View>
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET, paddingHorizontal: GUTTER },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
});
