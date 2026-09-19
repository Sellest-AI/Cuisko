import { StyleSheet, Text, View } from "react-native";

import { ArrowRight } from "@ui/icons";
import { ButtonPill } from "@ui/button-pill";
import { theme } from "theme";

type Props = {
  user: { id: string; email: string | null; role: string };
  onSignOut: () => void;
};

/**
 * Who you are signed in as — a debugging view, not a product screen. Nothing routes a signed-in
 * user away from `/auth` yet, so this is what they land on until an auth gate exists.
 */
export const SignedIn = ({ user, onSignOut }: Props) => (
  <View style={styles.container}>
    <Text style={styles.heading}>Signed in</Text>

    <View style={styles.card}>
      <Field label="User id" value={user.id} />
      <Field label="Email" value={user.email ?? "-"} />
      <Field label="Role" value={user.role} />
    </View>

    <ButtonPill onPress={onSignOut} variant="neutral" leftIcon={ArrowRight}>
      Sign out
    </ButtonPill>
  </View>
);

const Field = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text selectable style={styles.fieldValue}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: theme.colors.background,
    flex: 1,
    gap: theme.spacing[12],
    justifyContent: "center",
    padding: theme.spacing[16],
  },
  heading: { color: theme.colors.foreground, fontSize: theme.font.h4.fontSize, fontWeight: "700" },
  card: {
    backgroundColor: theme.colors.surface.elevated,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: theme.spacing[12],
    padding: theme.spacing[16],
    width: "100%",
  },
  field: { gap: theme.spacing[4] },
  fieldLabel: { color: theme.colors.muted, fontSize: theme.font.sm.fontSize, fontWeight: "600" },
  fieldValue: { color: theme.colors.foreground, fontFamily: "monospace", fontSize: theme.font.sm.fontSize },
});
