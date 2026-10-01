import { useRef, useState } from "react";
import { View, StyleSheet, ViewStyle, TextInput } from "react-native";
import { theme } from "theme";
import { ButtonIcon } from "./button-icon";
import { Icon } from "./icons";
import { BlurScope, BlurView } from "./blur-view";

/** A rectangle in window coordinates. */
export type Frame = { x: number, y: number, width: number, height: number };

const NO_FRAME: Frame = { x: 0, y: 0, width: 0, height: 0 };

type Props = {
  style?: ViewStyle,
  placeholder?: string,
  leftIcon?: Icon,
  /**
   * Receives where the button is on screen, for a caller that grows something out of it, and a way
   * to ask again later: the bar moves with the keyboard, so the frame it was handed is only true
   * until the next thing moves it.
   */
  onLeftPress?: (frame: Frame, measure?: () => Promise<Frame>) => void,
  rightIcon?: Icon,
  onRightPress?: () => void,
  rightContent?: React.ReactNode,
  /**
   * Drawn where the text field was, keeping the shell and both side buttons. For a field that has
   * stopped taking typing for a moment — the navigation bar while it listens.
   */
  centerContent?: React.ReactNode,
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
  /**
   * Wraps instead of scrolling sideways, growing up to `MAX_LINES` lines and scrolling past them —
   * for a field that takes sentences, like the navigation bar's question to Cuisko. Return still
   * submits rather than starting a new line.
   */
  multiline?: boolean,
}

/** How tall a multiline field grows before it scrolls instead. */
const MAX_LINES = 3;

export { TextInput } from "react-native";

export const Input = ({ type = "text", ref, style, elevated, highlightOnFocus, placeholder, isLoading, leftIcon, onLeftPress, onFocus, onSubmit, onBlur, value, onChangeText, rightIcon, onRightPress, rightContent, centerContent, multiline = false }: Props) => {
  const color = elevated ? styles.neutralElevated : styles.neutral;

  /**
   * Held here rather than derived from the caller's `onFocus` / `onBlur`, which are forwarded
   * untouched: at least one caller only forwards blur on web, so a highlight driven by them would
   * stay lit on a phone long after the field had let the keyboard go.
   */
  const [isFocused, setIsFocused] = useState(false);
  const leftRef = useRef<View>(null);
  const measureLeft = () => new Promise<Frame>((resolve) => {
    if (!leftRef.current) return resolve(NO_FRAME);
    leftRef.current.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
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
        {leftIcon && <View ref={leftRef} collapsable={false}>
          <ButtonIcon
            variant={"neutral-subtle"}
            elevated={true}
            composite={!onLeftPress}
            size="sm"
            onPress={() => {
              // Measured at the press, not on layout: the bar moves with the keyboard and the page.
              void measureLeft().then((frame) => onLeftPress?.(frame, measureLeft));
            }}
          >
            {leftIcon}
          </ButtonIcon>
        </View>}
        {centerContent ?? <TextInput
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
          /**
           * One line, placeholder included. Android lays the hint out as multi-line even on a
           * single-line field, so a placeholder wider than the field wrapped onto a second line the
           * cook could scroll to inside a box one line tall. A multiline field keeps its
           * placeholder short instead.
           */
          numberOfLines={multiline ? undefined : 1}
          multiline={multiline}
          submitBehavior={multiline ? "submit" : undefined}
          autoCorrect={false}
          autoCapitalize="sentences"
          returnKeyType="search"
          style={[
            styles.input,
            theme.font.base,
            { fontWeight: 400 },
            { color: color.color },
            multiline && styles.multiline,
          ]}
        />}
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
    /**
     * Android's `EditText` ships its own vertical padding, which made the content a few pixels
     * taller than the line and so scrollable. The container already centres and pads the field.
     */
    paddingVertical: 0,
  },
  multiline: {
    maxHeight: theme.font.base.lineHeight * MAX_LINES,
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
