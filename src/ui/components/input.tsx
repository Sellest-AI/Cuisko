import { useState } from "react";
import { View, StyleSheet, ViewStyle, TextInput } from "react-native";
import { theme } from "theme";
import { ButtonIcon } from "./button-icon";
import { Icon } from "./icons";
import { BlurScope, BlurView } from "./blur-view";

type Props = {
  style?: ViewStyle,
  placeholder?: string,
  leftIcon?: Icon,
  onLeftPress?: () => void,
  rightIcon?: Icon,
  onRightPress?: () => void,
  rightContent?: React.ReactNode,
  elevated?: boolean,
  /**
   * Opt-in, because the inputs differ in what focus means to them. A field on a form the cook is
   * filling in wants to say which one the keyboard is aimed at; the navigation bar's input answers
   * that with its own opening animation, and a second border would be noise on top of it.
   */
  highlightOnFocus?: boolean,
  onFocus?: () => void,
  onBlur?: () => void,
  onSubmit?: (value: string) => void,
  // values
  value?: string,
  onChangeText?: (value: string) => void,
  ref?: React.RefObject<TextInput | null>,
  type?: "text" | "numeric" | "decimal" | "email",
  isLoading?: boolean,
}

export { TextInput } from "react-native";

export const Input = ({ type = "text", ref, style, elevated, highlightOnFocus, placeholder, isLoading, leftIcon, onLeftPress, onFocus, onSubmit, onBlur, value, onChangeText, rightIcon, onRightPress, rightContent }: Props) => {
  const color = elevated ? styles.neutralElevated : styles.neutral;

  /**
   * Held here rather than derived from the caller's `onFocus` / `onBlur`, which are forwarded
   * untouched: at least one caller only forwards blur on web, so a highlight driven by them would
   * stay lit on a phone long after the field had let the keyboard go.
   */
  const [isFocused, setIsFocused] = useState(false);
  const placeholderColor = theme.colors.neutral.muted;

  const padding = elevated ? theme.spacing[8] : theme.spacing[4];
  const paddingRight = rightContent ? theme.spacing[16] : padding;
  const paddingLeft = leftIcon ? padding : theme.spacing[16];

  const ViewComponent = elevated ? BlurView : View;

  const borderRadius = style?.borderRadius ?? styles.borders.borderRadius;

  return (
    <View style={[
      styles.container,
      { borderRadius },
      { padding, paddingLeft, paddingRight },
      elevated && styles.elevated,
      style,
    ]}>
      <ViewComponent
        tint="light"
        style={[
          StyleSheet.absoluteFill,
          styles.borders,
          { borderRadius },
          color,
          highlightOnFocus && isFocused && styles.bordersFocused,
        ]}
      />
      {/*
        * The discs sit on this field's own surface, so they must not sample the page behind it —
        * see `BlurScope`. The surface above is a sibling, not their parent, hence the explicit scope.
        */}
      <BlurScope target={null}>
        {leftIcon && <ButtonIcon
          variant={"neutral-subtle"}
          elevated={true}
          composite
          size="sm"
          onPress={onLeftPress}
        >
          {leftIcon}
        </ButtonIcon>}
        <TextInput
          ref={ref}
          inputMode={type === "numeric" ? "numeric" :
            type === "decimal" ? "decimal" :
              type === "email" ? "email" : "text"}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          onFocus={() => { setIsFocused(true); onFocus?.(); }}
          onBlur={() => { setIsFocused(false); onBlur?.(); }}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={(e) => {
            // Necessary for native + web platforms
            const _value = (e.nativeEvent as unknown as { text: string }).text ??
              e.currentTarget.nodeValue ?? value;
            onSubmit?.(_value);
          }}
          autoCorrect={false}
          autoCapitalize="sentences"
          returnKeyType="search"
          style={[
            styles.input,
            theme.font.base,
            { fontWeight: 400 },
            { color: color.color },
          ]}
        />
        {rightIcon && <ButtonIcon
          variant={"neutral-subtle"}
          elevated={true}
          composite={!onRightPress}
          size="sm"
          onPress={onRightPress}
          isLoading={isLoading}
        >
          {rightIcon}
        </ButtonIcon>}
        {rightContent && <View style={{ position: "relative" }}>
          {rightContent}
        </View>}
      </BlurScope>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[12],
    minHeight: 56,
    overflow: "hidden",
  },
  elevated: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 6,
        blurRadius: 32,
        spreadDistance: 0,
        color: "rgba(0, 0, 0, 0.1)",
      },
    ],
  },
  input: {
    position: "relative",
    width: "100%",
    flexShrink: 1,
    outlineWidth: 0,
  },
  borders: {
    borderWidth: 2,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.full,
  },
  /** The field the keyboard is aimed at — the same cue `text-field` gives its multiline sibling. */
  bordersFocused: { borderColor: theme.colors.primary.base },
  neutral: {
    backgroundColor: theme.colors.neutral.subtle,
    color: theme.colors.neutral.base,
  },
  neutralElevated: {
    backgroundColor: theme.colors.surface.elevated,
    color: theme.colors.neutral.base,
  },
})
