import { View, StyleSheet } from "react-native";

import { ButtonIcon } from "@ui/button-icon";
import { ButtonPill } from "@ui/button-pill";
import { Check, X } from "@ui/icons";
import { SafeAreaView } from "@ui/safe-area-view";
import { theme } from "theme";

import { SCREEN_PADDING } from "../constants";

type Props = {
  saveLabel: string;
  onSave: () => void;
  onCancel: () => void;
};

/**
 * Dismiss and save, floating over the page rather than sitting at the end of it.
 *
 * The editor is longer than a screen and has no natural bottom — a save button that has to be
 * scrolled to is a recipe abandoned half-written. Pinned, both answers stay one tap away wherever
 * the page has been left.
 */
export const EditorActions = ({ saveLabel, onSave, onCancel }: Props) => (
  <SafeAreaView edges={{ top: "off", bottom: "android" }} style={styles.bar}>
    <View style={styles.row}>
      <ButtonIcon variant="neutral-inverted" elevated size="lg" onPress={onCancel}>
        {X}
      </ButtonIcon>
      <ButtonPill elevated variant="secondary" rightIcon={Check} size="lg" onPress={onSave}>
        {saveLabel}
      </ButtonPill>
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
