import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { TextField } from "@ui/text-field";
import { ArrowRight } from "@ui/icons";
import { ButtonPill } from "@ui/button-pill";
import { Button } from "@ui/button";
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
        <ActivityIndicator color={theme.colors.primary.base} />
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

        <ButtonPill
          onPress={() => void signOut()}
          variant="neutral"
          leftIcon={ArrowRight}
        >
          Sign out
        </ButtonPill>
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

        <ButtonPill
          disabled={!email || !password}
          isLoading={isSubmitting}
          onPress={() => void signIn({ email: email.trim(), password, flow })}
          leftIcon={ArrowRight}
          elevated
        >
          {isSignUp ? "Create account" : "Sign in"}
        </ButtonPill>
        <Button
          variant="neutral"
          onPress={() => setFlow(isSignUp ? "signIn" : "signUp")}
        >
          {isSignUp ? "I already have an account" : "Create an account"}
        </Button>
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
  heading: { color: theme.colors.foreground, fontSize: theme.font.h4.fontSize, fontWeight: "700" },
  subheading: { color: theme.colors.muted, fontSize: theme.font.lg.fontSize, fontWeight: "500" },
  form: { gap: theme.spacing.md, marginTop: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.surface.elevated,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    width: "100%",
  },
  field: { gap: theme.spacing.xs },
  fieldLabel: { color: theme.colors.muted, fontSize: theme.font.sm.fontSize, fontWeight: "600" },
  fieldValue: { color: theme.colors.foreground, fontFamily: "monospace", fontSize: theme.font.sm.fontSize },
  error: { color: theme.colors.danger.base, fontSize: theme.font.sm.fontSize },
});
