import { router } from "expo-router";
import { StyleSheet } from "react-native";

import { ButtonPill } from "@ui/button-pill";
import { theme } from "theme";

/**
 * Opens the share sheet as if this reel had been shared to Cuisko, for development only: the home
 * screen renders it under `__DEV__`, so it never reaches a release build. It runs a REAL import
 * (about 6 cents and a minute) unless the cook already has this reel, in which case the server
 * answers with that recipe at once.
 */
const SAMPLE_REEL = "https://www.instagram.com/p/DXhhOS8jqnJ/";

export const DevShareButton = () => (
  <ButtonPill
    variant="ghost"
    size="sm"
    onPress={() => router.push({ pathname: "/(modals)/share-import", params: { url: SAMPLE_REEL } })}
    style={styles.button}
  >
    Dev: fake a shared reel
  </ButtonPill>
);

const styles = StyleSheet.create({
  button: { alignSelf: "center", marginTop: theme.spacing[24] },
});
