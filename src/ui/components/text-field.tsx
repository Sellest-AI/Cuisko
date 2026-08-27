import { useState } from "react";
import { StyleSheet, TextInput, TextStyle, View } from "react-native";

import { theme } from "theme";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  /**
   * Required, because it is also the accessible name: the field draws no label of its own, so
   * `accessibilityLabel` has nothing else to fall back to and a screen reader would announce an
   * optional one as nothing at all. A caller wanting a *visible* label draws it above the field.
   */
  placeholder: string;
  isSecure?: boolean;
  /** `email` turns off capitalisation and autocorrect, which otherwise mangle addresses. */
  kind?: "text" | "email";
  editable?: boolean;
  multiline?: boolean;
  style?: TextStyle;
};

export const TextField = ({
  value,
  onChangeText,
  placeholder,
  isSecure = false,
  kind = "text",
  editable = true,
  multiline = false,
  style,
}: Props) => {
  const boxShadow = StyleSheet.flatten(style)?.boxShadow ?? styles.shadow.boxShadow;
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.wrapper, { boxShadow }]}>
      <TextInput
        accessibilityLabel={placeholder}
        autoCapitalize={kind === "email" ? "none" : "sentences"}
        autoCorrect={kind !== "email"}
        editable={editable}
        keyboardType={kind === "email" ? "email-address" : "default"}
        multiline={multiline}
        onBlur={() => setIsFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        secureTextEntry={isSecure}
        style={[
          styles.input,
          multiline && styles.multiline,
          !editable && styles.inputDisabled,
          style,
          /*
           * After `style`, deliberately. Focus is a state, not something a caller can express as a
           * static prop, so a caller's own border must not silently swallow the one affordance
           * telling the cook which field the keyboard is typing into.
           */
          isFocused && styles.inputFocused,
        ]}
        textContentType={kind === "email" ? "emailAddress" : isSecure ? "password" : "none"}
        value={value}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { borderRadius: theme.radius.sm },
  shadow: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 4,
        blurRadius: 32,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.07)",
      },
    ],
  },
  input: {
    backgroundColor: theme.colors.surface.input,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    color: theme.colors.foreground,
    fontSize: theme.font.base.fontSize,
    minHeight: 48,
    paddingHorizontal: theme.spacing[12],
  },
  /**
   * Android centres a `TextInput`'s content vertically whatever its height, so a tall multiline
   * field put the placeholder — and the caret behind it — halfway down the box, as if the first
   * line were in the middle of the paragraph. Prose starts at the top; `verticalAlign` is the
   * cross-platform name, `textAlignVertical` the one Android's older path still reads.
   */
  multiline: { textAlignVertical: "top", verticalAlign: "top" },
  inputDisabled: { opacity: 0.6 },
  /** The field the keyboard is aimed at, since a placeholder alone never says "typing here". */
  inputFocused: { borderColor: theme.colors.primary.base },
});
