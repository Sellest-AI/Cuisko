import { Host, Label, type LabelProps, Picker, Text as SwiftUIText } from "@expo/ui/swift-ui";
import {
  disabled as disabledModifier,
  glassEffect,
  pickerStyle,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { colors } from "theme";
import type { SelectProps } from "./types";

/**
 * iOS gets the real system menu rather than a copy of one. Metro resolves this file over
 * `select/index.tsx`; both must keep the same props, which is why they share `types.ts`.
 *
 * `pickerStyle('menu')` is the reason this file exists. SwiftUI then owns the trigger, the
 * popover, the open and dismiss animations, and — the part a hand-rolled menu keeps getting
 * wrong — the checkmark marking the active row. `Menu` with `Button` children looks identical
 * until you notice it never shows which option is selected; a `Picker` is the primitive that
 * actually models a selection.
 *
 * The trigger is consequently SwiftUI's own, not our `ButtonPill`: a native menu draws its own
 * label and cannot host a React Native view. `glassEffect` is what keeps it in the family —
 * genuine Liquid Glass on iOS 26+, and the classic menu material underneath it.
 */
export const Select = <T extends string>({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  style,
}: SelectProps<T>) => {
  const selected = options.find((option) => option.value === value);

  return (
    /**
     * `ignoreSafeArea` keeps the picker glued to its React Native frame. By default the hosting
     * view insets its content by the window's safe area, so a Select scrolled under the status
     * bar (or above the keyboard) gets pushed back into the safe region and lags the scroll.
     */
    <Host matchContents ignoreSafeArea="all" style={style}>
      <Picker
        /**
         * A `.menu` picker already renders the selected row as its own label, so passing one
         * would print the text twice. The label is therefore only for the unset case, where
         * SwiftUI would otherwise render an empty trigger.
         */
        label={selected ? undefined : placeholder}
        selection={value}
        onSelectionChange={(next) => onChange(next as T)}
        modifiers={[
          pickerStyle("menu"),
          glassEffect({ glass: { variant: "regular", interactive: true }, shape: "capsule" }),
          tint(colors.foreground),
          disabledModifier(disabled ?? false),
        ]}
      >
        {options.map((option) => {
          const rowModifiers = [tag(option.value), disabledModifier(option.disabled ?? false)];

          /**
           * `types.ts` keeps `systemImage` a plain string so the shared contract carries
           * no iOS-only symbol union; narrowing it back here is that choice being paid for.
           */
          return option.systemImage ? (
            <Label
              key={option.value}
              title={option.label}
              systemImage={option.systemImage as LabelProps["systemImage"]}
              modifiers={rowModifiers}
            />
          ) : (
            <SwiftUIText key={option.value} modifiers={rowModifiers}>
              {option.label}
            </SwiftUIText>
          );
        })}
      </Picker>
    </Host>
  );
};
