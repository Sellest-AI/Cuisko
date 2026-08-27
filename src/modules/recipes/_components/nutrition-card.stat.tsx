import { View, StyleSheet, ViewStyle } from "react-native";

import { Text } from "@ui/text";
import { theme } from "theme";

type Props = {
  label: string;
  value: string;
  style?: ViewStyle;
};

/**
 * One measured fact about the recipe — a macro, a cooking time — as a muted label over its value.
 *
 * Both lines are single-line on purpose: these sit four to a row inside a fixed card, and a value
 * that wrapped would push its neighbours out of alignment rather than shrink.
 */
export const Stat = ({ label, value, style }: Props) => (
  <View style={[styles.stat, style]}>
    <Text.Base color={theme.colors.neutral.muted} numberOfLines={1}>{label}</Text.Base>
    <Text.Base color={theme.colors.neutral.base} numberOfLines={1}>{value}</Text.Base>
  </View>
);

const styles = StyleSheet.create({
  stat: { gap: theme.spacing[6] },
});
