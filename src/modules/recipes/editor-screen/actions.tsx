import { View, StyleSheet } from "react-native";

import { ButtonIcon } from "@ui/button-icon";
import { ButtonPill } from "@ui/button-pill";
import { AnimatePresence, m } from "@ui/motion";
import { Check, X } from "@ui/icons";
import { SafeAreaView } from "@ui/safe-area-view";
import { theme } from "theme";

import { SCREEN_PADDING } from "../constants";

type Props = {
  saveLabel: string;
  onSave: () => void;
  onCancel: () => void;
  disabled?: boolean;
};

/**
 * Dismiss and save, floating over the page rather than sitting at the end of it.
 *
 * The editor is longer than a screen and has no natural bottom — a save button that has to be
 * scrolled to is a recipe abandoned half-written. Pinned, both answers stay one tap away wherever
 * the page has been left.
 */
export const EditorActions = ({ saveLabel, disabled, onSave, onCancel }: Props) => (
  <SafeAreaView edges={{ top: "off", bottom: "android" }} style={styles.bar}>
    <View style={styles.row}>
      <ButtonIcon variant="neutral-inverted" elevated size="lg" onPress={onCancel}>
        {X}
      </ButtonIcon>
      <AnimatePresence>
        {!disabled && (
          <m.View
            from={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 200 }}
            exitTransition={{ duration: 100 }}
          >
            <ButtonPill elevated variant="secondary" rightIcon={Check} size="lg" onPress={onSave} disabled={disabled}>
              {saveLabel}
            </ButtonPill>
          </m.View>
        )}
      </AnimatePresence>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    bottom: theme.spacing[24],
    left: SCREEN_PADDING,
    right: SCREEN_PADDING,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[12],
    paddingTop: theme.spacing[8],
  },
});
