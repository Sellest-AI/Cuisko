import { View, StyleSheet, ViewStyle, TextInput } from "react-native";
import { theme } from "theme";
import { ButtonIcon } from "./button-icon";
import { Icon } from "./icons";
import { BlurView } from "./blur-view";

type Props = {
  style?: ViewStyle,
  placeholder?: string,
  leftIcon?: Icon,
  onLeftPress?: () => void,
  rightIcon?: Icon,
  onRightPress?: () => void,
  rightContent?: React.ReactNode,
  elevated?: boolean,
  onFocus?: () => void,
  onBlur?: () => void,
  onSubmit?: (value: string) => void,
  // values
  value?: string,
  onChangeText?: (value: string) => void,
  ref?: React.RefObject<TextInput | null>,
  type?: "text" | "numeric" | "decimal" | "email",
}

export { TextInput } from "react-native";

export const Input = ({ type = "text", ref, style, elevated, placeholder, leftIcon, onLeftPress, onFocus, onSubmit, onBlur, value, onChangeText, rightIcon, onRightPress, rightContent }: Props) => {
  const color = elevated ? styles.neutralElevated : styles.neutral;
  const placeholderColor = theme.colors.neutral.muted;

  const padding = elevated ? theme.spacing[8] : theme.spacing[4];
  const paddingRight = rightContent ? theme.spacing[16] : padding;
  const paddingLeft = leftIcon ? padding : theme.spacing[16];

  const ViewComponent = elevated ? BlurView : View;

  return (
    <View style={[
      styles.container,
      { borderRadius: theme.radius.full },
      { padding, paddingLeft, paddingRight },
      elevated && styles.elevated,
      style,
    ]}>
      <ViewComponent
        tint="light"
        style={[
          StyleSheet.absoluteFill,
          styles.borders,
          color
        ]}
      />
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
        onFocus={onFocus}
        onBlur={onBlur}
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
          theme.font.base,
          { outline: "none" },
          { color: color.color, position: "relative" },
          { width: "100%", flexShrink: 1 },
        ]}
      />
      {rightIcon && <ButtonIcon
        variant={"neutral-subtle"}
        elevated={true}
        composite={!onRightPress}
        size="sm"
        onPress={onRightPress}
      >
        {rightIcon}
      </ButtonIcon>}
      {rightContent && <View style={{ position: "relative" }}>
        {rightContent}
      </View>}
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
    minHeight: 36,
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
  borders: {
    borderWidth: 2,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.full,
  },
  neutral: {
    backgroundColor: theme.colors.neutral.subtle,
    color: theme.colors.neutral.base,
  },
  neutralElevated: {
    backgroundColor: theme.colors.surface.elevated,
    color: theme.colors.neutral.base,
  },
})
