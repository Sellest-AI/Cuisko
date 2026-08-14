import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, type ComponentProps } from "react";
import type { ViewStyle } from "react-native";

import { ButtonIcon } from "@ui/button-icon";
import type { Icon } from "@ui/icons";

type ModalAction = {
  icon: Icon;
  onPress: () => void;
  variant?: ComponentProps<typeof ButtonIcon>["variant"];
};

const modalActionAtom = atom<ModalAction | null>(null);

/**
 * The one action a modal screen may hang beside its close button.
 *
 * Declared by the screen and drawn by the layout, rather than the screen positioning a button of
 * its own: `app/(modals)/_layout.tsx` draws a fade *between* the screen and that row, so anything
 * a screen puts up there lands under the fade instead of on it. It is the same trade
 * react-navigation makes with `headerRight`, made for the same reason.
 *
 * One action, not a list. A sheet with a row of controls above its content has stopped being a
 * sheet, and the second one to want a slot here should make this a real header instead.
 *
 * `null` declares that the screen has no action *right now* — a delete on a plate that does not
 * exist yet, say. Called unconditionally either way, because a hook that a screen stops calling
 * halfway through its life is not a hook React will run.
 */
export const useModalAction = (declared: ModalAction | null) => {
  const setAction = useSetAtom(modalActionAtom);

  const icon = declared?.icon;
  const onPress = declared?.onPress;
  const variant = declared?.variant;

  /**
   * Rebuilt from the fields rather than taken as given, so a caller declaring its action inline
   * does not re-register it on every render — and re-run every effect keyed on it.
   */
  const action = useMemo(
    () => (icon && onPress ? { icon, onPress, variant } : null),
    [icon, onPress, variant],
  );

  useEffect(() => {
    setAction(action);

    /**
     * Cleared only if it is still ours. A modal pushed over another mounts before the one beneath
     * unmounts, so an unconditional clear would wipe the incoming screen's action, not this one's.
     */
    return () => setAction((current) => (current === action ? null : current));
  }, [action, setAction]);
};

/** Where the layout draws it. Nothing at all until a screen declares one. */
export const ModalActionButton = ({ style }: { style?: ViewStyle }) => {
  const action = useAtomValue(modalActionAtom);

  if (!action) return null;

  return (
    <ButtonIcon
      elevated
      variant={action.variant ?? "neutral-inverted"}
      onPress={action.onPress}
      style={style}
    >
      {action.icon}
    </ButtonIcon>
  );
};
