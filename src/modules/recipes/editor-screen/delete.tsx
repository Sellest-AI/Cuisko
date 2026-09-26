import { useEffect, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { Button } from "@ui/button";
import { Trash2 } from "@ui/icons";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

type Props = {
  onDelete: () => void;
  /** While the delete is on its way, so a third tap cannot send it twice. */
  isDeleting?: boolean;
  /** The last delete was refused; said under the button, where the cook's thumb still is. */
  failed?: boolean;
  style?: ViewStyle;
};

/** How long the second tap is waited for before the button forgets the first. */
const RESET_WINDOW_MS = 5000;

/** How long after the arming tap a second one is ignored, so a double tap cannot delete. */
const ARMING_DELAY_MS = 800;

/**
 * Deleting the recipe, at the very end of the editor.
 *
 * Two taps rather than a dialog: `@ui` has no confirm sheet, and React Native's `Alert` does
 * nothing on web. The first tap arms the button and changes its words, the second deletes. Left
 * alone, it disarms, so a stray tap weeks of scrolling later cannot be the second one. A second
 * tap within `ARMING_DELAY_MS` of the first is dropped by the button, so a double tap only arms.
 *
 * At the end of the page and not in the floating actions, so it is never one tap from "save".
 */
export const EditorDelete = ({ onDelete, isDeleting = false, failed = false, style }: Props) => {
  const t = useTranslations("Recipe");
  const [isArmed, setIsArmed] = useState(false);

  useEffect(() => {
    if (!isArmed) return;

    const timer = setTimeout(() => setIsArmed(false), RESET_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [isArmed]);

  const onPress = () => {
    if (!isArmed) return setIsArmed(true);

    setIsArmed(false);
    onDelete();
  };

  return (
    <View style={[styles.container, style]}>
      <Button
        variant="neutral"
        leftIcon={Trash2}
        onPress={onPress}
        isLoading={isDeleting}
        disabled={isDeleting}
        doubleTapDelay={ARMING_DELAY_MS}
        style={styles.button}
      >
        {t(isArmed ? "Editor.delete_confirm" : "Editor.delete")}
      </Button>
      {failed && <Text.Sm style={styles.error}>{t("Editor.delete_error")}</Text.Sm>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: theme.spacing[8] },
  button: { color: colors.danger.base },
  error: { color: colors.danger.base, textAlign: "center" },
});
