import { StyleSheet, View } from "react-native";
import { theme } from "theme";

/**
 * A plain page over the whole app, which takes every tap: what `AuthGate` and `RestartOnSignOut`
 * draw while the screen underneath answers for an account that is no longer there.
 */
export const Cover = () => <View style={[StyleSheet.absoluteFill, styles.cover]} />;

const styles = StyleSheet.create({
  cover: { backgroundColor: theme.colors.background },
});
