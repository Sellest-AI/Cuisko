import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button } from "@ui/button";
import { TextField } from "@ui/text-field";
import { theme } from "theme";

import { useAuth, type AuthFlow } from "./_hooks/useAuth";

/**
 * The whole app, for now: sign in with a password, then show who you are.
 *
 * It lives here rather than in `app/index.tsx` because screens are routing only — params,
 * options, layout, and one feature-hook call (ADR 0006). Composition belongs to the module.
 */
export const AuthScreen = () => {
  const { user, isAuthenticated, isLoading, isSubmitting, error, signIn, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [flow, setFlow] = useState<AuthFlow>("signIn");

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (isAuthenticated && user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.heading}>Signed in</Text>

        <View style={styles.card}>
          <Field label="User id" value={user.id} />
          <Field label="Email" value={user.email ?? "—"} />
          <Field label="Role" value={user.role} />
        </View>

        <Button label="Sign out" onPress={() => void signOut()} variant="ghost" />
      </View>
    );
  }

  const isSignUp = flow === "signUp";

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Cuisko</Text>
      <Text style={styles.subheading}>
        {isSignUp ? "Create an account." : "Sign in to continue."}
      </Text>

      <View style={styles.form}>
        <TextField
          editable={!isSubmitting}
          kind="email"
          label="Email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          value={email}
        />
        <TextField
          editable={!isSubmitting}
          isSecure
          label="Password"
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          value={password}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          disabled={!email || !password}
          isLoading={isSubmitting}
          label={isSignUp ? "Create account" : "Sign in"}
          onPress={() => void signIn({ email: email.trim(), password, flow })}
        />
        <Button
          label={isSignUp ? "I already have an account" : "Create an account"}
          onPress={() => setFlow(isSignUp ? "signIn" : "signUp")}
          variant="ghost"
        />
      </View>
    </View>
  );
};

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
    backgroundColor: theme.colors.background,
    flex: 1,
    gap: theme.spacing.md,
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  centered: { alignItems: "center" },
  heading: { color: theme.colors.text, fontSize: theme.font.xl, fontWeight: "700" },
  subheading: { color: theme.colors.textMuted, fontSize: theme.font.md },
  form: { gap: theme.spacing.md, marginTop: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    width: "100%",
  },
  field: { gap: theme.spacing.xs },
  fieldLabel: { color: theme.colors.textMuted, fontSize: theme.font.sm, fontWeight: "600" },
  fieldValue: { color: theme.colors.text, fontFamily: "monospace", fontSize: theme.font.md },
  error: { color: theme.colors.danger, fontSize: theme.font.sm },
});
