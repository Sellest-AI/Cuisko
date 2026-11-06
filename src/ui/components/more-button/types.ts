import type { ViewStyle } from "react-native";
import type { Icon } from "../icons";

/**
 * One row of a `MoreButton`.
 *
 * The icon comes twice because the two builds draw from different sets: `systemImage` is an SF
 * Symbol for the iOS menu, `icon` a lucide glyph for the shared fallback. Either may be left out,
 * and that platform's row then shows its label alone.
 */
type MoreAction = {
  key: string;
  label: string;
  onPress: () => void;
  systemImage?: string;
  icon?: Icon;
  /** Red, and on iOS the system's own destructive treatment. The caller still confirms. */
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * Actions arrive as DATA, never as children, for the reason `SelectProps` gives: the iOS rows are
 * SwiftUI `Button`s inside a native `Menu`, which cannot host a React Native view.
 *
 * `groups` is a list of lists because a menu's separators are part of its meaning: Delete sits
 * apart from Share. Each inner list is a group, and a separator falls between consecutive ones.
 */
export type MoreButtonProps = {
  groups: readonly (readonly MoreAction[])[];
  /** What a screen reader announces for the trigger, which shows only `…`. */
  accessibilityLabel: string;
  /** Matches `ButtonIcon`'s sizes of the same name, so it can sit in a row of them. */
  size?: "sm" | "md";
  disabled?: boolean;
  style?: ViewStyle;
};
