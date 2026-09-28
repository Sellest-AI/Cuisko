import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";

import { CardChoice } from "@ui/cards/choice";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import type { Diet } from "@shared/diets";

import { CUISKO } from "~/lib/mascots";
import { DIET_EMOJI } from "~/lib/vocabulary";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { isDietConstraint, type Constraint, type ConstraintValue } from "../_model/constraints";
import { useTunnel } from "./_hooks/useTunnel";
import { useTunnelScrollHandler } from "./_hooks/useTunnelScrollHandler";
import { StepHeader } from "@ui/step-header";

const COLUMNS = 2;
const GUTTER = theme.spacing[16];
const GAP = theme.spacing[8];

/** One list narrowed to the vocabulary being drawn, so the label and the glyph are typed for it. */
type DietConstraint = Constraint & { value: Diet };

/**
 * The "no particular diet" tile, drawn but never stored.
 *
 * `omnivore` is not a constraint, so `constraints` never contains it — see the note on
 * `CONSTRAINING_DIETS` in `_model/constraints.ts`. It is a tile because an all-off grid tested as
 * *unanswered* rather than as answered-with-nothing, and users went looking for the option that
 * said so. `active` is false here because selection is derived from the real diets, not from this
 * object: it is a label for the empty set, and the empty set is not a tick.
 */
const NO_DIET: DietConstraint = {
  value: "omnivore",
  source: "mine",
  active: false,
};

/**
 * How the household eats, wherever the constraint came from.
 *
 * **The split is by source, not by question.** An earlier design split "mine" from "this week" and
 * asked the same question twice; what a cook thinks about is what constrains this week. So one
 * list is drawn, and where a constraint came from is not shown on the tile — but it still decides
 * what a tap WRITES: unticking always drops it from the week, and only ever writes back to the
 * caller's own row, never a housemate's — see `_model/constraints.ts` for the whole table.
 *
 * The tiles carried a provenance badge ("you" / "someone in your household") and no longer do.
 * Nothing is applied more silently for it: an inherited constraint is still shown, still ticked
 * and still removable for the week, it is merely no longer attributed. Putting it back is a
 * caption again and nothing more, because `Constraint.source` still carries the answer.
 *
 * It never says *which* housemate, and never did. `getPlanningSeed` returns their union with no
 * name attached, because a diet is close enough to health data that the most this could ever say
 * is "someone in your household".
 *
 * The allergen half of the same list is the allergy step's, kept apart because a diet is a
 * preference the generator may bend and an allergy is one it must never bend.
 */
export const TunnelDiet = () => {
  const t = useTranslations("Planning");
  /** The words for a diet and an allergen belong to the vocabulary, not to whichever screen draws it. */
  const tVocabulary = useTranslations("Vocabulary");
  const { constraints, toggleConstraint, isSeedLoading } = useTunnel();
  const onScroll = useTunnelScrollHandler();

  /** `GroupSelect` is structural and speaks `string`, so the vocabulary is restored at this seam. */
  const onSelect = (value: string) => toggleConstraint(value as ConstraintValue);

  const diets = constraints.filter((constraint): constraint is DietConstraint =>
    isDietConstraint(constraint.value),
  );

  /** No real diet ticked is what `NO_DIET` stands for, so it is what selects that tile. */
  const hasNoDiet = diets.every((diet) => !diet.active);

  const { width } = useWindowDimensions();
  const tileWidth = (width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <StepHeader
        title={t("Tunnel.Diet.title")}
        subtitle={t("Tunnel.Diet.subtitle")}
        mascot={CUISKO.fish}
      />
      {isSeedLoading ? (
        /**
         * A word rather than a chip row: the list is seeded once from what the household already
         * said, so chips drawn before it lands would be unticked ones the user could answer and
         * have overwritten a moment later.
         */
        <Text.Base color={colors.muted}>{t("Tunnel.Diet.loading")}</Text.Base>
      ) : (
        <View style={styles.grid}>
          {[NO_DIET, ...diets].map((diet) => {
            const isNoDiet = diet.value === NO_DIET.value;

            return (
              <CardChoice
                key={diet.value}
                label={tVocabulary(`Diets.${diet.value}`)}
                emoji={DIET_EMOJI[diet.value]}
                style={{ width: tileWidth - 1 }}
                selected={isNoDiet ? hasNoDiet : diet.active}
                onPress={() => {
                  /**
                   * Selecting "no diet" is unticking every diet: the tile has no value of its own
                   * to toggle, and leaving the old ticks on would contradict the tile the user
                   * just lit. Already-empty is a no-op, which is what an inert tile should be.
                   */
                  if (isNoDiet) diets.filter((d) => d.active).forEach((d) => onSelect(d.value));
                  else onSelect(diet.value);
                }}
                elevated
              />
            );
          })}
        </View>
      )}
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
  }
});
