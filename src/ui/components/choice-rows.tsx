import { StyleSheet, View } from "react-native";

import { RowCardChoice } from "@ui/cards/row-choice";
import { theme } from "theme";

/** What a row needs to draw itself. Structural, so `optionsOf` and a future query both satisfy it. */
type Option<T extends string> = { id: T; label: string; emoji: string };

/**
 * Generic in the id, so a caller holding a narrower one keeps it.
 *
 * The setup step's slots are `MealSlot`, not `string`, and its toggle refuses anything else — a
 * `string` id here would have forced a cast at that call site, which is the one place the narrowing
 * was doing real work.
 */
type Props<T extends string> = {
  options: readonly Option<T>[];
  selected: readonly T[];
  onToggle: (id: T) => void;
  /**
   * Past this many answers the unpicked rows go flat and stop responding. Omit for no ceiling —
   * which is what the allergy step does, where a list that stops accepting entries is dangerous
   * rather than merely annoying.
   */
  max?: number;
};

/**
 * The list idea-shaped questions are answered from: the tunnel's moods, seeks and allergies, and
 * the onboarding's goals.
 *
 * One component rather than three near-identical screens. What actually differs between those
 * steps is their question, their catalogue and their ceiling — all three of which are arguments —
 * so a second copy would only be a place for the ceiling behaviour to drift out of agreement with
 * the first.
 */
export const ChoiceRows = <T extends string>({ options, selected, onToggle, max }: Props<T>) => {
  const full = max !== undefined && selected.length >= max;

  return (
    <View style={styles.list}>
      {options.map((option) => {
        const picked = selected.includes(option.id);

        return (
          <RowCardChoice
            key={option.id}
            label={option.label}
            emoji={option.emoji}
            selected={picked}
            /** Never disables a picked row — turning one off is how the user makes room. */
            disabled={full && !picked}
            onPress={() => onToggle(option.id)}
            isMultiSelect={max === undefined || max > 1}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  list: {
    flexDirection: "column",
    gap: theme.spacing[8],
  },
});
