import { Button, type ButtonProps, Host, Menu, Section } from "@expo/ui/swift-ui";
import {
  disabled as disabledModifier,
  frame,
  glassEffect,
  labelStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { colors } from "theme";
import type { MoreButtonProps } from "./types";

/**
 * iOS gets the system pull-down menu, as `Select` does. Metro resolves this file over
 * `more-button/index.tsx`; both keep the same props through `types.ts`.
 *
 * The trigger is SwiftUI's own `Menu` label, shown icon-only: the `accessibilityLabel` is its
 * title, so VoiceOver reads it while the glyph alone is drawn. `glassEffect` gives it the same
 * Liquid Glass disc the `Select` trigger has, sized to match a `ButtonIcon` beside it.
 *
 * A `Section` per group is how SwiftUI draws a menu's separators; an untitled one adds nothing else.
 */
export const MoreButton = ({
  groups,
  accessibilityLabel,
  size = "md",
  disabled,
  style,
}: MoreButtonProps) => (
  /** `ignoreSafeArea`: see `select/index.ios.tsx`, for the same lag under the status bar. */
  <Host matchContents ignoreSafeArea="all" style={style}>
    <Menu
      label={accessibilityLabel}
      systemImage="ellipsis"
      modifiers={[
        labelStyle("iconOnly"),
        frame({ width: TRIGGER_SIZE[size], height: TRIGGER_SIZE[size] }),
        glassEffect({ glass: { variant: "regular", interactive: true }, shape: "circle" }),
        tint(colors.foreground),
        disabledModifier(disabled ?? false),
      ]}
    >
      {groups.map((group) => (
        <Section key={group.map((action) => action.key).join("|")}>
          {group.map((action) => (
            <Button
              key={action.key}
              label={action.label}
              /** `types.ts` keeps it a plain string; see `select/index.ios.tsx`. */
              systemImage={action.systemImage as ButtonProps["systemImage"]}
              role={action.destructive ? "destructive" : "default"}
              onPress={action.onPress}
              modifiers={[disabledModifier(action.disabled ?? false)]}
            />
          ))}
        </Section>
      ))}
    </Menu>
  </Host>
);

/**
 * The disc of the `ButtonIcon` of the same size: a 20 glyph, its padding (10 for `sm`, 12 for
 * `md`) and a 2 border on each side.
 */
const TRIGGER_SIZE = { sm: 44, md: 48 } as const;
