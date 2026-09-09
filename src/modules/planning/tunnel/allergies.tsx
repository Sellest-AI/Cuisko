import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";

import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import type { Allergen } from "@shared/allergens";

import { ALLERGEN_EMOJI } from "~/lib/vocabulary";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { isDietConstraint } from "../_model/constraints";
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
 * is one it must never bend.
 *
 * Both halves come from the one constraint list, which is what lets an exclusion the caller
 * inherited from a housemate arrive already ticked. Unticking one drops it from the week and from
 * the caller's own row, never from the housemate's — see `_model/constraints.ts`.
 *
 * Deliberately uncapped, unlike the mood and focus steps — an exclusion list that stops accepting
 * entries is a plan built around an allergy the app quietly dropped.
 */
export const TunnelAllergies = () => {
  const t = useTranslations("Planning");
  /** An allergen's word belongs to the vocabulary, not to whichever screen draws it. */
  const tVocabulary = useTranslations("Vocabulary");
  const { constraints, toggleConstraint, isSeedLoading } = useTunnel();
  const onScroll = useTunnelScrollHandler();

  const avoids = constraints.filter(
    (constraint): constraint is typeof constraint & { value: Allergen } =>
      !isDietConstraint(constraint.value),
  );

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <TunnelHeader title={t("Tunnel.Allergies.title")} subtitle={t("Tunnel.Allergies.subtitle")} />
      {isSeedLoading ? (
        /**
         * A word rather than a row list: the list is seeded once from what the household already
         * said, so rows drawn before it lands would be unticked ones the user could answer and
         * have overwritten a moment later.
         */
        <Text.Base color={colors.muted}>{t("Tunnel.Diet.loading")}</Text.Base>
      ) : (
        <ChoiceRows
          options={avoids.map((constraint) => ({
            id: constraint.value,
            label: tVocabulary(`Allergens.${constraint.value}`),
            emoji: ALLERGEN_EMOJI[constraint.value],
          }))}
          selected={avoids.filter((constraint) => constraint.active).map((constraint) => constraint.value)}
          onToggle={toggleConstraint}
        />
      )}
    </Animated.ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET, paddingHorizontal: GUTTER },
});
