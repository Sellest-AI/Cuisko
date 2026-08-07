import type { ViewStyle } from "react-native";

/**
 * One row of a `Select`.
 *
 * `systemImage` is an SF Symbol name and is honoured only by the iOS menu. The shared fallback
 * ignores it rather than mapping it onto the nearest lucide glyph — the two sets do not overlap
 * cleanly, and a near-miss icon reads worse than no icon at all.
 */
export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  systemImage?: string;
  disabled?: boolean;
};

/**
 * Options arrive as DATA, never as children — and that is a constraint, not a preference.
 *
 * The iOS build renders each row as a SwiftUI `Text` inside a native `Picker`, which cannot host
 * a React Native view. An array is therefore the only shape that serialises into both a SwiftUI
 * menu and the RN popover, so this type is what keeps the two implementations interchangeable.
 * Accepting `children` would compile and then quietly render nothing on iOS.
 */
export type SelectProps<T extends string = string> = {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Trigger text while `value` matches no option — an unset select. */
  placeholder?: string;
  disabled?: boolean;
  size?: "md" | "lg";
  style?: ViewStyle;
};
