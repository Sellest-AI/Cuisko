import { View, StyleSheet } from "react-native";

import { Text } from "@ui/text";
import { theme } from "theme";

import { stepNumber } from "./_model/step";

type Props = {
  title: string;
  steps: string[];
  /**
   * How many steps came before this section. Numbering runs across the whole method rather than
   * restarting per section — "step 3" has to mean one thing when someone is reading it aloud.
   */
  offset: number;
};

/** One stage of the method — the sauce, the plating — as its numbered steps. */
export const InstructionSection = ({ title, steps, offset }: Props) => (
  <View style={styles.section}>
    <Text.Base color={theme.colors.neutral.muted}>{title}</Text.Base>
    {steps.map((step, index) => (
      <View key={step + index} style={styles.step}>
        <Text.Lg color={theme.colors.neutral.muted}>{stepNumber(offset + index + 1)}</Text.Lg>
        <View style={styles.body}>
          <Text.Body color={theme.colors.foreground} style={styles.text}>{step}</Text.Body>
          {/* Between steps only: a rule under the last one would close the section twice. */}
          {index < steps.length - 1 && <View style={styles.rule} />}
        </View>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing[20],
    marginBottom: theme.spacing[32],
  },
  step: {
    flexDirection: "row",
    gap: theme.spacing[16],
    flexShrink: 1,
  },
  body: { flexShrink: 1 },
  text: { flexShrink: 1 },
  rule: {
    height: 1,
    backgroundColor: theme.colors.neutral.elevated,
    marginTop: theme.spacing[16],
  },
});
