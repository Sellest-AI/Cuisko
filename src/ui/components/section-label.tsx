import { StyleSheet, View } from "react-native";

import { Text } from "@ui/text";
import { colors, theme } from "theme";

type Props = {
  label: string;
  /**
   * The answer, echoed in a chip beside the question.
   *
   * Optional because some sections answer themselves — two of two meal toggles lit needs no "2/2"
   * repeating it, where "how many days" reads as a slider position until a number names it.
   */
  value?: string;
  style?: View["props"]["style"];
};

/**
 * A section's question, with its current answer beside it.
 *
 * In `@ui` because the planning tunnel, its sheets and the onboarding all draw it.
 */
export const SectionLabel = ({ label, value, style }: Props) => (
  <View style={[styles.row, style]}>
    <Text.Lg color={colors.muted}>{label}</Text.Lg>
    {value !== undefined && (
      <View style={styles.counter}>
        <Text.Base weight={700}>{value}</Text.Base>
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing[28],
    marginBottom: theme.spacing[12],
  },
  counter: {
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[6],
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.elevatedSubtle,
  },
});
