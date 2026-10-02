import { StyleSheet, View, type ViewStyle } from "react-native";

import { Button } from "@ui/button";
import { useArmedPress } from "@ui/hooks/useArmedPress";
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

/**
 * Deleting the recipe, at the very end of the editor.
 *
 * Two taps rather than a dialog, which is what `useArmedPress` is: the first tap arms the button
 * and changes its words, the second deletes, and left alone it disarms.
 *
 * At the end of the page and not in the floating actions, so it is never one tap from "save".
 */
export const EditorDelete = ({ onDelete, isDeleting = false, failed = false, style }: Props) => {
  const t = useTranslations("Recipe");
  const { isArmed, onPress, doubleTapDelay } = useArmedPress(onDelete);

  return (
    <View style={[styles.container, style]}>
      <Button
        variant="neutral"
        leftIcon={Trash2}
        onPress={onPress}
        isLoading={isDeleting}
        disabled={isDeleting}
        doubleTapDelay={doubleTapDelay}
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
