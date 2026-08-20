import { View, StyleSheet, ViewStyle } from "react-native";

import { Input } from "@ui/input";
import { Text } from "@ui/text";
import { TextField } from "@ui/text-field";
import { colors, theme } from "theme";

type Props = {
  label: string;
  /** Sits muted beside the label — "(Optional)" — for an answer the recipe can do without. */
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** Prose grows with what is typed; a name does not. Which one is a property of the answer. */
  multiline?: boolean;
  style?: ViewStyle;
};

/**
 * One labelled answer in the editor.
 *
 * The editor asks for four things and draws each the same way, so the label sits with its control
 * here rather than four times over in the screen. The placeholder carries the accessible name —
 * `TextField` and `Input` both read it — which is why it is required rather than optional.
 */
export const EditorField = ({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  style,
}: Props) => (
  <View style={[styles.field, style]}>
    <Text.Lg>
      {label}
      {hint ? <Text.Base color={colors.neutral.muted}> {hint}</Text.Base> : null}
    </Text.Lg>
    {multiline ? (
      <TextField
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={styles.prose}
        multiline
      />
    ) : (
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={styles.line}
      />
    )}
  </View>
);

/** Two lines of prose before it scrolls, so a short method is visible without touching it. */
const PROSE_MIN_HEIGHT = 64;

const styles = StyleSheet.create({
  field: { gap: theme.spacing[12] },
  line: { borderRadius: theme.radius.sm },
  prose: {
    backgroundColor: colors.neutral.subtle,
    borderRadius: theme.radius.sm,
    minHeight: PROSE_MIN_HEIGHT,
    padding: theme.spacing[12],
    /** Room under the last line, so a growing field does not sit tight against its own edge. */
    paddingBottom: theme.spacing[20],
    /** The field is framed by its fill here, not lifted off the page as it is on a form. */
    boxShadow: "unset",
  },
});
